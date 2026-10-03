"""One-shot q98/q100 boundary audit for v2 atlas RGB quality.

Candidates live outside public/. The report covers full-resolution visible and
opaque pixels plus every declared frame resized into a 64px matte composite.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, __version__ as pillow_version

ASSETS = (
    ("a07", "characters/a07/atlas.png", 8, 7, 0),
    ("equipment", "equipment/atlas.png", 10, 5, 13),
    ("threat-knocker", "threats/knocker/atlas.png", 4, 5, 4),
    ("threat-clinger", "threats/clinger/atlas.png", 4, 5, 4),
    ("threat-vine", "threats/vine/atlas.png", 4, 5, 4),
    ("threat-echo", "threats/echo/atlas.png", 4, 5, 4),
    ("threat-crowd", "threats/crowd/atlas.png", 4, 5, 4),
)
MATTES = ((0, 0, 0), (239, 226, 196), (154, 182, 183))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mae(source: np.ndarray, decoded: np.ndarray, mask: np.ndarray) -> float:
    return float(np.abs(source.astype(np.float32) - decoded.astype(np.float32))[mask].mean())


def matte_rgb(image: Image.Image, matte: tuple[int, int, int], size: tuple[int, int] | None = None) -> tuple[np.ndarray, np.ndarray]:

    rgba = image.convert("RGBA")
    if size is not None:
        rgba.thumbnail(size, Image.Resampling.LANCZOS)
        positioned = Image.new("RGBA", size)
        positioned.alpha_composite(rgba, ((size[0] - rgba.width) // 2, (size[1] - rgba.height) // 2))
        rgba = positioned
    pixels = np.asarray(rgba, dtype=np.uint8)
    alpha = pixels[..., 3].astype(np.float32)[..., None] / 255.0
    rgb = pixels[..., :3].astype(np.float32) * alpha + np.asarray(matte, dtype=np.float32) * (1.0 - alpha)
    return rgb, pixels[..., 3]


def main() -> None:
    root = Path.cwd()
    source_root = root / "public/assets/art/v2"
    candidate_root = root / ".codex-tmp/v22-atlas-boundary"
    candidate_root.mkdir(parents=True, exist_ok=True)
    qualities = (98, 100)
    trials = []
    for quality in qualities:
        assets = []
        total = 0
        for asset_id, relative, columns, rows, _evidence_frame in ASSETS:
            source_path = source_root / relative
            candidate = candidate_root / f"{asset_id}.q{quality}.webp"
            with Image.open(source_path) as source_file:
                source = source_file.convert("RGBA")
                source.save(candidate, "WEBP", lossless=False, quality=quality, method=6, exact=True)
                decoded = Image.open(candidate).convert("RGBA")
                source_array = np.asarray(source, dtype=np.uint8)
                decoded_array = np.asarray(decoded, dtype=np.uint8)
                visible = source_array[..., 3] > 0
                opaque = source_array[..., 3] == 255
                full_mattes = []
                for matte in MATTES:
                    source_composite, _ = matte_rgb(source, matte)
                    decoded_composite, _ = matte_rgb(decoded, matte)
                    full_mattes.append({"rgb": list(matte), "visibleMae255": round(mae(source_composite, decoded_composite, visible), 6), "opaqueMae255": round(mae(source_composite, decoded_composite, opaque), 6)})
                frame_width, frame_height = source.width // columns, source.height // rows
                frames = []
                for frame_index in range(columns * rows):
                    box = ((frame_index % columns) * frame_width, (frame_index // columns) * frame_height, (frame_index % columns + 1) * frame_width, (frame_index // columns + 1) * frame_height)
                    source_frame, decoded_frame = source.crop(box), decoded.crop(box)
                    frame_mattes = []
                    for matte in MATTES:
                        source_64, source_alpha = matte_rgb(source_frame, matte, (64, 64))
                        decoded_64, _ = matte_rgb(decoded_frame, matte, (64, 64))
                        frame_visible, frame_opaque = source_alpha > 0, source_alpha == 255
                        frame_mattes.append({"rgb": list(matte), "visibleMae255": round(mae(source_64, decoded_64, frame_visible), 6) if np.any(frame_visible) else 0.0, "opaqueMae255": round(mae(source_64, decoded_64, frame_opaque), 6) if np.any(frame_opaque) else 0.0})
                    frames.append({"frameIndex": frame_index, "mattes": frame_mattes, "maxVisibleMae255": max(item["visibleMae255"] for item in frame_mattes), "maxOpaqueMae255": max(item["opaqueMae255"] for item in frame_mattes)})
            size = candidate.stat().st_size
            total += size
            assets.append({"assetId": asset_id, "bytes": size, "sha256": sha256(candidate), "alphaExact": bool(np.array_equal(source_array[..., 3], decoded_array[..., 3])), "fullResolutionMattes": full_mattes, "maxFullVisibleMae255": max(item["visibleMae255"] for item in full_mattes), "maxFullOpaqueMae255": max(item["opaqueMae255"] for item in full_mattes), "frames64px": frames, "maxFrame64VisibleMae255": max(frame["maxVisibleMae255"] for frame in frames), "maxFrame64OpaqueMae255": max(frame["maxOpaqueMae255"] for frame in frames)})
        trials.append({"quality": quality, "bytes": total, "miB": round(total / 1024 / 1024, 3), "assets": assets, "passesAlpha": all(asset["alphaExact"] for asset in assets), "passesFullVisibleAndOpaqueMae15": all(asset["maxFullVisibleMae255"] <= 1.5 and asset["maxFullOpaqueMae255"] <= 1.5 for asset in assets), "passesEveryFrame64VisibleAndOpaqueMae15": all(asset["maxFrame64VisibleMae255"] <= 1.5 and asset["maxFrame64OpaqueMae255"] <= 1.5 for asset in assets)})
    report = {"schemaVersion": 1, "pillowVersion": pillow_version, "qualities": list(qualities), "mattes": [list(matte) for matte in MATTES], "gateMae255": 1.5, "transparentPixelsExcluded": True, "trials": trials}
    report_path = root / "docs/reboot-v22/reports/ATLAS_LOSSY_BOUNDARY_REPORT.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for candidate in candidate_root.glob("*.webp"):
        candidate.unlink()
    print(json.dumps({"report": str(report_path), "trials": [{key: trial[key] for key in ("quality", "bytes", "passesFullVisibleAndOpaqueMae15", "passesEveryFrame64VisibleAndOpaqueMae15")} for trial in trials]}))


if __name__ == "__main__":
    main()
