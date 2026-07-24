# Shipping Asset Manifest

All files below are used by the game runtime. Generation occurred on 2026-07-20 and 2026-07-21 using Codex built-in GPT image generation mode. Chroma-key sprites were locally converted to alpha PNG with the installed `remove_chroma_key.py` helper and validated for RGBA mode, transparent corners and non-empty alpha bounds.

| Runtime file | Purpose | Production brief | Validation |
|---|---|---|---|
| `carriage-sleep.png` | 臥室車廂 | Same fixed train camera and A-07 identity; made bed, personal shelf, reading lamp and private storage. | Loaded by Canvas; distinct art-key and 390×844 screenshot QA. |
| `carriage-defense.png` | 武器物資車廂 | Same train architecture with reinforced window, secured supply racks, tool wall and defense hardware. | Loaded by Canvas; distinct art-key and 390×844 screenshot QA. |
| `carriage-workshop.png` | 工坊情報車廂 | Same train architecture with radio, maps, electronics and repair workbench. | Loaded by Canvas; distinct art-key and 390×844 screenshot QA. |
| `carriage-greenhouse.png` | 溫室車廂 | Same train architecture with two empty hydroponic racks; runtime crop sprites are layered into those racks. | Loaded by Canvas; distinct art-key and sow/grow/harvest browser QA. |
| `carriage-kitchen.png` | 廚房儲藏車廂 | Same train architecture with stove, water filtration, food shelves and preparation counter. | Loaded by Canvas; distinct art-key and 390×844 screenshot QA. |
| `carriage-menu.png` | SCR-MM-A/B background | Approved carriage-prep master reused with a darker native UI overlay to maintain character and carriage continuity. | Loaded by Canvas; menu screenshot QA. |
| `carriage-night.png` | SCR-CV-B scene | Same carriage composition and A-07 identity at night; colder blue fog, rain and distant infected silhouettes; no UI or text. | Loaded by Canvas; night screenshot QA. |
| `threat-knocker.png` | T002 敲窗者 layer | Isolated adult infected window-contact sprite; hard-edged dark pixel clusters, cyan rim light, no gore; generated on flat chroma green and converted to alpha. | RGBA, four transparent corners; renderer and asset test reference. |
| `threat-clinger.png` | T003 攀附者 layer | Isolated adult infected clinging upside-down outside the train roof; long tense limbs, torn coat, hidden face, blue-black pixel art, cyan rim light, no blood or gore; flat `#00FF00` background, no environment/UI/text. | RGBA 1254×1254; alpha extrema 0–255; corners 0; bbox `(371,74,925,1169)`; renderer and asset test reference. |
| `decor/lantern.png` | Movable carriage furnishing | GPT-authored brass railway lantern, warm amber core and cyan rim; flat green chroma source retained. | Runtime 256×256 RGBA; transparent corners; alpha bbox `(82,18,174,238)`; drag/reload browser QA. |
| `decor/radio.png` | Movable carriage furnishing | GPT-authored battered shortwave railway radio, amber dial and worn steel; flat green chroma source retained. | Runtime 256×256 RGBA; transparent corners; alpha bbox `(29,18,226,238)`; drag/reload browser QA. |
| `decor/toolbox.png` | Movable carriage furnishing | GPT-authored red steel mechanic toolbox with visible hand tools; flat green chroma source retained. | Runtime 256×256 RGBA; transparent corners; alpha bbox `(25,18,230,238)`; drag/reload browser QA. |
| `decor/fern.png` | Movable carriage furnishing | GPT-authored hardy fern in a riveted train planter; flat magenta chroma source retained. | Runtime 256×256 RGBA; transparent corners; alpha bbox `(36,18,219,238)`; drag/reload browser QA. |
| `crops/{lettuce,tomato,herb}-{0..3}.png` | Two-slot agriculture growth states | Three GPT-authored four-stage growth strips: seed tray, young sprout, established plant and mature harvest state. Runtime shows the stage inside the greenhouse and control panel. | Twelve 256×256 RGBA sprites; transparent corners; processed by `tools/process-crop-sheets.py`; two-night browser QA. |

## Licensing

The generated images in `public/assets/art/` are released under CC BY 4.0 with attribution to “Night Train: Watch Protocol contributors”. GPT carriage masters are retained under `public/assets/source/carriages/`; crop chroma strips are retained under `public/assets/source/crops/`. These reproducibility sources are not loaded by the runtime. Prompt specifications and processing commands are documented in [`DECOR_ASSET_PROMPTS.md`](DECOR_ASSET_PROMPTS.md) and [`CARRIAGE_CROP_ASSET_PROMPTS.md`](CARRIAGE_CROP_ASSET_PROMPTS.md).

The original UI reference images are not embedded in these assets. Layout, token and interaction decisions were reimplemented as native HTML/CSS/Canvas based on the supplied specification.

## Open-source gameplay previews

The repository commits browser-captured gameplay previews under `public/assets/screenshots/`. Files `09-repaired-carriage.png`, `10-route-preview.png`, and `11-module-preview.png` document the v0.3.1 repair and read-only preview loops. Files `12-decor-placement.png` and `13-decor-in-play.png` document the v0.4.0 free-drag milestone. Files `14-sleep-carriage.png` through `19-slot-placement.png` were refreshed from the v0.7.0 runtime and prove the five distinct configurations, mature agriculture state and valid/invalid placement UI. Files `20-compact-observation.png` and `21-collapsible-power.png` prove the 360×640 observation layout and explicitly opened utility drawer. Files `22-swipe-guidance.png` and `23-action-feedback.png` prove the first-use swipe teaching, preparation AP instrument and immediately visible resource delta tickets. All are produced from the playable browser runtime; they are not detached mockups.
