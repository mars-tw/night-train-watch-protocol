# R03 Green Tide GPT Asset Record

These three production images were generated on 2026-07-28 with Codex built-in GPT image generation and are loaded by the shipping Canvas renderer. No OpenAI API key or generation credential is stored in the repository. The briefs below record the reproducible art direction; a new generation is expected to vary and must pass the same runtime screenshot QA before replacement.

## Shared art direction

- Night Train fixed camera and mobile-first 9:16 composition.
- Rusted industrial rail carriage, closed-loop greenhouse plumbing and readable central aisle.
- Palette: `#090E12`, `#192329`, `#F5E8D8`, `#E2A85D`, `#7EA57A`, `#C2604E`.
- Painterly pixel-art texture, rain-dark metal, amber work lights and cyan-green instrumentation.
- Environment only: no baked game UI, labels, captions, logos or selected-state highlights.
- Interactive areas must remain visually separate so HTML controls and Canvas state overlays can align with them.

## `carriage-greentide-gpt-v1.png`

Production brief:

> Create a fixed-camera 9:16 interior of a night train greenhouse transformed into a closed living-water circuit. Show two separate grow beds, a central root loop, intake pipes, filter plumbing and a clear walkway. Make it structurally different from the sleeping, defense, workshop and kitchen cars. Keep the upper and lower interaction zones readable, without UI or text.

Runtime use: `SceneRenderer.drawGreenCarriageLayer()` composites the 941×1672 plate into every R03 greenhouse scene. Crops, contamination, roots and movable objects remain live state layers above it.

SHA-256: `5f8d79ff27c69bcd763a72b39232fcc990dbfdb152c8b67fe4c88bb825343b9f`

## `greentide-branch-equipment-gpt-v1.png`

Production brief:

> Create one 3:2 production sheet divided into three equal, clearly separated railway equipment views with the same camera, scale and lighting: CULTIVATE uses an amber grafting ring and controlled living canopy; FILTER uses a mechanical multi-stage filter tower with visible chambers and pressure lines; PURGE uses a sealed incineration rail with shutters and a dark firebreak. No labels, UI or text.

Runtime use: the 1536×1024 sheet is cropped by thirds in `drawGreenBranchEquipmentLayer()`. CULTIVATE is shown in the greenhouse, FILTER in the workshop and PURGE in the defense car only after the irreversible Day 4 branch.

SHA-256: `1bd2433dab7e57bd26ea8bb752184b0cc9545b95e4532df6203c26dafbaa967d`

## `threat-t008-gpt-v1.png`

Production brief:

> Create the danger-state version of the Green Tide carriage from the same fixed 9:16 camera. A hidden infected lurker should be discoverable through three physically distinct evidence zones: canopy, filter housing and under-bed or lower service cavity. Use root displacement, condensation and reflected light as non-colour clues. Keep all three zones unobstructed for tap targets; no gore, UI, labels or answer marker.

Runtime use: the 941×1672 plate is selected for T008. The renderer and DOM add live CANOPY／FILTER／UNDERBED inspect markers, first-miss reveal and manual-seal fallback without baking the correct answer into the art.

SHA-256: `879a2aeef738cc0e5234c67226dac174508b302ced2bdee2271b0884cdeb029b`

## Replacement gate

A replacement is shippable only when it is referenced by the renderer, appears in the open-source browser screenshots, keeps all interactive controls centre-hittable at 390×844 and 360×640／140%, and passes `npm run check` plus `npm run audit:green`.
