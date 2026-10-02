"""Blender 5.2 background pipeline for the Night Train v2 generated art.

Run with Blender, not CPython:
  blender --background --python tools/process-v2-art.py -- [arguments]

The script preserves every source PNG, makes 720x1280 nearest-sampled carriage
plates, cleans only the atlas' explicit red/yellow spill pixels, validates the
8x7 occupancy contract, and stores source/provenance metadata in a .blend.
"""

from __future__ import annotations

import argparse
from array import array
from collections import Counter
import colorsys
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys

import bpy


PALETTE = {
    "deep_wood": "#70503D",
    "wood": "#A9774F",
    "wood_light": "#D3AB79",
    "blanket": "#D6C4A3",
    "amber": "#F2BD67",
    "iron": "#63716D",
    "glass": "#9AB6B7",
    "fog": "#7D9297",
    "leaf": "#719365",
    "danger": "#C46A52",
}

EXPECTED_ATLAS_OCCUPANCY = [8, 8, 8, 8, 8, 6, 6]

# Top-down normalized masks for iron doors, cold windows, refrigerators,
# circulation hardware, and non-emissive equipment. Wood desks, beds, blankets,
# lamps and food preparation surfaces are intentionally outside these masks.
COOL_REGIONS = {
    "sleep": [(0.31, 0.08, 0.65, 0.56), (0.77, 0.10, 1.0, 0.38)],
    "defense": [(0.20, 0.08, 0.68, 0.61), (0.72, 0.10, 1.0, 0.38), (0.0, 0.62, 0.22, 0.96)],
    "workshop": [(0.37, 0.08, 0.67, 0.56), (0.79, 0.10, 1.0, 0.38), (0.0, 0.29, 0.38, 0.61), (0.67, 0.45, 1.0, 0.72)],
    "greenhouse": [(0.38, 0.08, 0.64, 0.51), (0.75, 0.08, 1.0, 0.36), (0.0, 0.32, 0.34, 0.82)],
    "kitchen": [(0.34, 0.08, 0.63, 0.53), (0.80, 0.08, 1.0, 0.34), (0.48, 0.36, 0.78, 0.78)],
}

COOL_SHADOW_LIMIT = {"sleep": 0.19, "kitchen": 0.2}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cli_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    for name in ("sleep", "defense", "workshop", "greenhouse", "kitchen", "atlas"):
        parser.add_argument(f"--{name}", required=True)
    for name in ("threat-knocker", "threat-clinger", "threat-vine", "threat-echo", "threat-crowd", "equipment"):
        parser.add_argument(f"--{name}")
    return parser.parse_args(arguments)


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1


def load_pixels(path: Path) -> tuple[bpy.types.Image, int, int, array]:
    image = bpy.data.images.load(str(path), check_existing=False)
    width, height = image.size
    pixels = array("f", [0.0]) * (width * height * 4)
    image.pixels.foreach_get(pixels)
    return image, width, height, pixels


def save_pixels(name: str, path: Path, width: int, height: int, pixels: array) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=width, height=height, alpha=True, float_buffer=False)
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def quantize(value: float, steps: int = 31) -> float:
    return round(max(0.0, min(1.0, value)) * steps) / steps


