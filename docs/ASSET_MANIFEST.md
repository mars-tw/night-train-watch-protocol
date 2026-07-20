# Shipping Asset Manifest

All files below are used by the game runtime. Generation occurred on 2026-07-20 using Codex built-in image generation mode. Chroma-key sprites were locally converted to alpha PNG with the installed `remove_chroma_key.py` helper and validated for RGBA mode, transparent corners and non-empty alpha bounds.

| Runtime file | Purpose | Production brief | Validation |
|---|---|---|---|
| `carriage-prep.png` | SCR-CV-A and menu scene | Fixed vertical night-train carriage; adult East Asian woman A-07 asleep on the lower bunk; hydroponic vegetables, heater, right window and rear rail view; cozy-horror pixel art; warm amber and fog cyan; no UI or text. | Loaded by Canvas; 390×844 screenshot QA. |
| `carriage-menu.png` | SCR-MM-A/B background | Approved carriage-prep master reused with a darker native UI overlay to maintain character and carriage continuity. | Loaded by Canvas; menu screenshot QA. |
| `carriage-night.png` | SCR-CV-B scene | Same carriage composition and A-07 identity at night; colder blue fog, rain and distant infected silhouettes; no UI or text. | Loaded by Canvas; night screenshot QA. |
| `threat-knocker.png` | T002 敲窗者 layer | Isolated adult infected window-contact sprite; hard-edged dark pixel clusters, cyan rim light, no gore; generated on flat chroma green and converted to alpha. | RGBA, four transparent corners; renderer and asset test reference. |
| `threat-clinger.png` | T003 攀附者 layer | Isolated adult infected clinging upside-down outside the train roof; long tense limbs, torn coat, hidden face, blue-black pixel art, cyan rim light, no blood or gore; flat `#00FF00` background, no environment/UI/text. | RGBA 1254×1254; alpha extrema 0–255; corners 0; bbox `(371,74,925,1169)`; renderer and asset test reference. |

## Licensing

The generated images in `public/assets/art/` are released under CC BY 4.0 with attribution to “Night Train: Watch Protocol contributors”. The chroma source files in `public/assets/source/` are retained for reproducibility and are not loaded by the runtime.

The original UI reference images are not embedded in these assets. Layout, token and interaction decisions were reimplemented as native HTML/CSS/Canvas based on the supplied specification.

