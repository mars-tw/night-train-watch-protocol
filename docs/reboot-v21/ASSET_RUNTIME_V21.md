# v2.1 圖片素材 runtime

日期：2026-10-02。

## 產線與固定契約

執行程式：`tools/process-v21-art.py`。正式輸出使用 Blender 5.2 background mode，所有素材都經 image plane、emission material 與 orthographic camera render；新圖集不是把生成檔直接複製成 runtime。

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --python tools/process-v21-art.py -- `
  --output-dir public/assets/art/v21 `
  --icons <icons-4x8.png> --props <props-4x4.png> `
  --effects <effects-4x4.png> --maps <maps-2x1.png> `
  --draft-icons <icons-draft.png> --draft-props <props-draft.png> `
  --draft-effects <effects-draft.png> --webp-quality 92
```

| 資產 | 固定格線 | processed PNG | runtime WebP |
| --- | ---: | --- | --- |
| 五張車廂 | 1×1，720×1280 | `processed/carriages/{id}.png` | `carriages/{id}.webp` |
| 圖示 | 4×8，32格 | `processed/ui/icon-atlas.png` | `ui/icon-atlas.webp` |
| 道具 | 4×4，16格 | `processed/props/atlas.png` | `props/atlas.webp` |
| 環境效果 | 4×4，16格 | `processed/effects/atlas.png` | `effects/atlas.webp` |
| 紙本地圖 | 2×1，2格 | `processed/ui/maps.png` | `ui/maps.webp` |

平台 icon 另由 sleep 車廂來源的床鋪、桌燈與木作區域做正方形 crop，再經同一 Blender image-plane 管線輸出 `ui/app-icon-192.png` 與 `ui/app-icon-512.png`。它們列在報告的 `platformIcons`，不計入九個遊戲 atlas/plate，也沒有 SVG 或程序幾何覆蓋。

環境效果 row-major 順序固定為 `rain`、`frost`、`mist`、`spores`、`steam-0..3`、`flame-0..3`、`leaf-0..3`。正式報告會逐格記錄 cell bounds 與 visible/opaque pixel count。

## 透明與色彩

道具與效果來源必須含真透明像素；若 processed PNG 沒有透明像素，pipeline 直接失敗。它不做黑底去背、色鍵或 AI 猜測遮罩。來源中 alpha 不超過 2/255 的 practically invisible RGB 只按 alpha 清零，不檢查顏色；正式實測道具清除 34,672 pixels、效果清除 420,743 pixels，番茄、火焰與葉片等可見顏色不受影響。Maps 可為完整不透明紙張。

圖示採「手繪儀表圖塊」而非透明 cutout。每格 aspect-fit 後合成一致的 `#3B281D` 暖木棕 opaque tile；`pipeline-report.json` 明記 `iconsOpaqueTiles: true`，不宣稱透明。

車廂使用 Linear texture interpolation、Standard view transform、零 exposure、gamma 1。產線不量化、不 nearest-sample、不 dither、不套冷色調整。來源 SHA 直接引用 `public/assets/art/v2/source/carriage-*-source.png`，不覆寫任何 v2 檔案。

## provenance 與驗證

四張新來源 PNG 保留在 `public/assets/art/v21/source/`。內建圖像工具沒有揭露實際 model identifier，因此 `pipeline-report.json` 的 `sourceModelIdentifier` 保持 `null`，不把提示中要求的模型名稱當成已驗證識別。

正式 `pipeline-report.json` 已記錄 source、processed PNG 與 runtime WebP 的 SHA-256、dimensions、alpha 統計、WebP decoded readback 誤差、frame count、frame order、每格 alpha occupancy 與 RGBA SHA-256、單檔 bytes 與總 runtime bytes。九個 atlas/plate 的所有 cell hash 均唯一，沒有重複畫格冒充動畫。WebP quality 為 92，runtime 合計 **1,760,324 bytes／1.679 MiB**，低於 3 MiB 硬上限。

五張車廂 processed/source 平均 linear luminance 比依序為 1.0084／1.0123／1.0166／1.0111／1.0140，均未變暗。九張 WebP decoded readback 的 alpha max error 全為 0；visible RGB mean absolute error 為 0.0069–0.0137，這是 quality 92 lossy WebP 的實測結果，不宣稱 RGB lossless。

Blender 5.2.0 LTS 正式實跑完成：五張 v2 source 車廂與四張新來源共九個輸出，固定 crop、aspect-fit、PNG/WebP render、decoded readback、`.blend`、兩張 app icon 與報告均已產出。三張第一版圖集保留為 `source/v21-{icons,props,effects}-draft.png`；runtime 只引用 final source。四張 final source 與 draft 都保留原始 PNG，沒有覆寫生成檔。

報告中的 `source` 全部以 `public/assets/art/v21/` 為解析根：五張既有車廂使用 `../v2/source/*.png`，四張新來源使用 `source/*.png`。報告與產線都不寫入 Windows 絕對路徑或 `.codex/generated_images` 私有來源路徑，Linux clone 可直接解析並核對 SHA-256。`tests/v21-art-integrity.test.ts` 不依賴 Python、Pillow 或 Blender，會驗證 source／processed PNG／runtime WebP hash、每格 uniqueness、PNG favicon signature/dimensions、所有 `pngSource` 存在，以及 runtime manifest／HTML／scene manifest／CSS 沒有 SVG 參照。

保存 Blender 專案前會執行 `pack_all()`。正式 `.blend` 已重新開啟讀回：最後平台 icon 場景使用的一張 FILE texture 為 `packed=True`，report 路徑為 `//pipeline-report.json`；不依賴原電腦的圖片絕對路徑。其餘素材可由保留來源與產線腳本重製。
