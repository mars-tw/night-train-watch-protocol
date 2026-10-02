"""Blender 5.2 raster pipeline for the v2.1 image-animation refresh.

Run with Blender (not CPython):

  blender --background --python tools/process-v21-art.py -- \
    --output-dir public/assets/art/v21 --icons <png> --props <png> \
    --effects <png> --maps <png>

Every runtime image is rendered through an orthographic camera from an
emission material on one or more image planes.  Atlas planes use fixed UV
crops, so cell order cannot drift.  Sources with alpha keep it; the pipeline
does not key, infer, or remove a background colour.
"""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys
from typing import Iterable

import bpy


MIB = 1024 * 1024
RUNTIME_LIMIT = 3 * MIB
DEFAULT_CARRIAGE_ROOT = Path("public/assets/art/v2/source")
EFFECT_FRAME_ORDER = [
    "rain", "frost", "mist", "spores",
    "steam-0", "steam-1", "steam-2", "steam-3",
    "flame-0", "flame-1", "flame-2", "flame-3",
    "leaf-0", "leaf-1", "leaf-2", "leaf-3",
]


def cli_args() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--icons", required=True)
    parser.add_argument("--props", required=True)
    parser.add_argument("--effects", required=True)
    parser.add_argument("--maps", required=True)
    parser.add_argument("--draft-icons")
    parser.add_argument("--draft-props")
    parser.add_argument("--draft-effects")
    parser.add_argument("--carriage-root", default=str(DEFAULT_CARRIAGE_ROOT))
    parser.add_argument("--webp-quality", type=int, default=92)
    return parser.parse_args(values)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(MIB), b""):
            digest.update(chunk)
    return digest.hexdigest()


def report_path(path: Path, output_root: Path) -> str:
    """Return a portable path resolved from the v21 asset root."""
    return Path(os.path.relpath(path.resolve(), output_root.resolve())).as_posix()


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.filter_size = 1.25


def clear_stage() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def create_material(name: str, image: bpy.types.Image, interpolation: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    mix = nodes.new("ShaderNodeMixShader")
    texture.image = image
    texture.interpolation = interpolation
    texture.extension = "CLIP"
    material.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(texture.outputs["Alpha"], mix.inputs[0])
    material.node_tree.links.new(transparent.outputs[0], mix.inputs[1])
    material.node_tree.links.new(emission.outputs[0], mix.inputs[2])
    material.node_tree.links.new(mix.outputs[0], output.inputs["Surface"])
    return material


def create_solid_material(name: str, hex_color: str) -> bpy.types.Material:
    channels = [int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
              for channel in channels]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*linear, 1.0)
    material.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    return material


