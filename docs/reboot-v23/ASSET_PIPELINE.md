# v2.3 raster asset pipeline

Date: 2026-10-03

## Asset boundary

The six v2.3 scene sources are original raster outputs created with the built-in `image_gen` tool. The host does not expose a model slug, so `pipeline-report.json` records `sourceModelIdentifier: null` instead of guessing one. The four user-supplied advertising JPEG references are visual references only and are not copied into this repository.

The menu hero is a complete static composition with one sleeping A-07. Gameplay carriage sources are empty rooms; the renderer places the gameplay character separately. This keeps the menu stable while preserving the existing gameplay animation and interaction anchors.

## Blender finishing pass

`tools/process-v23-art.py` runs in Blender 5.2 LTS. Each source is copied non-destructively into `public/assets/art/v23/source/`, loaded as sRGB, attached to an emission material, and rendered from an orthographic camera at 720×1280. The camera uses a deterministic centred cover crop for the 360×640 logical viewport.

The finishing pass is deliberately neutral: Standard view transform, no look, exposure 0, gamma 1, Closest texture sampling, and a 0.01 render filter. It does not pixelate, palette-quantize, sharpen, dither, denoise, blur, or add noise. Fine pixel clusters and stepped outlines must exist in the authored source; the processing pass cannot be used as evidence that a smooth source became valid pixel art.

Processed PNG files are encoded as lossless WebP through Pillow/libwebp. The pipeline decodes both files to RGBA with FFmpeg and fails if any pixel differs. Runtime paths are:

- `./assets/art/v23/menu/hero.webp`
- `./assets/art/v23/carriages/sleep.webp`
- `./assets/art/v23/carriages/kitchen.webp`
- `./assets/art/v23/carriages/greenhouse.webp`
- `./assets/art/v23/carriages/defense.webp`
- `./assets/art/v23/carriages/workshop.webp`

The final `pipeline-report.json` stores portable source, processed PNG, and runtime paths; SHA-256 hashes; dimensions; crop coordinates; sampling; encoded byte sizes; and exact decode verification. `v23-art-pipeline.blend` is the saved native Blender source.

## Composition and animation contracts

- Menu hero: static composite; the visually checked A-07 head anchor is approximately `(0.58, 0.34)` in normalized hero coordinates.
- Sleep gameplay background: empty bed; the empty pillow anchor is approximately `(0.55, 0.35)`. The renderer owns the final gameplay character overlay position.
- Other gameplay carriages: background-only scene art; character and interactive state remain renderer-owned.
- A-07 grid: exactly 8 columns × 7 rows and 52 true frames in row-major order. The seven runtime clips are 1536×192, with eight 192×192 cells per row; `drink` and `settle` use six true frames followed by two transparent cells. The virtual sheet contract is 1536×1344. A single shifted or transformed still does not satisfy the contract.

The generated A-07 source retained pure-red and lemon-yellow edge spill. Blender converts only the two recorded sRGB predicates to alpha before the transparent/emission material renders each cell. The original source stays unchanged. The report records the number of removed pixels and requires zero matching visible pixels after processing. It does not claim that `image_gen` produced a clean alpha edge.

Sleep-frame alignment uses the largest connected skin-colour component inside an upper face ROI, which excludes the pillow and blanket. Each frame keeps its real pose and receives only a recorded integer canvas translation toward the common face anchor. All other clips keep zero translation. Every source face/head measurement, translation, and processed frame hash is stored in `a07-clips/manifest.json` and `A07_ALIGNMENT_REPORT.json`.

Visual acceptance is performed on each authored source before processing. Automated integrity tests cover traceability, hashes, 720×1280 output, exact lossless readback, neutral processing flags, the 20 MiB scene runtime budget, and the optional A-07 grid geometry; they do not claim visual quality by themselves.

## Crop sprites

The greenhouse crop replacement uses a separate native pipeline, `tools/process-v23-crops.py`, so rebuilding crops cannot alter the verified scene or A-07 outputs. Its generated source is preserved at `source/crops-sprite-sheet-source.png` and split by fixed floor boundaries into four growth stages for each of the three rows: lettuce, tomato, and herb.

All twelve sprites are 192×192. Blender uses fixed cell UVs, Closest sampling, a transparent/emission material, and a neutral Standard transform. Processed PNG and lossless WebP read back to identical RGBA pixels. The native source is `v23-crops-pipeline.blend`; the report is `crops/pipeline-report.json`.

No red/yellow spill predicate is applied to crops. Red tomatoes and yellow-green leaf highlights are authored palette colours, so applying the A-07 global threshold would remove valid art. The report records this explicit no-removal decision.
