# GPT carriage and crop asset prompts

The five carriage configurations and three four-stage crop strips were produced with Codex built-in GPT image generation. The public game contains no runtime API key or generation call. The exact generated masters are retained under `public/assets/source/carriages/` and `public/assets/source/crops/`. The 2026-07-24 `*-gpt-v2.png` masters replace the original shared-berth variants for defense, workshop, greenhouse and kitchen.

## Shared carriage constraints

- Use the existing `carriage-prep.png` as an identity, fixed-camera and palette reference.
- Keep a vertical 9:16 mobile-game composition, rear door/window, right side window and worn riveted metal architecture. A-07 remains visible only in the sleeping carriage; all working carriages must remove the person, bed, blanket, pillow and bedroom identity.
- Cozy-horror pixel-art illustration, warm amber interior against cool cyan fog, readable at phone size.
- No UI, text, logos, watermark, frame or duplicated character.
- Change the actual furniture, storage and equipment so each configuration reads immediately while retaining one train design language.

### Sleeping carriage

> Reconfigure the reference as a quiet sleeping and morale carriage: made lower bunk, blankets, personal shelf, reading lamp, books and compact private storage. Keep A-07 asleep and preserve the camera.

### Defense and cargo carriage

> Reconfigure the reference as an armored watch station: reinforced shutters, secured cargo racks, sensor console, observation scope, tool wall and defense hardware. Remove the entire sleeping berth and keep paths and door readable.

### Workshop and intelligence carriage

> Reconfigure the reference as a full repair carriage: dual fabrication benches, drill press, welding station, vise, cable reels, task lamps and parts drawers. Remove the entire sleeping berth.

### Greenhouse carriage

> Reconfigure the reference as a structural hydroponic farm with illuminated vertical racks, seedling trays, nutrient tank, water lines and a clear center aisle. Remove the entire sleeping berth; runtime sprites remain the interactive plot state.

### Kitchen and storage carriage

> Reconfigure the reference as a fixed train galley: safe stove, sink, dual preparation counters, hanging cookware, pantry shelves and a fold-down eating table. Remove the entire sleeping berth.

## Shared crop-strip constraints

- One horizontal strip containing four equally sized stages of the same crop: prepared seed tray, young sprout, established plant, mature harvest state.
- Detailed cozy-horror game sprite, warm amber key light and cool cyan rim, consistent hydroponic tray and perspective in every stage.
- Flat chroma background with no gradients, shadows, UI, text, numbers, frame or watermark.
- Keep each stage isolated inside its quarter so it can be split into a 256×256 transparent runtime sprite.

The three requested subjects were leafy lettuce, compact red-fruited tomato and mixed culinary herbs. Runtime assets are rebuilt with:

```bash
python tools/process-crop-sheets.py
```

The processor removes edge spill, splits all four stages, writes RGBA PNG files, and validates transparent corners.
