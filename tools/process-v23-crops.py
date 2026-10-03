"""Blender 5.2 finishing pipeline for the v2.3 4x3 crop sprite sheet.

The source is split with deterministic floor boundaries. Each authored cell is
rendered through an sRGB emission/alpha material and orthographic camera with
Closest sampling. No sprite is invented, redrawn, smoothed, or palette-quantized.
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
import subprocess
import sys
from typing import Any

import bpy


COLS, ROWS = 4, 3
OUTPUT_WIDTH = 192
CROPS = ("lettuce", "tomato", "herb")
STAGES = (0, 1, 2, 3)


def cli_args() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output-dir", default="public/assets/art/v23")
    parser.add_argument("--height-mode", choices=("auto", "128", "144", "192"), default="auto")
    parser.add_argument("--python", default="python")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--source-tool", default="image_gen")
    parser.add_argument("--source-model", default=None)
    return parser.parse_args(values)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def portable(path: Path, root: Path) -> str:
    return Path(os.path.relpath(path.resolve(), root.resolve())).as_posix()


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
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


def image_pixels(image: bpy.types.Image) -> array:
    values = array("f", [0.0]) * (int(image.size[0]) * int(image.size[1]) * 4)
    image.pixels.foreach_get(values)
    return values


def create_material(name: str, image: bpy.types.Image) -> bpy.types.Material:
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


def create_plane(
    name: str,
    material: bpy.types.Material,
    width: float,
    height: float,
    left: float,
    bottom: float,
    uv: tuple[float, float, float, float],
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}-mesh")
    mesh.from_pydata([
        (left, bottom, 0), (left + width, bottom, 0),
        (left + width, bottom + height, 0), (left, bottom + height, 0),
    ], [], [(0, 1, 2, 3)])
    mesh.materials.append(material)
    layer = mesh.uv_layers.new(name="UVMap")
    u0, v0, u1, v1 = uv
    for loop, value in zip(layer.data, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
        loop.uv = value
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def create_camera(width: int, height: int, name: str) -> None:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.sensor_fit = "VERTICAL"
    data.ortho_scale = height
    camera = bpy.data.objects.new(name, data)
    camera.location = (width / 2, height / 2, 10)
    camera.rotation_euler = (0, 0, 0)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera


def cell_box(column: int, row: int, width: int, height: int) -> tuple[int, int, int, int]:
    return (
        math.floor(column * width / COLS),
        math.floor(row * height / ROWS),
        math.floor((column + 1) * width / COLS),
        math.floor((row + 1) * height / ROWS),
    )


def alpha_bbox(
    pixels: array,
    image_width: int,
    image_height: int,
    box: tuple[int, int, int, int],
) -> tuple[int, int, int, int] | None:
    x0, y0, x1, y1 = box
    xs: list[int] = []
    ys: list[int] = []
    for y in range(y0, y1):
        pixel_y = image_height - 1 - y
        for x in range(x0, x1):
            if pixels[(pixel_y * image_width + x) * 4 + 3] > 1 / 255:
                xs.append(x - x0)
                ys.append(y - y0)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def choose_height(mode: str, bbox: tuple[int, int, int, int], cell_width: int, cell_height: int) -> int:
    if mode != "auto":
        return int(mode)
    content_width = max(1, bbox[2] - bbox[0])
    content_height = max(1, bbox[3] - bbox[1])
    content_aspect = content_width / content_height
    candidates = (128, 144)
    return min(candidates, key=lambda height: abs((OUTPUT_WIDTH / height) - content_aspect))


def encode_lossless(python: str, png: Path, webp: Path) -> None:
    subprocess.run([
        python, "-c",
        "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGBA'); "
        "im.save(sys.argv[2], format='WEBP', lossless=True, method=6, exact=True)",
        str(png), str(webp),
    ], check=True)


def decode_rgba(ffmpeg: str, source: Path, raw: Path) -> bytes:
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", str(raw),
    ], check=True)
    result = raw.read_bytes()
    raw.unlink()
    return result


def render_sprite(
    args: argparse.Namespace,
    output_root: Path,
    source_copy: Path,
    source_width: int,
    source_height: int,
    pixels: array,
    crop: str,
    stage: int,
    row: int,
    column: int,
) -> dict[str, Any]:
    box = cell_box(column, row, source_width, source_height)
    bbox = alpha_bbox(pixels, source_width, source_height, box)
    if bbox is None:
        raise RuntimeError(f"Empty authored cell: {crop} stage {stage}")
    output_height = choose_height(args.height_mode, bbox, box[2] - box[0], box[3] - box[1])
    clear_stage()
    image = load_image(source_copy)
    material = create_material(f"v23-{crop}-stage{stage}-alpha-emission", image)
    source_cell_width, source_cell_height = box[2] - box[0], box[3] - box[1]
    scale = min(OUTPUT_WIDTH / source_cell_width, output_height / source_cell_height)
    plane_width, plane_height = source_cell_width * scale, source_cell_height * scale
    left = (OUTPUT_WIDTH - plane_width) / 2
    bottom = (output_height - plane_height) / 2
    uv = (
        box[0] / source_width,
        1 - box[3] / source_height,
        box[2] / source_width,
        1 - box[1] / source_height,
    )
    create_plane(f"v23-{crop}-stage{stage}", material, plane_width, plane_height, left, bottom, uv)
    create_camera(OUTPUT_WIDTH, output_height, f"v23-{crop}-stage{stage}-camera")
    scene = bpy.context.scene
    scene.render.resolution_x = OUTPUT_WIDTH
    scene.render.resolution_y = output_height
    processed = output_root / "processed" / "crops" / f"{crop}-stage{stage}.png"
    runtime = output_root / "crops" / f"{crop}-stage{stage}.webp"
    processed.parent.mkdir(parents=True, exist_ok=True)
    runtime.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(processed.resolve())
    bpy.ops.render.render(write_still=True)
    encode_lossless(args.python, processed, runtime)
    png_raw = decode_rgba(args.ffmpeg, processed, runtime.with_suffix(".verify-png.rgba"))
    webp_raw = decode_rgba(args.ffmpeg, runtime, runtime.with_suffix(".verify-webp.rgba"))
    if png_raw != webp_raw:
        raise RuntimeError(f"Lossless readback failed: {crop} stage {stage}")
    return {
        "assetId": f"v23.crops.{crop}.stage{stage}",
        "crop": crop,
        "stage": stage,
        "sourceCell": [column, row],
        "sourceBox": list(box),
        "sourceAlphaBoundsInCell": list(bbox),
        "sourceCellDimensions": [source_cell_width, source_cell_height],
        "processedPng": portable(processed, output_root),
        "processedPngSha256": sha256_file(processed),
        "runtime": portable(runtime, output_root),
        "runtimeSha256": sha256_file(runtime),
        "runtimeDimensions": [OUTPUT_WIDTH, output_height],
        "sampling": "Closest",
        "scale": round(scale, 8),
        "decodedPixelsExact": True,
        "runtimeBytes": runtime.stat().st_size,
    }


def build_proof_scene(output_root: Path, source_copy: Path, source_width: int, source_height: int) -> None:
    clear_stage()
    image = load_image(source_copy)
    material = create_material("v23-crops-source-proof-emission", image)
    create_plane("v23-crops-source-proof", material, source_width, source_height, 0, 0, (0, 0, 1, 1))
    create_camera(source_width, source_height, "v23-crops-source-proof-camera")
    bpy.context.scene["purpose"] = "v2.3 crop 4x3 floor-bound UV finishing proof"
    bpy.context.scene["grid"] = "4x3"
    bpy.ops.wm.save_as_mainfile(filepath=str((output_root / "v23-crops-pipeline.blend").resolve()))


def main() -> None:
    args = cli_args()
    source = Path(args.source)
    if not source.is_file():
        raise FileNotFoundError(source)
    output_root = Path(args.output_dir)
    source_copy = output_root / "source" / f"crops-sprite-sheet-source{source.suffix.lower()}"
    source_copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, source_copy)
    configure_scene()
    analysis = load_image(source_copy)
    source_width, source_height = map(int, analysis.size)
    pixels = image_pixels(analysis)
    bpy.data.images.remove(analysis)
    assets = [
        render_sprite(args, output_root, source_copy, source_width, source_height, pixels, crop, stage, row, stage)
        for row, crop in enumerate(CROPS)
        for stage in STAGES
    ]
    crop_runtime_bytes = sum(int(asset["runtimeBytes"]) for asset in assets)
    base_report_path = output_root / "pipeline-report.json"
    base_runtime_bytes = 0
    if base_report_path.is_file():
        base_runtime_bytes = int(json.loads(base_report_path.read_text(encoding="utf-8"))["runtimeBytes"])
    combined_runtime_bytes = base_runtime_bytes + crop_runtime_bytes
    report = {
        "schemaVersion": 1,
        "release": "2.3.0",
        "pipeline": "Blender 5.2 native 4x3 floor-bound UV crop finishing",
        "blenderVersion": bpy.app.version_string,
        "sourceTool": args.source_tool,
        "sourceModelIdentifier": args.source_model,
        "source": portable(source_copy, output_root),
        "sourceSha256": sha256_file(source_copy),
        "sourceDimensions": [source_width, source_height],
        "grid": [4, 3],
        "columnBoundaryFormula": f"floor(column * {source_width} / 4)",
        "rowBoundaryFormula": f"floor(row * {source_height} / 3)",
        "order": {"rows": list(CROPS), "columns": list(STAGES)},
        "processing": {
            "viewTransform": "Standard", "look": "None", "exposure": 0, "gamma": 1,
            "sampling": "Closest", "renderFilterSize": 0.01,
            "smoothing": False, "quantization": False, "artificialNoise": False,
            "paletteSpillRemoval": "none; red tomatoes and yellow-green leaf highlights are authored crop colours",
        },
        "heightSelection": "closest of 192x128 or 192x144 to source alpha-cutout aspect" if args.height_mode == "auto" else f"fixed {args.height_mode}",
        "assetCount": len(assets),
        "runtimeBytes": crop_runtime_bytes,
        "baseV23RuntimeBytes": base_runtime_bytes,
        "combinedV23RuntimeBytes": combined_runtime_bytes,
        "combinedRuntimeLimitBytes": 20 * 1024 * 1024,
        "combinedRuntimeLimitPass": combined_runtime_bytes <= 20 * 1024 * 1024,
        "assets": assets,
    }
    report_path = output_root / "crops" / "pipeline-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    build_proof_scene(output_root, source_copy, source_width, source_height)
    print(json.dumps({"assets": len(assets), "runtimeBytes": report["runtimeBytes"], "report": str(report_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
