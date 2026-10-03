"""Blender 5.2 raster finishing pipeline for the v2.3 fine-pixel scenes.

Run with Blender, not CPython. Example:

  blender --background --python tools/process-v23-art.py -- \
    --output-dir public/assets/art/v23 --hero hero.png \
    --sleep sleep.png --kitchen kitchen.png --greenhouse greenhouse.png \
    --defense defense.png --workshop workshop.png

The generated image is treated as authored raster. Blender performs a colour-neutral
emission-plane render through an orthographic camera, with a deterministic centred
frame crop and closest sampling. It does not pixelate, quantize, sharpen, dither,
denoise, blur, or add procedural detail. FFmpeg encodes the rendered PNG to lossless
WebP; decoded pixels are verified against the PNG before the report is written.
"""

from __future__ import annotations

import argparse
from array import array
import colorsys
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any

import bpy


WIDTH = 720
HEIGHT = 1280
LOGICAL_WIDTH = 360
LOGICAL_HEIGHT = 640
RUNTIME_LIMIT_BYTES = 20 * 1024 * 1024
SCENES = ("hero", "sleep", "kitchen", "greenhouse", "defense", "workshop")
ROOMS = ("sleep", "kitchen", "greenhouse", "defense", "workshop")
A07_CLIPS = (
    ("sleep", 8), ("turn", 8), ("listen", 8), ("startle", 8),
    ("sit", 8), ("drink", 6), ("settle", 6),
)
COMPOSITION_ANCHORS = {
    "hero": {"head": [0.58, 0.34]},
    "sleep": {"emptyPillow": [0.55, 0.35]},
}


def cli_args() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    for name in SCENES:
        parser.add_argument(f"--{name}")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--python", default="python")
    parser.add_argument("--source-tool", default="image_gen")
    parser.add_argument("--source-model", default=None)
    parser.add_argument("--a07-grid")
    parser.add_argument("--a07-frame-width", type=int, default=192)
    parser.add_argument("--a07-frame-height", type=int, default=192)
    parser.add_argument("--a07-pivot-x", type=float, default=0.5)
    parser.add_argument("--a07-pivot-y", type=float, default=1.0)
    return parser.parse_args(values)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def portable(path: Path, root: Path) -> str:
    return Path(os.path.relpath(path.resolve(), root.resolve())).as_posix()


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.filter_size = 0.01
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def clear_stage() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras):
        for item in list(collection):
            collection.remove(item)


