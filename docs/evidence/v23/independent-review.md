# v2.3.0 獨立唯讀覆核

覆核結論：**PASS，source release 沒有必修 blocker。** 本文件是原生獨立上下文的唯讀覆核，不是不同模型或實體手機驗證。覆核者未修改產品來源，只在來源凍結後新增本報告。

## 覆核結果

- 手機幾何已改為單一可視 viewport 高度；720×1280 Canvas、裝飾、作物與設備熱區共用同一個 9:16 scene rectangle。Chromium 149 與 Windows Playwright WebKit 26.5 各 24 組尺寸／100、120、140% 選項、存檔、旋轉與高度變化皆為 PASS，兩份紀錄的 `audioContextStub` 都是 `false`。
- 覆核期間曾發現 390×844、140% 時標題底部約 158px、ready badge 頂端 150px 的實際重疊。最終版把存檔／離線狀態移到固定底列，actions 額外預留 56px；凍結後證據中同案例為 brand bottom 158px、actions bottom 762px、status top 774px，已無碰撞。failed/retry 狀態另保留 48px 高度並通過五視口檢查。
- 主選單只載入並繪製完整 `menu/hero.webp`；既有 run 不會帶入角色動畫、車體搖晃或窗景動畫。pixel QA 在等待前後得到相同 Canvas pixel hash，且沒有請求獨立角色圖集。
- 五節車廂為新的細緻像素 raster；A-07 使用 7 段、52 個真實畫格。角色以 192×192 正方形 cell 繪到 `(228, 318, 360, 360)`，沒有拉伸；sleep clip 的臉部對位 variance 降至 X 0.047788／Y 0.06141。完整頭部與首夜提示的實際幾何不重疊。
- 12 張 `lettuce`／`tomato`／`herb` 生長圖已接到 runtime，舊 crop-box request 為 0；greenhouse 背景不再預畫成熟蔬菜，舊預設設備也不再疊出第三個槽。12 張作物與 7 段角色都列入 production precache。
- Web Audio 缺失、建構失敗或 `resume()` 被拒絕時，`AudioService.enable()` 會正常結束，遊戲指令不會被音訊權限阻斷。真 WebKit 矩陣沒有使用 AudioContext stub。
- 離線快取共 45 檔、21,381,011 bytes（約 20.39 MiB），build id 為 `f6c22ea3c58dd913`。首頁首次載入只需要一張 1,282,512-byte hero 圖；ready、failed/retry、舊快取離線重載與修復更新流程皆有 browser 證據。

## 驗證依據

- 主代理凍結後回報 `npm run check`：40 個 test files、341 項測試通過；production build 成功。覆核者另在凍結前後針對 viewport、scene mapping、audio fallback、renderer、v23 raster／crop integrity 與 offline precache 執行聚焦測試，最後一次為 7 個 files、18 項測試通過。
- [Chromium layout](after-mobile-layout.json)、[WebKit layout](after-webkit-layout.json)、[UI gameplay](ui-qa.json)、[pixel QA](pixel-qa.json)、[raster QA](raster-qa.json)、[loading QA](loading-qa.json) 與 [release QA](release-qa.json) 均為 PASS，沒有記錄 failures／browser errors。
- release QA 的三跑中位 p95 在 1366×600 與 390×844 都是 16.7ms。1366×600 第三跑為 33.3ms；原始 outlier 有保留，沒有為取得較好數字而重跑。
- `git diff --check` 通過；主代理回報 source secret scan 無 token 命中。素材報告保留來源、Blender 5.2 處理、Closest sampling、lossless WebP、hash 與 A-07 spill 清理紀錄。

## 已知限制

- 390×844 是 Windows 桌面 Chromium 的手機尺寸 viewport；WebKit 26.5 也是 Windows Playwright runtime。沒有 iOS／Android 實體手機效能或 Safari 實機證據，不能把這些結果描述為 physical-phone QA。
- 目前結論核准 source release／PR。GitHub CI、merge、Pages 部署及公開網址內容驗證仍屬後續發布步驟；完成前不能宣稱公開版已更新。
- 圖像工具沒有提供可核實的模型 slug，因此紀錄為 `null` 是正確做法。角色生成邊緣的 34,990 個指定 spill 像素由 Blender 材質管線清除；這不應描述成生成工具自行產出乾淨 alpha。
