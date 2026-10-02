# 圖片動畫獨立覆核

日期：2026-10-03。覆核由內建協作代理的獨立上下文完成，沒有改檔或發布；不聲稱跨模型覆核。

檢查 renderer／manifest、圖示初始化、CSS 格線定位、PNG app icon、PWA、38 項 precache、素材來源及既有控制契約。九項素材來源可在 Linux clone 解析，source／PNG／WebP 的 SHA 可驗；圖集畫格唯一；成本、disabled 和 data-action 契約沒有改變。

初次覆核有兩個發布阻礙：新增資產測試的 regex capture 型別未縮窄，以及 preview 停止時留下的失敗離線證據。主代理已使用 const＋明確缺值 throw 修正型別，並重啟正式 preview 後重新驗收。

最後唯讀覆核確認兩者均已解除：正式版報告 PASS，11／11 checks、0 failures、0 browser errors；1366×600 與 390×844 每個視口三跑，每跑160 samples，中位 p95 均16.7ms。主代理完整 check 已26檔／303項、TypeScript與build通過。覆核者讀回修正與證據，沒有重跑效能干擾量測。

處理紀錄明示不做色鍵去背，只清除 alpha≤2／255 的近透明RGB；圖示採不透明暖木圖塊，不宣稱透明cutout。模型識別沒有可驗證資料，保持null。

手機尺寸資料來自 Windows desktop Chromium，實體 iOS／Android 與真人盲測仍未執行。