def add_plane(
    name: str,
    material: bpy.types.Material,
    left: float,
    top: float,
    right: float,
    bottom: float,
    uv_left: float,
    uv_top: float,
    uv_right: float,
    uv_bottom: float,
) -> bpy.types.Object:
    # Scene coordinates are centred, with +Y upwards. UV V is bottom-up.
    vertices = [(left, -bottom, 0), (right, -bottom, 0), (right, -top, 0), (left, -top, 0)]
    mesh = bpy.data.meshes.new(f"{name}-mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.materials.append(material)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    uv_values = [
        (uv_left, uv_bottom), (uv_right, uv_bottom),
        (uv_right, uv_top), (uv_left, uv_top),
    ]
    for loop, uv in zip(uv_layer.data, uv_values):
        loop.uv = uv
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def add_camera(width: int, height: int) -> None:
    camera_data = bpy.data.cameras.new("orthographic-raster-camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = height
    camera = bpy.data.objects.new("orthographic-raster-camera", camera_data)
    camera.location = (width / 2, -height / 2, 10)
    camera.rotation_euler = (0, 0, 0)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera


def load_image(path: Path) -> bpy.types.Image:
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    image.alpha_mode = "STRAIGHT"
    return image


def clear_near_transparent_rgb(image: bpy.types.Image, alpha_byte_cutoff: int = 2) -> int:
    """Clear only practically invisible alpha<=2 pixels; never inspect colour."""
    width, height = image.size
    pixels = array("f", [0.0]) * (width * height * 4)
    image.pixels.foreach_get(pixels)
    cutoff = alpha_byte_cutoff / 255
    cleared = 0
    for index in range(0, len(pixels), 4):
        if pixels[index + 3] <= cutoff and any(pixels[index + channel] != 0 for channel in range(4)):
            pixels[index] = pixels[index + 1] = pixels[index + 2] = pixels[index + 3] = 0
            cleared += 1
    if cleared:
        image.pixels.foreach_set(pixels)
        image.update()
    return cleared


def read_pixels(path: Path) -> tuple[int, int, array]:
    image = load_image(path)
    width, height = image.size
    pixels = array("f", [0.0]) * (width * height * 4)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return width, height, pixels


def alpha_metrics(pixels: array) -> dict[str, object]:
    total = len(pixels) // 4
    transparent = translucent = opaque = 0
    minimum = 1.0
    maximum = 0.0
    for index in range(3, len(pixels), 4):
        alpha = pixels[index]
        minimum = min(minimum, alpha)
        maximum = max(maximum, alpha)
        if alpha <= 1 / 255:
            transparent += 1
        elif alpha >= 254 / 255:
            opaque += 1
        else:
            translucent += 1
    return {
        "transparentPixels": transparent,
        "translucentPixels": translucent,
        "opaquePixels": opaque,
        "transparentRatio": round(transparent / total, 6),
        "alphaRange": [round(minimum, 6), round(maximum, 6)],
    }


def color_metrics(pixels: array) -> dict[str, object]:
    luminance_sum = saturation_sum = 0.0
    visible = 0
    for index in range(0, len(pixels), 4):
        if pixels[index + 3] <= 1 / 255:
            continue
        red, green, blue = pixels[index:index + 3]
        luminance_sum += 0.2126 * red + 0.7152 * green + 0.0722 * blue
        maximum = max(red, green, blue)
        minimum = min(red, green, blue)
        saturation_sum += 0 if maximum <= 0 else (maximum - minimum) / maximum
        visible += 1
    return {
        "sampledVisiblePixels": visible,
        "meanLinearLuminance": round(luminance_sum / max(1, visible), 6),
        "meanRgbSaturation": round(saturation_sum / max(1, visible), 6),
    }


def readback_metrics(png_path: Path, webp_path: Path) -> dict[str, object]:
    pw, ph, png = read_pixels(png_path)
    ww, wh, webp = read_pixels(webp_path)
    if (pw, ph) != (ww, wh):
        raise RuntimeError(f"Readback dimensions differ: {(pw, ph)} != {(ww, wh)}")
    alpha_max = rgb_max = 0.0
    alpha_sum = rgb_sum = 0.0
    visible = 0
    for index in range(0, len(png), 4):
        alpha_delta = abs(png[index + 3] - webp[index + 3])
        alpha_max = max(alpha_max, alpha_delta)
        alpha_sum += alpha_delta
        if png[index + 3] > 1 / 255:
            visible += 1
            for channel in range(3):
                delta = abs(png[index + channel] - webp[index + channel])
                rgb_max = max(rgb_max, delta)
                rgb_sum += delta
    pixels = pw * ph
    return {
        "dimensionsExact": True,
        "alphaMeanAbsoluteError": round(alpha_sum / pixels, 8),
        "alphaMaxAbsoluteError": round(alpha_max, 8),
        "visibleRgbMeanAbsoluteError": round(rgb_sum / max(1, visible * 3), 8),
        "visibleRgbMaxAbsoluteError": round(rgb_max, 8),
        "decodedAlpha": alpha_metrics(webp),
    }


def cell_metrics(path: Path, columns: int, rows: int, labels: Iterable[str]) -> list[dict[str, object]]:
    width, height, pixels = read_pixels(path)
    result = []
    names = list(labels)
    for row in range(rows):
        for column in range(columns):
            left = math.floor(column * width / columns)
            right = math.floor((column + 1) * width / columns)
            top = math.floor(row * height / rows)
            bottom = math.floor((row + 1) * height / rows)
            opaque = visible = 0
            cell_rgba = bytearray()
            for canvas_y in range(top, bottom):
                pixel_y = height - 1 - canvas_y
                for x in range(left, right):
                    pixel_index = (pixel_y * width + x) * 4
                    channels = pixels[pixel_index:pixel_index + 4]
                    cell_rgba.extend(round(max(0.0, min(1.0, channel)) * 255) for channel in channels)
                    alpha = channels[3]
                    if alpha > 1 / 255:
                        visible += 1
                    if alpha >= 254 / 255:
                        opaque += 1
            index = row * columns + column
            result.append({
                "index": index,
                "name": names[index],
                "cell": [left, top, right - left, bottom - top],
                "visiblePixels": visible,
                "opaquePixels": opaque,
                "alphaOccupancyRatio": round(visible / ((right - left) * (bottom - top)), 6),
                "rgbaSha256": hashlib.sha256(cell_rgba).hexdigest(),
            })
    return result


def render_asset(
    asset_id: str,
    source_path: Path,
    output_root: Path,
    png_relative: Path,
    webp_relative: Path,
    width: int,
    height: int,
    columns: int,
    rows: int,
    labels: list[str],
    interpolation: str,
    quality: int,
    source_copy: bool,
    alpha_required: bool,
    background_hex: str | None = None,
    source_cell_bottom_trim: float = 0.0,
) -> dict[str, object]:
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    source_report_path = source_path
    if source_copy:
        source_report_path = output_root / "source" / f"{asset_id.replace('.', '-')}-source.png"
        source_report_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, source_report_path)

    clear_stage()
    image = load_image(source_path)
    source_width, source_height = image.size
    source_cell_aspect = (source_width / columns) / ((source_height / rows) * (1 - source_cell_bottom_trim))
    cleared_near_transparent_pixels = clear_near_transparent_rgb(image) if alpha_required else 0
    material = create_material(f"{asset_id}-material", image, interpolation)
    background_material = create_solid_material(f"{asset_id}-background", background_hex) if background_hex else None
    for row in range(rows):
        for column in range(columns):
            target_left = column * width / columns
            target_right = (column + 1) * width / columns
            target_top = row * height / rows
            target_bottom = (row + 1) * height / rows
            target_cell_width = target_right - target_left
            target_cell_height = target_bottom - target_top
            target_cell_aspect = target_cell_width / target_cell_height
            if source_cell_aspect > target_cell_aspect:
                plane_width = target_cell_width
                plane_height = plane_width / source_cell_aspect
            else:
                plane_height = target_cell_height
                plane_width = plane_height * source_cell_aspect
            left = target_left + (target_cell_width - plane_width) / 2
            right = left + plane_width
            top = target_top + (target_cell_height - plane_height) / 2
            bottom = top + plane_height
            if background_material:
                background = add_plane(
                    f"{asset_id}-background-{row:02d}-{column:02d}", background_material,
                    target_left, target_top, target_right, target_bottom,
                    0, 1, 1, 0,
                )
                background.location.z = -0.01
            add_plane(
                f"{asset_id}-cell-{row:02d}-{column:02d}", material,
                left, top, right, bottom,
                column / columns, 1 - row / rows,
                (column + 1) / columns, 1 - (row + 1 - source_cell_bottom_trim) / rows,
            )
    add_camera(width, height)
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    png_path = output_root / png_relative
    webp_path = output_root / webp_relative
    png_path.parent.mkdir(parents=True, exist_ok=True)
    webp_path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(png_path)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    bpy.ops.render.render(write_still=True)
    scene.render.filepath = str(webp_path)
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = quality
    bpy.data.images["Render Result"].save_render(str(webp_path), scene=scene)

    sw, sh, source_pixels = read_pixels(source_report_path)
    _, _, processed_pixels = read_pixels(png_path)
    source_alpha = alpha_metrics(source_pixels)
    processed_alpha = alpha_metrics(processed_pixels)
    source_color = color_metrics(source_pixels)
    processed_color = color_metrics(processed_pixels)
    if alpha_required and processed_alpha["transparentPixels"] == 0:
        raise RuntimeError(f"{asset_id} must retain real transparent pixels; no colour-key removal is allowed")
    frames = cell_metrics(png_path, columns, rows, labels)
    if any(frame["visiblePixels"] == 0 for frame in frames):
        empty = [frame["index"] for frame in frames if frame["visiblePixels"] == 0]
        raise RuntimeError(f"{asset_id} has empty fixed cells: {empty}")
    hashes = [str(frame["rgbaSha256"]) for frame in frames]
    duplicate_groups = sorted({value for value in hashes if hashes.count(value) > 1})
    if duplicate_groups:
        duplicate_indices = [[index for index, value in enumerate(hashes) if value == duplicate]
                             for duplicate in duplicate_groups]
        raise RuntimeError(f"{asset_id} contains duplicate rendered cells: {duplicate_indices}")
    readback = readback_metrics(png_path, webp_path)
    bpy.context.scene[f"asset_{asset_id.replace('.', '_')}"] = str(webp_path)
    return {
        "assetId": asset_id,
        "source": report_path(source_report_path, output_root),
        "sourceSha256": sha256_file(source_report_path),
        "processedPng": png_relative.as_posix(),
        "processedPngSha256": sha256_file(png_path),
        "runtime": webp_relative.as_posix(),
        "runtimeSha256": sha256_file(webp_path),
        "sourceDimensions": [sw, sh],
        "runtimeDimensions": [width, height],
        "grid": [columns, rows],
        "sourceCellAspect": round(source_cell_aspect, 8),
        "cellPlacement": "aspect-fit-center",
        "iconsOpaqueTiles": bool(background_hex) if asset_id == "v21.ui.icon-atlas" else None,
        "tileBackground": background_hex,
        "sourceCellBottomTrimFraction": source_cell_bottom_trim,
        "frameCount": columns * rows,
        "frameOrder": labels,
        "interpolation": interpolation,
        "sourceAlpha": source_alpha,
        "processedAlpha": processed_alpha,
        "nearTransparentAlphaByteCutoff": 2 if alpha_required else None,
        "clearedNearTransparentPixels": cleared_near_transparent_pixels,
        "sourceColor": source_color,
        "processedColor": processed_color,
        "meanLuminanceRatio": round(
            processed_color["meanLinearLuminance"] / max(0.000001, source_color["meanLinearLuminance"]), 6
        ),
        "readback": readback,
        "processedPngBytes": png_path.stat().st_size,
        "runtimeBytes": webp_path.stat().st_size,
        "cells": frames,
        "allFrameHashesUnique": True,
    }