def regional_cool_balance(name: str, pixels: array, width: int, height: int) -> int:
    regions = COOL_REGIONS[name]
    iron = hex_to_linear("#63716D")
    iron_shadow = hex_to_linear("#354246")
    changed = 0
    for y in range(height):
        canvas_y = 1 - (y + 0.5) / height
        for x in range(width):
            canvas_x = (x + 0.5) / width
            index = (y * width + x) * 4
            if pixels[index + 3] <= 0.05:
                continue
            red, green, blue = pixels[index], pixels[index + 1], pixels[index + 2]
            luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            region_weight = 0.0
            for left, top, right, bottom in regions:
                if left <= canvas_x <= right and top <= canvas_y <= bottom:
                    edge_distance = min(canvas_x - left, right - canvas_x, canvas_y - top, bottom - canvas_y)
                    region_weight = max(region_weight, min(1.0, edge_distance / 0.035))
            in_hardware_region = region_weight > 0
            in_cool_shadow = name in COOL_SHADOW_LIMIT and luminance <= COOL_SHADOW_LIMIT[name]
            if not in_hardware_region and not in_cool_shadow:
                continue
            # Preserve lamp cores, amber reflections and bright cloth/paper.
            if luminance >= 0.58 and red > green * 1.04:
                continue
            # Preserve living foliage even where it overlaps circulation masks.
            if green > red * 1.14 and green > blue * 1.12:
                continue
            target = iron_shadow if luminance < 0.17 else iron
            base_strength = 0.68 if in_cool_shadow and not in_hardware_region else 0.76 if luminance < 0.5 else 0.58
            strength = base_strength if in_cool_shadow else base_strength * region_weight
            pixels[index] = quantize(red * (1 - strength) + target[0] * strength)
            pixels[index + 1] = quantize(green * (1 - strength) + target[1] * strength)
            pixels[index + 2] = quantize(blue * (1 - strength) + target[2] * strength)
            changed += 1
    return changed


def cover_crop_nearest(source: array, source_width: int, source_height: int, width: int, height: int) -> array:
    source_aspect = source_width / source_height
    target_aspect = width / height
    if source_aspect > target_aspect:
        crop_height = source_height
        crop_width = source_height * target_aspect
        crop_x = (source_width - crop_width) / 2
        crop_y = 0
    else:
        crop_width = source_width
        crop_height = source_width / target_aspect
        crop_x = 0
        crop_y = (source_height - crop_height) / 2
    output = array("f", [0.0]) * (width * height * 4)
    for y in range(height):
        source_y = min(source_height - 1, int(crop_y + (y + 0.5) * crop_height / height))
        for x in range(width):
            source_x = min(source_width - 1, int(crop_x + (x + 0.5) * crop_width / width))
            source_index = (source_y * source_width + source_x) * 4
            output_index = (y * width + x) * 4
            output[output_index] = quantize(source[source_index])
            output[output_index + 1] = quantize(source[source_index + 1])
            output[output_index + 2] = quantize(source[source_index + 2])
            output[output_index + 3] = source[source_index + 3]
    return output


def srgb_hex(red: float, green: float, blue: float) -> str:
    # Blender exposes linear pixels; this conversion is for the audit report only.
    def encode(value: float) -> int:
        value = 12.92 * value if value <= 0.0031308 else 1.055 * pow(value, 1 / 2.4) - 0.055
        return round(max(0, min(1, value)) * 255)

    return f"#{encode(red):02X}{encode(green):02X}{encode(blue):02X}"


def linear_to_srgb(value: float) -> float:
    return 12.92 * value if value <= 0.0031308 else 1.055 * pow(value, 1 / 2.4) - 0.055


