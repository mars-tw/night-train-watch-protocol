# T004–T006 GPT story threat assets

The three v0.9 threat scene plates were generated on 2026-07-26 with Codex built-in GPT image generation. Existing Night Train carriage and threat PNGs were supplied only as style and perspective references. The generated images contain no UI or text; the playable controls remain native HTML/CSS overlays.

| Runtime asset | Prompt brief | Required interaction zones |
|---|---|---|
| `public/assets/art/story/threat-fog-vine-gpt-v1.png` | A bronze industrial greenhouse carriage at night; gray fog and a charcoal-green vine enter through the rear door, one crop tray carries a pale root knot, and a railway pruning cutter rests in a lower tool cradle. | Two crop trays and one cutter cradle. |
| `public/assets/art/story/threat-echo-passenger-gpt-v1.png` | A dark communications carriage with two almost identical passengers outside a rain window; one cyan circular signal and one amber triangular signal use different three-beat light patterns. | Two passenger/signal channels. |
| `public/assets/art/story/threat-silent-crowd-gpt-v1.png` | A greenhouse observation carriage surrounded by silent fog silhouettes; two plant beds react differently and a wall meter has a deflected cyan-lit needle. | Left leaves, right leaves, and wall meter. |

Shared prompt constraints were: vertical 9:16 framing, high-detail painterly pixel art, bronze/cyan practical lighting, readable phone-size silhouettes, no gore, no words, no letters, no watermark, no buttons, no flattened UI, and quiet top/bottom safe areas for the browser HUD.

The selected masters were resized to the runtime Canvas resolution and losslessly stored as palette PNG:

```text
sharp(input)
  .resize(720, 1280, { fit: "cover" })
  .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
```

Only the three selected, runtime-referenced files are committed under `public/assets/art/story/`. The game loads them through `src/game/renderer.ts` when the corresponding T004, T005, or T006 contact is active.
