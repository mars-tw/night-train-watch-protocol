"""Build seven byte-exact lossless A-07 clip rows from the v2 runtime WebP."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, __version__ as pillow_version, features


SOURCE = Path("public/assets/art/v2/characters/a07/atlas.webp")
OUTPUT = Path("public/assets/art/v22/a07-clips")
QA_REPORT = Path("docs/reboot-v22/reports/A07_CLIPS_LOSSLESS_REPORT.json")
WIDTH, HEIGHT, COLUMNS, ROWS = 1340, 1174, 8, 7
CLIPS = (
    ("sleep", 8),
    ("turn", 8),
    ("listen", 8),
    ("startle", 8),
    ("sit", 8),
    ("drink", 6),
    ("settle", 6),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rgba_sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def main() -> None:
    if not features.check("webp"):
        raise RuntimeError("Pillow WebP support is required")
    source_path = SOURCE.resolve()
    output_root = OUTPUT.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as source_file:
        source = source_file.convert("RGBA")
    if source.size != (WIDTH, HEIGHT):
        raise RuntimeError(f"Unexpected A-07 atlas size: {source.size}")

    assets = []
    for row, (clip_id, frame_count) in enumerate(CLIPS):
        y0 = math.floor(row * HEIGHT / ROWS)
        y1 = math.floor((row + 1) * HEIGHT / ROWS)
        crop = source.crop((0, y0, WIDTH, y1))
        output_path = output_root / f"{clip_id}.webp"
        crop.save(output_path, "WEBP", lossless=True, quality=100, method=6, exact=True)
        with Image.open(output_path) as decoded_file:
            decoded = decoded_file.convert("RGBA")
        if decoded.size != crop.size or decoded.tobytes() != crop.tobytes():
            output_path.unlink(missing_ok=True)
            raise RuntimeError(f"Lossless RGBA readback failed: {clip_id}")
        frame_boxes = []
        for column in range(frame_count):
            x0 = math.floor(column * WIDTH / COLUMNS)
            x1 = math.floor((column + 1) * WIDTH / COLUMNS)
            original_frame = source.crop((x0, y0, x1, y1))
            clip_frame = decoded.crop((x0, 0, x1, y1 - y0))
            if original_frame.tobytes() != clip_frame.tobytes():
                raise RuntimeError(f"Frame crop mismatch: {clip_id}[{column}]")
            frame_boxes.append({
                "frame": column,
                "atlasBox": [x0, y0, x1, y1],
                "clipBox": [x0, 0, x1, y1 - y0],
                "width": x1 - x0,
                "height": y1 - y0,
                "rgbaSha256": rgba_sha256(original_frame),
            })
        assets.append({
            "clipId": clip_id,
            "sourceRow": row,
            "frameCount": frame_count,
            "sourceBox": [0, y0, WIDTH, y1],
            "width": WIDTH,
            "height": y1 - y0,
            "path": f"public/assets/art/v22/a07-clips/{clip_id}.webp",
            "bytes": output_path.stat().st_size,
            "sha256": sha256(output_path),
            "sourceCropRgbaSha256": rgba_sha256(crop),
            "decodedRgbaSha256": rgba_sha256(decoded),
            "rgbaExact": True,
            "alphaExact": True,
            "frameBoxes": frame_boxes,
        })

    report = {
        "schemaVersion": 1,
        "codec": "Pillow lossless WebP",
        "pillowVersion": pillow_version,
        "settings": {"lossless": True, "quality": 100, "method": 6, "exact": True},
        "source": SOURCE.as_posix(),
        "sourceBytes": source_path.stat().st_size,
        "sourceSha256": sha256(source_path),
        "sourceDimensions": [WIDTH, HEIGHT],
        "rowBoundaryFormula": "floor(row * 1174 / 7)",
        "columnBoundaryFormula": "floor(column * 1340 / 8)",
        "assetCount": len(assets),
        "totalBytes": sum(int(asset["bytes"]) for asset in assets),
        "allRgbaExact": all(bool(asset["rgbaExact"]) for asset in assets),
        "allAlphaExact": all(bool(asset["alphaExact"]) for asset in assets),
        "assets": assets,
    }
    qa_path = QA_REPORT.resolve()
    qa_path.parent.mkdir(parents=True, exist_ok=True)
    qa_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "schemaVersion": 1,
        "source": report["source"],
        "sourceDimensions": report["sourceDimensions"],
        "rowBoundaryFormula": report["rowBoundaryFormula"],
        "columnBoundaryFormula": report["columnBoundaryFormula"],
        "totalBytes": report["totalBytes"],
        "clips": [
            {
                **{key: asset[key] for key in ("clipId", "sourceRow", "frameCount", "sourceBox", "width", "height", "path", "bytes", "sha256")},
                "frameBoxes": [{key: frame[key] for key in ("frame", "atlasBox", "clipBox", "width", "height")} for frame in asset["frameBoxes"]],
            }
            for asset in assets
        ],
    }
    (output_root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"assets": len(assets), "totalBytes": report["totalBytes"], "manifest": str(output_root / "manifest.json"), "qaReport": str(qa_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