def load_image(path: Path) -> bpy.types.Image:
    image = bpy.data.images.load(str(path.resolve()), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    image.alpha_mode = "STRAIGHT"
    return image


def create_emission_material(name: str, image: bpy.types.Image) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    coordinates = nodes.new("ShaderNodeTexCoord")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    texture.extension = "CLIP"
    material.node_tree.links.new(coordinates.outputs["UV"], texture.inputs["Vector"])
    material.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    return material


def create_alpha_emission_material(name: str, image: bpy.types.Image) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    coordinates = nodes.new("ShaderNodeTexCoord")
    texture = nodes.new("ShaderNodeTexImage")
    mix = nodes.new("ShaderNodeMixShader")
    texture.image = image
    texture.interpolation = "Closest"
    texture.extension = "CLIP"
    material.node_tree.links.new(coordinates.outputs["UV"], texture.inputs["Vector"])
    material.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(texture.outputs["Alpha"], mix.inputs[0])
    material.node_tree.links.new(transparent.outputs[0], mix.inputs[1])
    material.node_tree.links.new(emission.outputs[0], mix.inputs[2])
    material.node_tree.links.new(mix.outputs[0], output.inputs["Surface"])
    return material


def centred_cover_uv(source_width: int, source_height: int) -> tuple[float, float, float, float]:
    source_aspect = source_width / source_height
    target_aspect = WIDTH / HEIGHT
    if source_aspect > target_aspect:
        visible_width = target_aspect / source_aspect
        left = (1.0 - visible_width) / 2.0
        return left, 0.0, 1.0 - left, 1.0
    visible_height = source_aspect / target_aspect
    bottom = (1.0 - visible_height) / 2.0
    return 0.0, bottom, 1.0, 1.0 - bottom


def create_plane(
    material: bpy.types.Material,
    uv: tuple[float, float, float, float],
    width: float = WIDTH,
    height: float = HEIGHT,
    left: float = 0,
    bottom: float = 0,
    name: str = "authored-raster-plane",
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new("authored-raster-plane-mesh")
    mesh.from_pydata([
        (left, bottom, 0), (left + width, bottom, 0),
        (left + width, bottom + height, 0), (left, bottom + height, 0),
    ], [], [(0, 1, 2, 3)])
    mesh.materials.append(material)
    layer = mesh.uv_layers.new(name="UVMap")
    left, bottom, right, top = uv
    for loop, value in zip(layer.data, ((left, bottom), (right, bottom), (right, top), (left, top))):
        loop.uv = value
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def create_camera(width: int = WIDTH, height: int = HEIGHT, name: str = "orthographic-raster-camera") -> None:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.sensor_fit = "VERTICAL"
    data.ortho_scale = height
    camera = bpy.data.objects.new(name, data)
    camera.location = (width / 2, height / 2, 10)
    camera.rotation_euler = (0, 0, 0)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera


def encode_lossless_webp(python: str, png_path: Path, webp_path: Path) -> None:
    command = [
        python, "-c",
        "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGBA'); "
        "im.save(sys.argv[2], format='WEBP', lossless=True, method=6, exact=True)",
        str(png_path), str(webp_path),
    ]
    subprocess.run(command, check=True)


def decode_rgba(ffmpeg: str, image_path: Path, rgba_path: Path) -> bytes:
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(image_path),
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", str(rgba_path),
    ]
    subprocess.run(command, check=True)
    result = rgba_path.read_bytes()
    rgba_path.unlink()
    return result


def render_scene(name: str, source: Path, output_root: Path, ffmpeg: str, python: str) -> dict[str, Any]:
    if not source.is_file():
        raise FileNotFoundError(source)
    source_copy = output_root / "source" / f"{name}-source{source.suffix.lower()}"
    source_copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, source_copy)

    clear_stage()
    image = load_image(source_copy)
    source_dimensions = [int(image.size[0]), int(image.size[1])]
    crop_uv = centred_cover_uv(*source_dimensions)
    material = create_emission_material(f"v23-{name}-emission", image)
    create_plane(material, crop_uv)
    create_camera()

    processed = output_root / "processed" / ("menu" if name == "hero" else "carriages") / f"{name}.png"
    runtime = output_root / ("menu" if name == "hero" else "carriages") / f"{name}.webp"
    processed.parent.mkdir(parents=True, exist_ok=True)
    runtime.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(processed.resolve())
    bpy.ops.render.render(write_still=True)
    encode_lossless_webp(python, processed, runtime)

    png_raw_path = runtime.with_suffix(".verify-png.rgba")
    webp_raw_path = runtime.with_suffix(".verify-webp.rgba")
    png_rgba = decode_rgba(ffmpeg, processed, png_raw_path)
    webp_rgba = decode_rgba(ffmpeg, runtime, webp_raw_path)
    if png_rgba != webp_rgba:
        raise RuntimeError(f"{name}: lossless WebP decoded pixels differ from processed PNG")
    return {
        "assetId": f"v23.{('menu' if name == 'hero' else 'carriages')}.{name}",
        "role": "static-menu-composite" if name == "hero" else "empty-gameplay-background",
        "compositionAnchors": COMPOSITION_ANCHORS.get(name, {}),
        "source": portable(source_copy, output_root),
        "sourceSha256": sha256_file(source_copy),
        "sourceDimensions": source_dimensions,
        "processedPng": portable(processed, output_root),
        "processedPngSha256": sha256_file(processed),
        "runtime": portable(runtime, output_root),
        "runtimeSha256": sha256_file(runtime),
        "runtimeDimensions": [WIDTH, HEIGHT],
        "logicalDimensions": [LOGICAL_WIDTH, LOGICAL_HEIGHT],
        "runtimeScale": 2,
        "frameCrop": {"mode": "center-cover", "uv": [round(value, 8) for value in crop_uv]},
        "sampling": "Closest",
        "webpEncoding": "lossless-libwebp-via-pillow",
        "decodedPixelsExact": True,
        "runtimeBytes": runtime.stat().st_size,
    }


