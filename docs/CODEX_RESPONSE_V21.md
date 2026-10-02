# 圖片動畫開源更新驗收

日期：2026-10-03，版本2.1.0。依使用者要求，主要場景與控制使用漂亮手繪圖片，移除可見SVG及主要物件的程序幾何占位。

- 五廂背景從既有生成原圖經Blender平滑重製，沒有nearest量化或額外變暗處理。
- 32格圖片圖示、16道具、16環境格、兩幅紙本地圖與兩張PNG平台icon均接入runtime。蒸氣、火焰與葉片各四個不同畫格；A-07及威脅原有真姿勢保留。
- 主要場景熱區、工具、車廂列、資源圖示與地圖已用PNG／WebP；移除生硬房間與設備fallback，載入時只顯示底色。
- 成本、任務、存檔、反制與三線主線權威邏輯未修改，仍由原service提交。

| 檢查 | 結果 | 證據 |
| --- | --- | --- |
| TypeScript／Vitest／build | 26檔／303項通過 | npm run check |
| 真圖片動畫與SVG | 四視口38項檢查，Canvas實際使用四個不同火焰crop；SVG DOM／request皆0 | [raster-qa.json](evidence/v21/raster-qa.json) |
| 操作與字級 | 五視口×三字級，fresh兩夜流程通過 | [ui-qa.json](evidence/v21/ui-qa.json) |
| 正式離線／效能 | 11項通過，同一run斷網重載；兩視口三跑中位p95皆16.7ms | [release-qa.json](evidence/v21/release-qa.json) |
| 素材 | 九WebP共1,760,324 bytes／1.679 MiB，71格hash唯一；兩PNG app icon另列 | [pipeline-report.json](../public/assets/art/v21/pipeline-report.json) |
| 完整快取 | 38個檔案，14,262,879 bytes／13.602 MiB | build manifest與正式離線驗收 |
| 獨立覆核 | 兩個原阻礙已修正並讀回，無剩餘發布阻礙 | [覆核記錄](reboot-v21/INDEPENDENT_REVIEW.md) |

前後畫面：[更新前](evidence/v21/screenshots/before-390.png)、[更新後](evidence/v21/screenshots/390-sleep.png)。三種手機視口及矮筆電畫面均在evidence/v21/screenshots。

新WebP使用quality92，alpha編碼readback誤差為0；RGB有損壓縮的mean error已列報告，不冒稱lossless。圖示是暖木底圖片圖塊，道具與環境保留透明。來源PNG、draft與處理PNG、Blender檔及實際提示均保留。

本輪使用內建圖像工具＋Blender。工具未提供可驗證模型identifier，metadata保持null。實體手機效能與真人研究未執行，不把桌機視口當成實體裝置。

開源程式／文件沿用AGPL-3.0-or-later，美術沿用CC BY4.0。原廣告照片與私人資料未加入公開專案。發布與部署狀態以 [v2.1.0 release](https://github.com/mars-tw/night-train-watch-protocol/releases/tag/v2.1.0) 及 [Actions](https://github.com/mars-tw/night-train-watch-protocol/actions) 為準。