def hex_to_linear(value: str) -> tuple[float, float, float]:
    channels = [int(value[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    return tuple(channel / 12.92 if channel <= 0.04045 else pow((channel + 0.055) / 1.055, 2.4) for channel in channels)


def image_metrics(pixels: array, width: int, height: int) -> dict[str, object]:
    color_counts: Counter[str] = Counter()
    luminance_samples: list[float] = []
    alpha_pixels = 0
    warm_pixels = 0
    palette_pixels = 0
    target_palette = [hex_to_linear(value) for value in PALETTE.values()]
    sample_step = max(1, int(math.sqrt((width * height) / 25000)))
    for y in range(0, height, sample_step):
        for x in range(0, width, sample_step):
            index = (y * width + x) * 4
            alpha = pixels[index + 3]
            if alpha <= 0.05:
                continue
            alpha_pixels += 1
            red, green, blue = pixels[index], pixels[index + 1], pixels[index + 2]
            srgb = tuple(max(0.0, min(1.0, linear_to_srgb(channel))) for channel in (red, green, blue))
            hue, saturation, _ = colorsys.rgb_to_hsv(*srgb)
            if saturation >= 0.12 and (hue <= 70 / 360 or hue >= 340 / 360):
                warm_pixels += 1
            if min(math.dist((red, green, blue), target) for target in target_palette) <= 0.18:
                palette_pixels += 1
            key = srgb_hex(round(red * 15) / 15, round(green * 15) / 15, round(blue * 15) / 15)
            color_counts[key] += 1
            luminance_samples.append(0.2126 * red + 0.7152 * green + 0.0722 * blue)
    dominant = [color for color, _ in color_counts.most_common(12)]
    luminance_range = max(luminance_samples) - min(luminance_samples) if luminance_samples else 0

    downsample_colors: set[str] = set()
    target_width = 64
    target_height = max(1, round(height * target_width / width))
    for y in range(target_height):
        source_y = min(height - 1, int((y + 0.5) * height / target_height))
        for x in range(target_width):
            source_x = min(width - 1, int((x + 0.5) * width / target_width))
            index = (source_y * width + source_x) * 4
            if pixels[index + 3] <= 0.05:
                continue
            downsample_colors.add(srgb_hex(pixels[index], pixels[index + 1], pixels[index + 2]))
    return {
        "dominantColors": dominant,
        "sampledOpaquePixels": alpha_pixels,
        "luminanceRange": round(luminance_range, 4),
        "warmColorRatio": round(warm_pixels / alpha_pixels, 4) if alpha_pixels else 0,
        "targetPaletteCoverage": round(palette_pixels / alpha_pixels, 4) if alpha_pixels else 0,
        "recognition64": {
            "sampleWidth": 64,
            "sampleHeight": target_height,
            "distinctColors": len(downsample_colors),
            "pass": len(downsample_colors) >= 16 and luminance_range >= 0.15,
        },
    }


def process_carriage(name: str, source_path: Path, output_dir: Path) -> dict[str, object]:
    source_copy = output_dir / "source" / f"carriage-{name}-source.png"
    shutil.copy2(source_path, source_copy)
    image, source_width, source_height, source_pixels = load_pixels(source_path)
    processed = cover_crop_nearest(source_pixels, source_width, source_height, 720, 1280)
    cool_balanced_pixels = regional_cool_balance(name, processed, 720, 1280)
    output_path = output_dir / "carriages" / f"{name}.png"
    output_image = save_pixels(f"v2-carriage-{name}", output_path, 720, 1280, processed)
    output_image["ntwp_role"] = "carriage_structure"
    output_image["ntwp_source"] = str(source_path)
    bpy.context.scene[f"asset_carriage_{name}"] = str(output_path)
    metrics = image_metrics(processed, 720, 1280)
    bpy.data.images.remove(image)
    return {
        "assetId": f"v2.carriage.{name}",
        "source": source_copy.relative_to(output_dir.parent.parent.parent).as_posix(),
        "runtime": output_path.relative_to(output_dir.parent.parent.parent).as_posix(),
        "sourceSha256": sha256_file(source_copy),
        "runtimeSha256": sha256_file(output_path),
        "sourceSize": [source_width, source_height],
        "runtimeSize": [720, 1280],
        "processing": ["center-cover-crop", "nearest-sample", "5-bit-channel-posterize", "regional-iron-shadow-cool-balance"],
        "coolBalancedPixels": cool_balanced_pixels,
        **metrics,
    }


def cell_bounds(column: int, row: int, width: int, height: int) -> tuple[int, int, int, int]:
    left = math.floor(column * width / 8)
    right = math.floor((column + 1) * width / 8)
    bottom = math.floor(row * height / 7)
    top = math.floor((row + 1) * height / 7)
    return left, bottom, right - left, top - bottom


def process_atlas(source_path: Path, output_dir: Path) -> dict[str, object]:
    source_copy = output_dir / "source" / "a07-atlas-source.png"
    shutil.copy2(source_path, source_copy)
    image, width, height, pixels = load_pixels(source_path)
    cleaned = array("f", pixels)
    removed_spill = 0
    for index in range(0, len(cleaned), 4):
        red, green, blue, alpha = cleaned[index], cleaned[index + 1], cleaned[index + 2], cleaned[index + 3]
        red_spill = red > 0.55 and green < 0.08 and blue < 0.08
        yellow_spill = red > 0.55 and green > 0.55 and blue < 0.08
        if alpha > 0.01 and (red_spill or yellow_spill):
            cleaned[index] = cleaned[index + 1] = cleaned[index + 2] = cleaned[index + 3] = 0
            removed_spill += 1
        elif alpha <= 0.01:
            cleaned[index] = cleaned[index + 1] = cleaned[index + 2] = cleaned[index + 3] = 0

    # The authored contract leaves columns 6-7 empty in the last two display
    # rows. Remove a few neighboring-frame antialias pixels that crossed those
    # cell boundaries; do not synthesize content for empty cells.
    for display_row in (5, 6):
        pixel_row = 6 - display_row
        for column in (6, 7):
            left, bottom, cell_width, cell_height = cell_bounds(column, pixel_row, width, height)
            for y in range(bottom, bottom + cell_height):
                for x in range(left, left + cell_width):
                    index = (y * width + x) * 4
                    cleaned[index] = cleaned[index + 1] = cleaned[index + 2] = cleaned[index + 3] = 0

    occupancy: list[int] = []
    frames: list[dict[str, object]] = []
    frame_index = 0
    for row in range(7):
        row_occupied = 0
        pixel_row = 6 - row  # bpy pixel arrays are bottom-up; atlas/Canvas rows are top-down.
        for column in range(8):
            left, bottom, cell_width, cell_height = cell_bounds(column, pixel_row, width, height)
            canvas_top = math.floor(row * height / 7)
            opaque = 0
            min_x, min_y, max_x, max_y = width, height, -1, -1
            for y in range(bottom, bottom + cell_height):
                for x in range(left, left + cell_width):
                    if cleaned[(y * width + x) * 4 + 3] > 0.05:
                        opaque += 1
                        min_x, min_y = min(min_x, x), min(min_y, y)
                        max_x, max_y = max(max_x, x), max(max_y, y)
            occupied = opaque >= 64
            if occupied:
                row_occupied += 1
                frames.append({
                    "index": frame_index,
                    "cell": [left, canvas_top, cell_width, cell_height],
                    "opaqueBounds": [min_x, height - 1 - max_y, max_x - min_x + 1, max_y - min_y + 1],
                    "opaquePixels": opaque,
                })
                frame_index += 1
        occupancy.append(row_occupied)

    if occupancy != EXPECTED_ATLAS_OCCUPANCY or frame_index != 52:
        raise RuntimeError(f"Atlas occupancy {occupancy} contains {frame_index} frames; expected {EXPECTED_ATLAS_OCCUPANCY}/52")

    output_path = output_dir / "characters" / "a07" / "atlas.png"
    output_image = save_pixels("v2-a07-atlas", output_path, width, height, cleaned)
    output_image["ntwp_role"] = "passenger"
    output_image["ntwp_frame_count"] = 52
    output_image["ntwp_source"] = str(source_path)
    bpy.context.scene["asset_a07_atlas"] = str(output_path)
    bpy.data.images.remove(image)
    return {
        "assetId": "v2.character.a07.atlas",
        "source": source_copy.relative_to(output_dir.parent.parent.parent).as_posix(),
        "runtime": output_path.relative_to(output_dir.parent.parent.parent).as_posix(),
        "sourceSha256": sha256_file(source_copy),
        "runtimeSha256": sha256_file(output_path),
        "sourceSize": [width, height],
        "runtimeSize": [width, height],
        "grid": [8, 7],
        "occupancyByRow": occupancy,
        "frameCount": frame_index,
        "removedSpillPixels": removed_spill,
        "frames": frames,
        **image_metrics(cleaned, width, height),
    }


def is_spill(red: float, green: float, blue: float) -> bool:
    return (
        (red > 0.55 and green < 0.08 and blue < 0.08)
        or (red > 0.55 and green > 0.55 and blue < 0.08)
        or (blue > 0.5 and red < 0.08 and green < 0.22)
        or (green > 0.45 and red < 0.08 and blue < 0.18)
        or (green > 0.4 and blue > 0.4 and red < 0.08)
    )


def clean_grid_spill(pixels: array, width: int, height: int) -> tuple[array, int]:
    cleaned = array("f", pixels)
    remove: list[int] = []
    for y in range(height):
        for x in range(width):
            index = (y * width + x) * 4
            alpha = cleaned[index + 3]
            if alpha <= 0.01:
                cleaned[index] = cleaned[index + 1] = cleaned[index + 2] = cleaned[index + 3] = 0
                continue
            if not is_spill(cleaned[index], cleaned[index + 1], cleaned[index + 2]):
                continue
            touches_transparency = False
            for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = (neighbor_y * width + neighbor_x) * 4
                    if pixels[neighbor + 3] <= 0.02:
                        touches_transparency = True
                        break
                if touches_transparency:
                    break
            if touches_transparency:
                remove.append(index)
    for index in remove:
        cleaned[index] = cleaned[index + 1] = cleaned[index + 2] = cleaned[index + 3] = 0
    return cleaned, len(remove)


def process_regular_grid(
    asset_id: str,
    source_path: Path,
    output_dir: Path,
    columns: int,
    rows: int,
    relative_output: Path,
) -> dict[str, object]:
    source_copy = output_dir / "source" / f"{asset_id.replace('.', '-')}-source.png"
    shutil.copy2(source_path, source_copy)
    image, width, height, pixels = load_pixels(source_path)
    cleaned, removed_spill = clean_grid_spill(pixels, width, height)
    frames: list[dict[str, object]] = []
    occupancy: list[int] = []
    for display_row in range(rows):
        pixel_row = rows - 1 - display_row
        row_occupied = 0
        for column in range(columns):
            left = math.floor(column * width / columns)
            right = math.floor((column + 1) * width / columns)
            bottom = math.floor(pixel_row * height / rows)
            top = math.floor((pixel_row + 1) * height / rows)
            canvas_top = math.floor(display_row * height / rows)
            opaque = 0
            min_x, min_y, max_x, max_y = width, height, -1, -1
            for y in range(bottom, top):
                for x in range(left, right):
                    if cleaned[(y * width + x) * 4 + 3] > 0.05:
                        opaque += 1
                        min_x, min_y = min(min_x, x), min(min_y, y)
                        max_x, max_y = max(max_x, x), max(max_y, y)
            if opaque < 64:
                raise RuntimeError(f"{asset_id} cell ({display_row},{column}) is empty ({opaque} opaque pixels)")
            row_occupied += 1
            frames.append({
                "index": display_row * columns + column,
                "cell": [left, canvas_top, right - left, top - bottom],
                "opaqueBounds": [min_x, height - 1 - max_y, max_x - min_x + 1, max_y - min_y + 1],
                "opaquePixels": opaque,
            })
        occupancy.append(row_occupied)
    output_path = output_dir / relative_output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_image = save_pixels(asset_id.replace(".", "-"), output_path, width, height, cleaned)
    output_image["ntwp_role"] = "threat" if asset_id.startswith("v2.threat") else "equipment"
    output_image["ntwp_frame_count"] = columns * rows
    output_image["ntwp_source"] = str(source_path)
    bpy.context.scene[f"asset_{asset_id.replace('.', '_')}"] = str(output_path)
    bpy.data.images.remove(image)
    return {
        "assetId": asset_id,
        "source": source_copy.relative_to(output_dir.parent.parent.parent).as_posix(),
        "runtime": output_path.relative_to(output_dir.parent.parent.parent).as_posix(),
        "sourceSha256": sha256_file(source_copy),
        "runtimeSha256": sha256_file(output_path),
        "sourceSize": [width, height],
        "runtimeSize": [width, height],
        "grid": [columns, rows],
        "occupancyByRow": occupancy,
        "frameCount": columns * rows,
        "removedSpillPixels": removed_spill,
        "frames": frames,
        **image_metrics(cleaned, width, height),
    }


def main() -> None:
    args = cli_args()
    output_dir = Path(args.output_dir).resolve()
    for directory in (output_dir / "source", output_dir / "carriages", output_dir / "characters" / "a07"):
        directory.mkdir(parents=True, exist_ok=True)
    configure_scene()
    bpy.context.scene["ntwp_pipeline"] = "v2-art-postprocess-1"
    bpy.context.scene["ntwp_blender_version"] = bpy.app.version_string
    bpy.context.scene["ntwp_source_tool"] = "OpenAI built-in image generation tool (model identifier not exposed)"
    bpy.context.scene["ntwp_palette"] = json.dumps(PALETTE, ensure_ascii=False)

    assets = [
        process_carriage(name, Path(getattr(args, name)).resolve(), output_dir)
        for name in ("sleep", "defense", "workshop", "greenhouse", "kitchen")
    ]
    assets.append(process_atlas(Path(args.atlas).resolve(), output_dir))
    threat_inputs = {
        "knocker": args.threat_knocker,
        "clinger": args.threat_clinger,
        "vine": args.threat_vine,
        "echo": args.threat_echo,
        "crowd": args.threat_crowd,
    }
    provided_threats = [path for path in threat_inputs.values() if path]
    if provided_threats and len(provided_threats) != len(threat_inputs):
        raise RuntimeError("Provide all five threat atlases together")
    for threat_id, source in threat_inputs.items():
        if source:
            assets.append(process_regular_grid(
                f"v2.threat.{threat_id}",
                Path(source).resolve(),
                output_dir,
                4,
                5,
                Path("threats") / threat_id / "atlas.png",
            ))
    if args.equipment:
        assets.append(process_regular_grid(
            "v2.equipment.atlas",
            Path(args.equipment).resolve(),
            output_dir,
            10,
            5,
            Path("equipment") / "atlas.png",
        ))
    report = {
        "pipelineVersion": 1,
        "blenderVersion": bpy.app.version_string,
        "sourceTool": "OpenAI built-in image generation tool",
        "sourceModelIdentifier": None,
        "actualGeneratedImageCount": len(assets),
        "palette": PALETTE,
        "assets": assets,
    }
    carriage_assets = [asset for asset in assets if str(asset["assetId"]).startswith("v2.carriage")]
    average_warm = sum(float(asset["warmColorRatio"]) for asset in carriage_assets) / len(carriage_assets)
    average_palette = sum(float(asset["targetPaletteCoverage"]) for asset in carriage_assets) / len(carriage_assets)
    report["globalColorAssessment"] = {
        "warmInteriorTarget": [0.6, 0.7],
        "observedAverageWarmRatio": round(average_warm, 4),
        "warmTargetPass": 0.6 <= average_warm <= 0.7,
        "targetPaletteCoverageThreshold": 0.45,
        "observedAveragePaletteCoverage": round(average_palette, 4),
        "paletteCoveragePass": average_palette >= 0.45,
    }
    report_path = output_dir / "pipeline-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    bpy.context.scene["ntwp_report"] = str(report_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_dir / "v2-art-pipeline.blend"), compress=True)
    print(f"NTWP_REPORT={report_path}")
    print(f"NTWP_ASSETS={len(assets)}")


if __name__ == "__main__":
    main()