def linear_to_srgb(value: float) -> float:
    return 12.92 * value if value <= 0.0031308 else 1.055 * (value ** (1 / 2.4)) - 0.055


def image_pixels(image: bpy.types.Image) -> array:
    pixels = array("f", [0.0]) * (int(image.size[0]) * int(image.size[1]) * 4)
    image.pixels.foreach_get(pixels)
    return pixels


def remove_spill_to_alpha(image: bpy.types.Image) -> dict[str, int]:
    """Bake the explicit sRGB spill predicates into alpha; source stays untouched."""
    pixels = image_pixels(image)
    red = yellow = 0
    for index in range(0, len(pixels), 4):
        if pixels[index + 3] <= 0:
            continue
        r, g, b = (linear_to_srgb(max(0.0, min(1.0, pixels[index + channel]))) for channel in range(3))
        pure_red = r > 0.85 and g < 0.25 and b < 0.20
        lemon_yellow = r > 0.75 and g > 0.75 and b < 0.18
        if pure_red or lemon_yellow:
            red += int(pure_red)
            yellow += int(lemon_yellow)
            pixels[index + 3] = 0.0
    image.pixels.foreach_set(pixels)
    image.update()
    return {"pureRedPixelsRemoved": red, "lemonYellowPixelsRemoved": yellow, "totalPixelsRemoved": red + yellow}


def component_anchor(
    pixels: array,
    image_width: int,
    image_height: int,
    box: tuple[int, int, int, int],
    kind: str,
) -> dict[str, Any] | None:
    x0, y0, x1, y1 = box
    frame_width, frame_height = x1 - x0, y1 - y0
    candidates: set[tuple[int, int]] = set()
    roi_left, roi_right = int(frame_width * 0.18), int(frame_width * 0.86)
    roi_top, roi_bottom = int(frame_height * 0.03), int(frame_height * 0.62)
    for local_y in range(roi_top, roi_bottom):
        source_y = y0 + local_y
        pixel_y = image_height - 1 - source_y
        for local_x in range(roi_left, roi_right):
            source_x = x0 + local_x
            index = (pixel_y * image_width + source_x) * 4
            if pixels[index + 3] <= 0.25:
                continue
            rgb = [linear_to_srgb(max(0.0, min(1.0, pixels[index + channel]))) for channel in range(3)]
            hue, saturation, value = colorsys.rgb_to_hsv(*rgb)
            if kind == "face":
                selected = (hue < 0.105 or hue > 0.98) and 0.25 < saturation < 0.78 and 0.45 < value < 1.0
            else:
                selected = (hue < 0.13 or hue > 0.96) and 0.22 < saturation < 0.90 and 0.06 < value < 0.60
            if selected:
                candidates.add((local_x, local_y))
    components: list[list[tuple[int, int]]] = []
    while candidates:
        seed = candidates.pop()
        queue = [seed]
        points = [seed]
        while queue:
            x, y = queue.pop()
            for neighbor in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if neighbor in candidates:
                    candidates.remove(neighbor)
                    queue.append(neighbor)
                    points.append(neighbor)
        if len(points) >= 12:
            components.append(points)
    if not components:
        return None
    points = max(components, key=len)
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return {
        "pixels": len(points),
        "centroid": [round(sum(xs) / len(xs), 4), round(sum(ys) / len(ys), 4)],
        "bounds": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
    }


