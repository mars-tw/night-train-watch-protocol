# v2.2 圖集網路評估

本輪只測試既有 Blender 管線產出的 7 張 PNG 圖集，不生成、不重畫，也不改角色、動作、畫格順序、pivot 或 atlas 尺寸。原始 `public/assets/art/v2` PNG 與 lossless WebP 全數保留作來源與 provenance；runtime 已改用七張逐列、逐 byte 相同的 v22 A-07 lossless WebP，precache 也只收這七張 clip，不再收完整 A-07 atlas。主選單只載入 sleep，遊戲中依狀態載入目前 clip 與下一個相關 clip。

## 畫質結論

`tools/audit-v22-atlas-boundary.py` 最後只測 q98 與 q100。評估排除 alpha=0 的透明像素，對黑色、紙色、藍灰色三種 matte 分別計算：

- 完整解析度 `alpha > 0` 可見像素 MAE。
- 完整解析度 opaque 像素 MAE。
- 每張 atlas 的每一幀縮入 64×64 後，可見與 opaque 像素 MAE。
- alpha readback 必須逐 byte 相同。

q98 七張合計 5,265,288 bytes；最差完整 visible／opaque MAE 分別為 2.044779／3.742292，最差逐幀 64px visible／opaque 為 1.535629／2.488449。q100 合計 5,589,940 bytes；對應數值為 1.964275／3.666667 與 1.485534／2.471947。兩者 alpha 都 exact，但都無法同時通過 1.5/255 visible 與 opaque 門檻，因此沒有採用 v22 lossy atlas，也不以透明面積稀釋後的 full-canvas MAE 宣稱畫質通過。完整逐資產、逐幀、三 matte 數據在 `docs/reboot-v22/reports/ATLAS_LOSSY_BOUNDARY_REPORT.json`。

## A-07 lossless clip 資產

A-07 原 lossless atlas 為 1,507,430 bytes。正式 clip 從該 WebP 解碼，以 `floor(row * 1174 / 7)` 得到列界線 `[0, 167, 335, 503, 670, 838, 1006, 1174]`，再用 Pillow `lossless=True, quality=100, method=6, exact=True` 編碼。七段合計 1,464,004 bytes；sleep 為 207,658 bytes。每張重新解碼後，完整 RGBA、alpha 與來源 crop 逐 byte 相同。正式檔位於 `public/assets/art/v22/a07-clips/`，公開 `manifest.json` 只含 renderer 所需的來源 box、clip box、尺寸、bytes 與 hash；完整 QA 在 `docs/reboot-v22/reports/A07_CLIPS_LOSSLESS_REPORT.json`。

現有 A-07 atlas 的 8×7 網格 cell 為非整數尺寸。`manifest.json` 因此逐幀記錄 `floor(column * 1340 / 8)` 的原 atlas 與 clip 座標，不把格寬簡化成整數常數。Renderer 以 local row 0 和同一個 floor 公式裁切，保留 52 個原姿勢幀、pivot、動作選擇與動畫時鐘；完整 atlas 不在 runtime source table 或離線 precache 中。

可重跑邊界檢查：

```powershell
& 'C:\\Users\\digimkt\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe' tools\\audit-v22-atlas-boundary.py
```

候選檔只寫入 `.codex-tmp/v22-atlas-boundary`，報告完成後立即清除，不會進入 `public` 或 precache。

可重建正式 lossless clips：

```powershell
& 'C:\Users\digimkt\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools\build-v22-a07-clips.py
```
