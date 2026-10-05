# v2.3.1 固定畫面影格與位移修正

日期：2026-10-05。使用者回報首頁仍有動畫影格跑出框架。本輪涵蓋主選單，以及實際使用中的第一夜結算畫面。

## 原因與修正

- v2.3.0 的主選單已使用完整固定圖，但結算頁仍進入臥室場景與 A-07 坐姿動畫。本輪將主選單、結算頁統一為完整固定像素背景，提前離開角色、威脅與環境動畫繪製流程；素材優先序也只取 `menu-hero`。
- Renderer 原本持有 AppState 參照。操作會先改變畫面狀態，再非同步保存，DOM 尚未提交時動畫迴圈可能已讀到下一個場景。現在保存 render-time 的頂層快照，場景選擇以最近一次已提交畫面為準。
- 離開車廂時會釋放 pointer capture，清除未完成拖曳的 inline transform／opacity、切廂 class 及計時器。固定畫面的 CSS 再限制 Canvas 位移與動畫，防止殘留過渡影響框架。

本輪沿用像素圖片與遊戲中的正常動作，不重新生成美術或宣傳影片。既有故事、任務、資源結算、schema 6 存檔及備份保留。

## 實際驗證

| 檢查 | 結果 |
| --- | --- |
| `npm run check` | TypeScript、41 個測試檔／346 項測試、正式建置全部通過；離線 manifest 為 45 檔 |
| [Chromium 固定畫面](evidence/v231/chromium-fixed-qa.json) | 17 項通過，0 錯誤、0 非預期圖集繪製 |
| [WebKit 固定畫面](evidence/v231/webkit-fixed-qa.json) | 17 項通過，0 錯誤、0 非預期圖集繪製 |
| 真實操作路徑 | 未完成的拖曳離開、快速切廂返回、同一旅程與資源保存、實際第一夜進入結算；沒有注入進度 |
| 時間序列 | 每引擎 6 組場景，各以 0／16／50／100／320／800／1600ms 等待採樣；像素 hash 一致、Canvas 在 frame 內、無殘留 transform／class |
| 小尺寸與桌面 | 結算頁在 320×568、390×844、1366×600 檢查通過 |
| [正式版離線與效能](evidence/v231/release-qa.json) | 11 項通過；斷網重載恢復同一 run，完整圖片；兩個視口的三跑中位 p95 均 16.7ms |
| [獨立覆核](evidence/v231/independent-review.md) | PASS；檢查快照邊界、固定畫面、計時器及 pointer capture 清理 |

瀏覽器證據由 Windows 桌面 Chromium／WebKit 取得，未測量實體 iOS／Android。頂層快照並非深拷貝，`run`、`settings` 仍共用巢狀參照；它保證本次所需的畫面選擇提交邊界，不宣稱所有遊戲資料皆完全隔離。本輪沒有重做整份角色圖集的 gutter。

## 重跑

先啟動 `npm run dev -- --port 4177`，執行 `npm run audit:fixed`。切換引擎可設定 `QA_BROWSER=webkit`，`GAME_URL` 與 `EVIDENCE_DIR` 可指定測試網址與輸出。測試使用隔離瀏覽器，操作真實介面，並只讀取自己的測試存檔，不會清理玩家資料。

GitHub CI／Pages 與公開版證據隨 v2.3.1 release 留存；更新完成後重新開啟即可使用新版，無需刪除存檔。