def frame_source_box(column: int, row: int, width: int, height: int) -> tuple[int, int, int, int]:
    return (
        column * width // 8,
        row * height // 7,
        (column + 1) * width // 8,
        (row + 1) * height // 7,
    )


def placement_for_frame(
    source_box: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    translation: tuple[int, int],
) -> tuple[float, float, float, float, float]:
    source_width = source_box[2] - source_box[0]
    source_height = source_box[3] - source_box[1]
    scale = min(frame_width / source_width, frame_height / source_height)
    plane_width, plane_height = source_width * scale, source_height * scale
    left = (frame_width - plane_width) / 2 + translation[0]
    bottom = (frame_height - plane_height) / 2 - translation[1]
    return left, bottom, plane_width, plane_height, scale


def raw_frame(raw: bytes, sheet_width: int, frame_width: int, frame_height: int, column: int) -> bytes:
    result = bytearray()
    left = column * frame_width * 4
    right = (column + 1) * frame_width * 4
    row_stride = sheet_width * 4
    for row in range(frame_height):
        start = row * row_stride
        result.extend(raw[start + left:start + right])
    return bytes(result)


def spill_count_rgba(raw: bytes) -> dict[str, int]:
    red = yellow = 0
    for index in range(0, len(raw), 4):
        if raw[index + 3] == 0:
            continue
        r, g, b = (raw[index + channel] / 255 for channel in range(3))
        pure_red = r > 0.85 and g < 0.25 and b < 0.20
        lemon_yellow = r > 0.75 and g > 0.75 and b < 0.18
        red += int(pure_red)
        yellow += int(lemon_yellow)
    return {"pureRedVisiblePixels": red, "lemonYellowVisiblePixels": yellow, "totalVisibleSpillPixels": red + yellow}


def variance(values: list[float]) -> float:
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    return round(sum((value - mean) ** 2 for value in values) / len(values), 6)