def render_platform_icon(source_path: Path, output_root: Path, size: int) -> dict[str, object]:
    """Render a square app icon from the sleep plate without drawn overlays."""
    clear_stage()
    image = load_image(source_path)
    source_width, source_height = image.size
    crop_side = min(source_width, source_height)
    crop_left = (source_width - crop_side) / 2
    # Bed, desk lamp, woodwork and central door remain legible at 192 px.
    crop_top = min(source_height - crop_side, round(source_height * 0.235))
    material = create_material(f"v21-app-icon-{size}-material", image, "Linear")
    add_plane(
        f"v21-app-icon-{size}-plane", material,
        0, 0, size, size,
        crop_left / source_width,
        1 - crop_top / source_height,
        (crop_left + crop_side) / source_width,
        1 - (crop_top + crop_side) / source_height,
    )
    add_camera(size, size)
    scene = bpy.context.scene
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    path = output_root / "ui" / f"app-icon-{size}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    bpy.ops.render.render(write_still=True)
    width, height, pixels = read_pixels(path)
    return {
        "assetId": f"v21.platform.app-icon-{size}",
        "source": report_path(source_path, output_root),
        "sourceSha256": sha256_file(source_path),
        "runtime": f"ui/app-icon-{size}.png",
        "runtimeSha256": sha256_file(path),
        "runtimeDimensions": [width, height],
        "cropPixelsTopDown": [round(crop_left), crop_top, crop_side, crop_side],
        "interpolation": "Linear",
        "alpha": alpha_metrics(pixels),
        "color": color_metrics(pixels),
        "bytes": path.stat().st_size,
    }


