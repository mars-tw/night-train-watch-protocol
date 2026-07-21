# GPT carriage and crop asset prompts

The five carriage configurations and three four-stage crop strips were produced with Codex built-in GPT image generation. The public game contains no runtime API key or generation call. The exact generated masters are retained under `public/assets/source/carriages/` and `public/assets/source/crops/`.

## Shared carriage constraints

- Use the existing `carriage-prep.png` as an identity, fixed-camera and palette reference.
- Keep a vertical 9:16 mobile-game composition, rear door/window, right side window, worn riveted metal architecture and A-07 as the same adult East Asian woman.
- Cozy-horror pixel-art illustration, warm amber interior against cool cyan fog, readable at phone size.
- No UI, text, logos, watermark, frame or duplicated character.
- Change the actual furniture, storage and equipment so each configuration reads immediately while retaining one train design language.

### Sleeping carriage

> Reconfigure the reference as a quiet sleeping and morale carriage: made lower bunk, blankets, personal shelf, reading lamp, books and compact private storage. Keep A-07 asleep and preserve the camera.

### Defense and cargo carriage

> Reconfigure the reference as a weapons, defense and supplies carriage: reinforced window, secured cargo racks, strapped crates, tool wall, armor plates and inspection bench. Keep paths and door readable.

### Workshop and intelligence carriage

> Reconfigure the reference as a repair and intelligence carriage: shortwave radio, route maps, electronics, cable reels, task lamp, parts drawers and a practical workbench.

### Greenhouse carriage

> Reconfigure the reference as an agricultural carriage with two clearly separate empty hydroponic grow racks on the left, water lines, reservoir and grow lamps. Do not draw mature crops into the base; runtime sprites will show growth.

### Kitchen and storage carriage

> Reconfigure the reference as a galley and food-storage carriage: safe compact stove, preparation counter, water filter, hanging cookware, dry-food shelves and secured pantry bins.

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
