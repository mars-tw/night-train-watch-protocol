"""Create byte-exact visible-pixel lossless WebP runtime copies for v2 art.

PNG, source images, Blender files and the original pipeline report are never
modified. Transparent pixels may lose hidden RGB during WebP encoding; alpha
and every RGB channel with alpha > 0 must read back exactly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, __version__ as pillow_version, features


RUNTIME_PNGS = [
    Path("carriages/sleep.png"),
    Path("carriages/defense.png"),
    Path("carriages/workshop.png"),
    Path("carriages/greenhouse.png"),
    Path("carriages/kitchen.png"),
    Path("characters/a07/atlas.png"),
    Path("equipment/atlas.png"),
    Path("threats/knocker/atlas.png"),
    Path("threats/clinger/atlas.png"),
    Path("threats/vine/atlas.png"),
    Path("threats/echo/atlas.png"),
    Path("threats/crowd/atlas.png"),
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def visible_pixel_audit(original: Image.Image, decoded: Image.Image) -> dict[str, object]:
    source = original.convert("RGBA")
    target = decoded.convert("RGBA")
    if source.size != target.size:
        raise RuntimeError(f"Dimension mismatch: {source.size} != {target.size}")
    source_bytes = source.tobytes()
    target_bytes = target.tobytes()
    alpha_mismatches = 0
    visible_rgb_mismatches = 0
    hidden_rgb_mismatches = 0
    visible_pixels = 0
    for index in range(0, len(source_bytes), 4):
        source_alpha = source_bytes[index + 3]
        target_alpha = target_bytes[index + 3]
        if source_alpha != target_alpha:
            alpha_mismatches += 1
        source_rgb = source_bytes[index:index + 3]
        target_rgb = target_bytes[index:index + 3]
        if source_alpha > 0:
            visible_pixels += 1
            if source_rgb != target_rgb:
                visible_rgb_mismatches += 1
        elif source_rgb != target_rgb:
            hidden_rgb_mismatches += 1
    return {
        "width": source.width,
        "height": source.height,
        "mode": "RGBA",
        "dimensionsExact": source.size == target.size,
        "visiblePixels": visible_pixels,
        "alphaMismatches": alpha_mismatches,
        "visibleRgbMismatches": visible_rgb_mismatches,
        "hiddenTransparentRgbMismatchesAllowed": hidden_rgb_mismatches,
        "alphaExact": alpha_mismatches == 0,
        "visibleRgbExact": visible_rgb_mismatches == 0,
        "sourceRgbaSha256": sha256_bytes(source_bytes),
        "decodedRgbaSha256": sha256_bytes(target_bytes),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="public/assets/art/v2")
    parser.add_argument("--verify-existing", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    pipeline_report = json.loads((root / "pipeline-report.json").read_text(encoding="utf-8"))
    if not features.check("webp"):
        raise RuntimeError("This Pillow build has no WebP support")

    assets: list[dict[str, object]] = []
    total_png = 0
    total_webp = 0
    for relative_png in RUNTIME_PNGS:
        png_path = root / relative_png
        webp_path = png_path.with_suffix(".webp")
        if not png_path.is_file():
            raise FileNotFoundError(png_path)
        with Image.open(png_path) as source_image:
            source_icc = source_image.info.get("icc_profile", b"")
            source_gamma = source_image.info.get("gamma")
            source_srgb = source_image.info.get("srgb")
            source = source_image.convert("RGBA")
            if not args.verify_existing:
                save_options = {
                    "format": "WEBP",
                    "lossless": True,
                    "quality": 100,
                    "method": 6,
                    "exact": True,
                }
                if source_icc:
                    save_options["icc_profile"] = source_icc
                source.save(
                    webp_path,
                    **save_options,
                )
            elif not webp_path.is_file() or webp_path.stat().st_size <= 0:
                raise FileNotFoundError(webp_path)
            with Image.open(webp_path) as decoded_image:
                decoded_icc = decoded_image.info.get("icc_profile", b"")
                audit = visible_pixel_audit(source, decoded_image)
        if not audit["alphaExact"] or not audit["visibleRgbExact"]:
            webp_path.unlink(missing_ok=True)
            raise RuntimeError(
                f"Lossless readback failed for {relative_png}: "
                f"alpha={audit['alphaMismatches']} visibleRGB={audit['visibleRgbMismatches']}"
            )
        png_bytes = png_path.stat().st_size
        webp_bytes = webp_path.stat().st_size
        total_png += png_bytes
        total_webp += webp_bytes
        assets.append({
            "png": relative_png.as_posix(),
            "webp": webp_path.relative_to(root).as_posix(),
            "pngBytes": png_bytes,
            "webpBytes": webp_bytes,
            "savedBytes": png_bytes - webp_bytes,
            "webpToPngRatio": round(webp_bytes / png_bytes, 6),
            "pngSha256": sha256_file(png_path),
            "webpSha256": sha256_file(webp_path),
            "pngIccBytes": len(source_icc),
            "webpIccBytes": len(decoded_icc),
            "iccExact": source_icc == decoded_icc,
            "iccSha256": sha256_bytes(source_icc) if source_icc else None,
            "pngGamma": source_gamma,
            "pngSrgbIntent": source_srgb,
            **audit,
        })

    first_menu_paths = {"carriages/sleep.webp", "characters/a07/atlas.webp"}
    first_menu_assets = [asset for asset in assets if asset["webp"] in first_menu_paths]
    first_menu_bytes = sum(int(asset["webpBytes"]) for asset in first_menu_assets)
    report = {
        "schemaVersion": 1,
        "codec": "Pillow lossless WebP",
        "pillowVersion": pillow_version,
        "settings": { "lossless": True, "quality": 100, "method": 6, "exact": True },
        "sourceTool": pipeline_report.get("sourceTool"),
        "sourceModelIdentifier": pipeline_report.get("sourceModelIdentifier"),
        "assetCount": len(assets),
        "pngBytes": total_png,
        "webpBytes": total_webp,
        "savedBytes": total_png - total_webp,
        "webpToPngRatio": round(total_webp / total_png, 6),
        "pngMiB": round(total_png / 1024 / 1024, 3),
        "webpMiB": round(total_webp / 1024 / 1024, 3),
        "firstMenu": {
            "assets": [asset["webp"] for asset in first_menu_assets],
            "bytes": first_menu_bytes,
            "miB": round(first_menu_bytes / 1024 / 1024, 3),
        },
        "allDimensionsExact": all(asset["dimensionsExact"] for asset in assets),
        "allAlphaExact": all(asset["alphaExact"] for asset in assets),
        "allVisibleRgbExact": all(asset["visibleRgbExact"] for asset in assets),
        "allIccExact": all(asset["iccExact"] for asset in assets),
        "assets": assets,
    }
    report_path = root / "compression-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "report": str(report_path),
        "assets": len(assets),
        "pngMiB": report["pngMiB"],
        "webpMiB": report["webpMiB"],
        "savedMiB": round((total_png - total_webp) / 1024 / 1024, 3),
        "ratio": report["webpToPngRatio"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