def main() -> None:
    args = cli_args()
    if not 0 <= args.webp_quality <= 100:
        raise ValueError("--webp-quality must be between 0 and 100")
    output_root = Path(args.output_dir).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    source_dir = output_root / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    for kind in ("icons", "props", "effects"):
        draft_value = getattr(args, f"draft_{kind}")
        if draft_value:
            draft_path = Path(draft_value).resolve()
            if not draft_path.is_file():
                raise FileNotFoundError(draft_path)
            shutil.copy2(draft_path, source_dir / f"v21-{kind}-draft.png")
    configure_scene()
    assets: list[dict[str, object]] = []

    carriage_root = Path(args.carriage_root).resolve()
    for carriage in ("sleep", "defense", "workshop", "greenhouse", "kitchen"):
        assets.append(render_asset(
            f"v21.carriage.{carriage}", carriage_root / f"carriage-{carriage}-source.png",
            output_root, Path("processed/carriages") / f"{carriage}.png",
            Path("carriages") / f"{carriage}.webp", 720, 1280, 1, 1,
            [carriage], "Linear", args.webp_quality, False, False,
        ))

    darker_carriages = [
        asset["assetId"] for asset in assets
        if float(asset["meanLuminanceRatio"]) < 0.99
    ]
    if darker_carriages:
        raise RuntimeError(f"Carriage render is materially darker than source: {darker_carriages}")

    assets.extend([
        render_asset("v21.ui.icon-atlas", Path(args.icons).resolve(), output_root,
                     Path("processed/ui/icon-atlas.png"), Path("ui/icon-atlas.webp"),
                     512, 1024, 4, 8, [f"icon-{i:02d}" for i in range(32)],
                     "Linear", args.webp_quality, True, False, "#3B281D", 0.10),
        render_asset("v21.props.atlas", Path(args.props).resolve(), output_root,
                     Path("processed/props/atlas.png"), Path("props/atlas.webp"),
                     512, 512, 4, 4, [f"prop-{i:02d}" for i in range(16)],
                     "Linear", args.webp_quality, True, True),
        render_asset("v21.effects.atlas", Path(args.effects).resolve(), output_root,
                     Path("processed/effects/atlas.png"), Path("effects/atlas.webp"),
                     512, 512, 4, 4, EFFECT_FRAME_ORDER,
                     "Linear", args.webp_quality, True, True),
        render_asset("v21.ui.maps", Path(args.maps).resolve(), output_root,
                     Path("processed/ui/maps.png"), Path("ui/maps.webp"),
                     768, 512, 2, 1, ["route-map", "technical-map"],
                     "Linear", args.webp_quality, True, False),
    ])

    sleep_source = carriage_root / "carriage-sleep-source.png"
    platform_icons = [render_platform_icon(sleep_source, output_root, size) for size in (192, 512)]

    runtime_bytes = sum(int(asset["runtimeBytes"]) for asset in assets)
    if runtime_bytes > RUNTIME_LIMIT:
        raise RuntimeError(
            f"Runtime art is {runtime_bytes / MIB:.3f} MiB; limit is {RUNTIME_LIMIT / MIB:.3f} MiB. "
            "Rerun with a lower --webp-quality."
        )
    report = {
        "schemaVersion": 1,
        "pipeline": "v21-blender-image-plane-material-orthographic-render",
        "blenderVersion": bpy.app.version_string,
        "renderEngine": bpy.context.scene.render.engine,
        "sourceTool": "OpenAI built-in image generation tool (four new sheets); existing v2 source PNGs (five carriage plates)",
        "sourceModelIdentifier": None,
        "backgroundRemoval": "no colour-key masking; alpha <= 2/255 cleared; icons composited onto opaque warm tiles",
        "sampling": "linear image texture; Standard view transform; no quantization, nearest sampling, dithering, or colour grading",
        "webpQuality": args.webp_quality,
        "runtimeLimitBytes": RUNTIME_LIMIT,
        "runtimeBytes": runtime_bytes,
        "runtimeMiB": round(runtime_bytes / MIB, 3),
        "runtimeLimitPass": runtime_bytes <= RUNTIME_LIMIT,
        "assetCount": len(assets),
        "assets": assets,
        "platformIconCount": len(platform_icons),
        "platformIcons": platform_icons,
    }
    report_path = output_root / "pipeline-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    scene = bpy.context.scene
    scene["ntwp_pipeline"] = report["pipeline"]
    scene["ntwp_report"] = "//pipeline-report.json"
    scene["ntwp_source_model_identifier"] = "null (tool did not expose an identifier)"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(output_root / "v21-art-pipeline.blend"), compress=True)
    print(f"NTWP_V21_REPORT={report_path}")
    print(f"NTWP_V21_RUNTIME_BYTES={runtime_bytes}")


if __name__ == "__main__":
    main()