def render_a07_clips(args: argparse.Namespace, output_root: Path) -> dict[str, Any] | None:
    if not args.a07_grid:
        return None
    source = Path(args.a07_grid)
    if not source.is_file():
        raise FileNotFoundError(source)
    frame_width, frame_height = args.a07_frame_width, args.a07_frame_height
    if frame_width <= 0 or frame_height <= 0:
        raise ValueError("A-07 frame dimensions must be positive")
    destination = output_root / "source" / f"a07-atlas-source{source.suffix.lower()}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)

    analysis_image = load_image(destination)
    source_width, source_height = map(int, analysis_image.size)
    source_pixels = image_pixels(analysis_image)
    measurements: dict[tuple[int, int], dict[str, Any]] = {}
    for row, (_, count) in enumerate(A07_CLIPS):
        for column in range(count):
            box = frame_source_box(column, row, source_width, source_height)
            measurements[(row, column)] = {
                "face": component_anchor(source_pixels, source_width, source_height, box, "face"),
                "head": component_anchor(source_pixels, source_width, source_height, box, "head"),
            }
    bpy.data.images.remove(analysis_image)

    sleep_faces = [measurements[(0, column)]["face"] for column in range(8)]
    if any(anchor is None for anchor in sleep_faces):
        raise RuntimeError("All eight sleep frames require a measurable face anchor")
    mapped_sleep: list[tuple[float, float]] = []
    for column, anchor in enumerate(sleep_faces):
        box = frame_source_box(column, 0, source_width, source_height)
        left, _, _, _, scale = placement_for_frame(box, frame_width, frame_height, (0, 0))
        top = (frame_height - (box[3] - box[1]) * scale) / 2
        mapped_sleep.append((left + anchor["centroid"][0] * scale, top + anchor["centroid"][1] * scale))
    target_face = [round(sum(point[axis] for point in mapped_sleep) / len(mapped_sleep)) for axis in (0, 1)]
    sleep_translations = [
        (round(target_face[0] - point[0]), round(target_face[1] - point[1]))
        for point in mapped_sleep
    ]

    clips: list[dict[str, Any]] = []
    all_true_hashes: list[str] = []
    total_cleanup = {"pureRedPixelsRemoved": 0, "lemonYellowPixelsRemoved": 0, "totalPixelsRemoved": 0}
    for row, (clip_id, frame_count) in enumerate(A07_CLIPS):
        clear_stage()
        image = load_image(destination)
        cleanup = remove_spill_to_alpha(image)
        if row == 0:
            total_cleanup = cleanup
        material = create_alpha_emission_material(f"v23-a07-{clip_id}-alpha-emission", image)
        frame_metadata = []
        for column in range(frame_count):
            box = frame_source_box(column, row, source_width, source_height)
            translation = sleep_translations[column] if row == 0 else (0, 0)
            left_in_cell, bottom, plane_width, plane_height, scale = placement_for_frame(
                box, frame_width, frame_height, translation,
            )
            left = column * frame_width + left_in_cell
            uv = (
                box[0] / source_width,
                1 - box[3] / source_height,
                box[2] / source_width,
                1 - box[1] / source_height,
            )
            create_plane(
                material, uv, plane_width, plane_height, left, bottom,
                f"a07-{clip_id}-{column:02d}",
            )
            frame_metadata.append({
                "frame": column,
                "sourceBox": list(box),
                "sourceFaceAnchor": measurements[(row, column)]["face"],
                "sourceHeadAnchor": measurements[(row, column)]["head"],
                "scale": round(scale, 8),
                "pixelTranslation": list(translation),
            })
        clip_width = frame_width * 8
        scene = bpy.context.scene
        scene.render.resolution_x = clip_width
        scene.render.resolution_y = frame_height
        scene.render.resolution_percentage = 100
        create_camera(clip_width, frame_height, f"a07-{clip_id}-camera")
        processed = output_root / "processed" / "a07-clips" / f"{clip_id}.png"
        runtime = output_root / "a07-clips" / f"{clip_id}.webp"
        processed.parent.mkdir(parents=True, exist_ok=True)
        runtime.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(processed.resolve())
        bpy.ops.render.render(write_still=True)
        encode_lossless_webp(args.python, processed, runtime)
        png_raw_path = runtime.with_suffix(".verify-png.rgba")
        webp_raw_path = runtime.with_suffix(".verify-webp.rgba")
        png_raw = decode_rgba(args.ffmpeg, processed, png_raw_path)
        webp_raw = decode_rgba(args.ffmpeg, runtime, webp_raw_path)
        if png_raw != webp_raw:
            raise RuntimeError(f"A-07 {clip_id}: lossless WebP decoded pixels differ from processed PNG")
        spill = spill_count_rgba(png_raw)
        if spill["totalVisibleSpillPixels"] != 0:
            raise RuntimeError(f"A-07 {clip_id}: visible spill remains: {spill}")
        frame_hashes = []
        for column in range(frame_count):
            rgba = raw_frame(png_raw, clip_width, frame_width, frame_height, column)
            digest = hashlib.sha256(rgba).hexdigest()
            frame_hashes.append(digest)
            all_true_hashes.append(digest)
            frame_metadata[column]["processedRgbaSha256"] = digest
        empty_columns = []
        for column in range(frame_count, 8):
            rgba = raw_frame(png_raw, clip_width, frame_width, frame_height, column)
            if any(rgba[index + 3] for index in range(0, len(rgba), 4)):
                raise RuntimeError(f"A-07 {clip_id}: unused column {column} is not transparent")
            empty_columns.append(column)
        clips.append({
            "clipId": clip_id,
            "sourceRow": row,
            "frameCount": frame_count,
            "columns": 8,
            "frameDimensions": [frame_width, frame_height],
            "dimensions": [clip_width, frame_height],
            "processedPng": portable(processed, output_root),
            "processedPngSha256": sha256_file(processed),
            "runtime": portable(runtime, output_root),
            "runtimeSha256": sha256_file(runtime),
            "runtimeBytes": runtime.stat().st_size,
            "decodedPixelsExact": True,
            "visibleSpill": spill,
            "unusedTransparentColumns": empty_columns,
            "frames": frame_metadata,
        })

    if len(all_true_hashes) != 52 or len(set(all_true_hashes)) != 52:
        raise RuntimeError(f"A-07 requires 52 unique true frames, got {len(set(all_true_hashes))}/{len(all_true_hashes)}")
    before_x = [point[0] for point in mapped_sleep]
    before_y = [point[1] for point in mapped_sleep]
    after_x = [point[0] + translation[0] for point, translation in zip(mapped_sleep, sleep_translations)]
    after_y = [point[1] + translation[1] for point, translation in zip(mapped_sleep, sleep_translations)]
    report = {
        "schemaVersion": 1,
        "source": portable(destination, output_root),
        "sourceSha256": sha256_file(destination),
        "sourceDimensions": [source_width, source_height],
        "sourceTool": args.source_tool,
        "sourceModelIdentifier": args.source_model,
        "grid": [8, 7],
        "rowBoundaryFormula": f"floor(row * {source_height} / 7)",
        "columnBoundaryFormula": f"floor(column * {source_width} / 8)",
        "trueFrameCount": 52,
        "allTrueFrameHashesUnique": True,
        "unusedCells": [46, 47, 54, 55],
        "frameDimensions": [frame_width, frame_height],
        "clipDimensions": [frame_width * 8, frame_height],
        "sheetDimensions": [frame_width * 8, frame_height * 7],
        "pivot": [args.a07_pivot_x, args.a07_pivot_y],
        "bedAnchorPixels": [round(args.a07_pivot_x * frame_width), round(args.a07_pivot_y * frame_height)],
        "order": "row-major",
        "spillRemoval": {
            "method": "Blender image-datablock sRGB predicate baked to alpha, then transparent/emission material",
            "pureRedPredicate": "R > 0.85 && G < 0.25 && B < 0.20",
            "lemonYellowPredicate": "R > 0.75 && G > 0.75 && B < 0.18",
            **total_cleanup,
            "visibleSpillPixelsAfter": 0,
        },
        "headMeasurement": {
            "method": "largest connected HSV component inside per-frame upper ROI; sleep face uses skin HSV, all frames also store dark-hair head component",
            "sleepCommonFaceAnchorPixels": target_face,
            "sleepCommonFaceAnchorNormalized": [round(target_face[0] / frame_width, 8), round(target_face[1] / frame_height, 8)],
            "sleepFaceVarianceBefore": [variance(before_x), variance(before_y)],
            "sleepFaceVarianceAfter": [variance(after_x), variance(after_y)],
            "alignmentScope": "sleep clip only",
        },
        "clips": clips,
        "runtimeBytes": sum(int(clip["runtimeBytes"]) for clip in clips),
    }
    manifest_path = output_root / "a07-clips" / "manifest.json"
    manifest_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    docs_report = Path("docs/reboot-v23/A07_ALIGNMENT_REPORT.json")
    docs_report.parent.mkdir(parents=True, exist_ok=True)
    docs_report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    clear_stage()
    proof_image = load_image(destination)
    remove_spill_to_alpha(proof_image)
    proof_material = create_alpha_emission_material("v23-a07-proof-alpha-emission", proof_image)
    create_plane(proof_material, (0, 0, 1, 1), source_width, source_height, name="v23-a07-source-proof")
    create_camera(source_width, source_height, "v23-a07-proof-camera")
    bpy.context.scene["purpose"] = "v2.3 A-07 8x7 source and alpha-spill finishing proof"
    bpy.context.scene["trueFrameCount"] = 52
    bpy.ops.wm.save_as_mainfile(filepath=str((output_root / "v23-a07-pipeline.blend").resolve()))
    return report


