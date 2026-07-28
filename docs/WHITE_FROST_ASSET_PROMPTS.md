# R02 White Frost GPT runtime assets

The two v1.0 R02 scene plates were generated on 2026-07-28 with Codex built-in GPT image generation. The UI visual-direction board and existing greenhouse carriage were supplied only as design, camera, material and lighting references. The T009 image was then generated as a geometry-preserving weather edit of the accepted White Frost carriage. Neither image contains UI, text, target markers or a runtime API dependency.

| Runtime file | Reference roles | Accepted composition and gameplay use |
|---|---|---|
| `public/assets/art/story/carriage-frostline-gpt-v1.png` | `00_場景美術方向參考圖.png`: warm/cold design language; `carriage-greenhouse.png`: fixed camera, industrial material and aspect reference. | Original 9:16 carriage with three separate physical zones: left insulated BERTH, central/right DEICER cabinet and right heated LOOP/crop-water equipment. Native HTML/Canvas renders heat tokens, branch equipment states and hit targets above the image. |
| `public/assets/art/story/threat-blizzard-gpt-v1.png` | Accepted White Frost carriage: exact geometry target; `threat-fog-vine-gpt-v1.png`: threat-scene contrast and interactive foreground reference only. | Same 9:16 geometry under active blizzard conditions. All three frost-front paths remain equally readable; the deterministic pair is selected only by runtime state. |

## Prompt: White Frost carriage

```text
Use case: stylized-concept
Asset type: final runtime background for a vertical mobile survival-management game, R02 White Frost train carriage
Primary request: a distinctly different White Frost operations carriage prepared for extreme cold, with three separate gameplay zones: an insulated BERTH, a DEICER/traction zone and a heated LOOP serving plants and water pipes.
Scene/backdrop: narrow industrial train carriage crossing a blizzard-covered snowfield at night; iced electrical wires and a frozen rail switch visible through the rear door window.
Composition/framing: exact portrait 9:16, fixed straight-on camera, centered aisle and rear door, clean readable surfaces over all three zones, bottom 15 percent relatively uncluttered.
Lighting/mood: warm amber practical lamps inside and cold white-blue blizzard light outside.
Constraints: original image; no UI, HUD, text, labels, target markers, watermark, person, monster or weapon; keep critical objects separate for state-driven overlays.
```

## Prompt: T009 Blizzard edit

```text
Use case: lighting-weather
Asset type: final runtime T009 Blizzard threat background
Primary request: transform only the accepted White Frost carriage into an active environmental contact while preserving exact geometry, camera, zones and object locations.
Subject: a violent whiteout, frozen electrical wires and three separate frost-front paths corresponding to BERTH, DEICER and LOOP. Keep all three potential zones equally readable so runtime can mark any deterministic pair.
Lighting/mood: emergency cold blue-white exterior, weakened amber interior lamps, visible crystalline frost seams and subtle cold haze.
Constraints: change only weather, frost, ice, cold light and environmental stress; no UI, text, labels, selection glow, target markers, watermark, person, monster, vines, weapon or foreground tool.
```

The built-in generator saved 941×1672 PNG outputs (9:16 within rounding). They were copied non-destructively into the runtime directory without cropping, alpha conversion or content edits.
