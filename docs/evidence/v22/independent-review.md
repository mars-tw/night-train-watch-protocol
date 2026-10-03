# v2.2.0 獨立上下文唯讀覆核

日期：2026-10-03  
範圍：新玩家指引 UI、離線狀態與 Service Worker、A-07 七段無損圖集、宣傳片格式／章節切換。此覆核為同模型的獨立上下文，不是不同模型驗證；未修改產品來源、未發布，也未重跑完整 build、完整測試或重型 QA。

## 結論

在最終凍結來源與現有實證中，沒有發現發布阻擋或仍可重現的範圍內回歸。

## 覆核結果

- 新玩家指引只讀取權威任務進度；免費查看不扣資源，播種先預覽且可取消，夜間按鈕採用 `counterReadiness` 與有效成本。原先懷疑夜間缺少任務入口，對照既有基線後撤回：舊版夜間本來沒有任務 ribbon，且 TUT-05 可在後續整備階段領取，不構成流程死路。`onboarding-qa.json` 以可見 UI 完成並領取五項教學，19 項斷言全數通過。
- 離線 ready 由目前 controller 所屬 cache 的完整 marker 決定；失敗安裝不會宣稱 ready，現行 cache 優先，前一版 cache 只作舊 hashed asset 的過渡備援。更新文案已改為「離線資料已更新，下次開啟載入新版遊戲」，符合 `skipWaiting` 後新 Service Worker 已接管、但目前頁面仍執行舊 JavaScript 的狀態。最終回報的離線瀏覽器測試涵蓋 15 組字級／視口、60 個主選單控制中心點、五視口失敗／重試、斷網重載與修復更新，均通過；本覆核沒有另行重跑該重型測試。
- A-07 七段圖集保留原始七列的 floor 座標與 8/8/8/8/8/6/6 真實幀；renderer 使用相同欄切分、每段自然高度與各段 fps／loop／keyFrame，載入前不啟動該動畫時鐘。precache 明列七段並排除完整角色 atlas。選單改由 `a07PlaybackForScene` 固定 sleep，避免殘留 run 狀態帶入錯誤姿勢。既有 lossless RGBA／alpha、瀏覽器解碼與 loading QA 證據一致。
- 宣傳片格式按鈕維護 `aria-pressed`，章節使用有標籤的原生 select，格式切換保存時間與播放／暫停狀態。曾提出章節播放後立即切格式的競態疑慮；最終 `trailer-experience-qa.json` 已在五個視口直接覆蓋該順序，連同 paused 切換、44px 可達控制、無水平溢位與錯誤偏好回退共 31 項斷言全數通過，因此疑慮關閉。
- 最終整合證據回報 `npm run check` 為 33 files／324 tests 通過，production build 為 `88c1fbdc4f6ad8a4`、44 個 precache 檔案；`release-qa.json` 11 項通過，桌面 Chromium 的 1366 與 390 視口三跑 median p95 分別為 16.8 ms 與 16.7 ms。

## 證據限制

- 390×844 效能是 Windows 桌面 Chromium 的手機尺寸視口，不是實體手機量測；`release-qa.json` 已明確標示。
- 宣傳片初始 HTML 先列橫式 source，窄螢幕再由 module 切為直式；可能產生少量重複 metadata 請求，但現有證據未顯示正確性或可用性問題，因此不列 blocker。
- 本文件依來源唯讀檢查、聚焦證據檔與主代理提供的最終測試結果形成；沒有把未親自重跑的完整套件描述為本覆核另行執行。