def build_pipeline_proof_scene(output_root: Path, assets: list[dict[str, Any]]) -> None:
    """Keep all six authored sources inspectable in the saved native .blend."""
    clear_stage()
    for index, asset in enumerate(assets):
        source = output_root / str(asset["source"])
        image = load_image(source)
        material = create_emission_material(f"{asset['assetId']}-proof-emission", image)
        uv = tuple(float(value) for value in asset["frameCrop"]["uv"])
        create_plane(material, uv)
        plane = bpy.context.collection.objects[-1]
        plane.name = f"{asset['assetId']}-proof-plane"
        plane.location.x = (index % 2) * WIDTH
        plane.location.y = (index // 2) * HEIGHT
        plane["assetId"] = str(asset["assetId"])
        plane["sourceSha256"] = str(asset["sourceSha256"])

    data = bpy.data.cameras.new("v23-six-source-proof-camera")
    data.type = "ORTHO"
    data.ortho_scale = HEIGHT * 3
    camera = bpy.data.objects.new("v23-six-source-proof-camera", data)
    camera.location = (WIDTH, HEIGHT * 1.5, 10)
    camera.rotation_euler = (0, 0, 0)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    bpy.context.scene["purpose"] = "v2.3 six-source Blender finishing proof scene"
    bpy.context.scene["runtimeOutputDimensions"] = f"{WIDTH}x{HEIGHT}"
    bpy.context.scene["sampling"] = "Closest"


def main() -> None:
    args = cli_args()
    output_root = Path(args.output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    configure_scene()
    supplied = [(name, getattr(args, name)) for name in SCENES if getattr(args, name)]
    if not supplied:
        raise ValueError("At least one of --hero/--sleep/--kitchen/--greenhouse/--defense/--workshop is required")
    assets = [render_scene(name, Path(value), output_root, args.ffmpeg, args.python) for name, value in supplied]
    grid = render_a07_clips(args, output_root)
    scene_runtime_bytes = sum(int(asset["runtimeBytes"]) for asset in assets)
    runtime_bytes = scene_runtime_bytes + (int(grid["runtimeBytes"]) if grid else 0)
    report = {
        "schemaVersion": 1,
        "release": "2.3.0",
        "pipeline": "Blender 5.2 native emission-plane orthographic raster finishing",
        "blenderVersion": bpy.app.version_string,
        "sourceTool": args.source_tool,
        "sourceModelIdentifier": args.source_model,
        "artAuthorship": "source-image-generated; Blender finishing does not author replacement art",
        "processing": {
            "viewTransform": "Standard",
            "look": "None",
            "exposure": 0,
            "gamma": 1,
            "sampling": "Closest",
            "renderFilterSize": 0.01,
            "frameCrop": "center-cover",
            "pixelation": False,
            "quantization": False,
            "sharpening": False,
            "dithering": False,
            "denoising": False,
            "artificialNoise": False,
        },
        "runtimeBytes": runtime_bytes,
        "sceneRuntimeBytes": scene_runtime_bytes,
        "runtimeLimitBytes": RUNTIME_LIMIT_BYTES,
        "runtimeLimitPass": runtime_bytes <= RUNTIME_LIMIT_BYTES,
        "assets": assets,
        "a07GridContract": grid,
    }
    report_path = output_root / "pipeline-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    build_pipeline_proof_scene(output_root, assets)
    blend_path = output_root / "v23-art-pipeline.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path.resolve()))
    print(json.dumps({"report": str(report_path), "blend": str(blend_path), "runtimeBytes": runtime_bytes}))


if __name__ == "__main__":
    main()
