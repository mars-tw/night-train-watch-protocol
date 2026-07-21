# GPT movable decoration asset prompts

These four sprites were generated with Codex built-in GPT image generation, then converted from flat chroma-key backgrounds to alpha PNG with the installed `remove_chroma_key.py` helper. `tools/process-decor-sprites.py` crops, scales, pads, and validates the 256×256 runtime files. The original chroma images are committed under `public/assets/source/`.

Shared production constraints for every prompt:

- Use case: `stylized-concept`.
- Asset type: movable 2D furnishing sprite for a vertical mobile browser game.
- Style: detailed cozy-horror pixel art with a crisp 32-bit game-sprite aesthetic, matching a worn 1980s industrial night-train sleeping carriage.
- Composition: one centered full object, three-quarter front view, generous padding, compact readable silhouette.
- Lighting: warm amber highlight with a subtle cool-cyan rim.
- No UI, watermark, border, unrelated props, cast shadow, reflection, or background texture.

## Lantern

> A compact vintage brass railway lantern with a small steel handle, dented aged brass and dusty glass. Use a perfectly flat `#00ff00` background; do not use green in the object.

## Radio

> A battered shortwave railway radio with tuning dial, speaker grille, worn knobs, leather handle and a small antenna. Use a perfectly flat `#00ff00` background; do not use green or readable text in the object.

## Toolbox

> A small battered dark-red railway mechanic toolbox with two simple steel hand tools visible, scratched paint, dented corners and an aged brass latch. Use a perfectly flat `#00ff00` background; no letters, numbers, or logos.

## Fern

> A hardy fern with muted olive leaves in a scratched riveted railway tin planter. Use a perfectly flat `#ff00ff` background; do not use magenta in the object.

## Rebuild

After chroma removal has produced `*-full.png` files, run:

```bash
python tools/process-decor-sprites.py public/assets/art/decor public/assets/art/decor
```

The script rejects empty alpha, opaque corners, or outputs that are not 256×256 RGBA.
