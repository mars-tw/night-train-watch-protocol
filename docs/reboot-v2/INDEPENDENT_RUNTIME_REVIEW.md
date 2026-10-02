# v2.0.1 載入與離線覆核

日期：2026-10-02。由內建協作代理的獨立上下文唯讀覆核，主代理整合與發布；不稱為跨模型或外部 ChatGPT 驗證。

覆核範圍為 `scene-loader.ts`、`renderer.ts`、`scene-manifest.ts`、離線 manifest 產生器、service worker 及 CI 的 Chromium 安裝。

第一次覆核發現：圖片三次瞬時失敗後，切走再返回仍無法排入，必須重整頁面。已修正為 failed key 離開需求集合時清除嘗試記錄；同場景 render 仍不會無限重試。已不需要的 active failure 也會清除記錄。第二次唯讀覆核確認修正通過；回歸測試實跑 8／8 通過。

其餘結果：

- 佇列取消只移除未開始的工作；進行中的載入仍受併發 2 限制，不會把舊車廂畫到新場景。
- 常駐圖片預算不淘汰目前需要或載入中的素材，淘汰時同步清除 queue 狀態。
- Precache 33 項涵蓋目前 JS／CSS、HTML、manifest、icon、12 作物、4 裝飾與12 v2 WebP。舊 PNG、source 與 QA 截圖保留但不加入安裝。
- Service worker 採完整 manifest 安裝；圖片不會以 HTML 代替。正式 CSS 圖片路徑適用 GitHub Pages 子路徑。
- CI 與 Pages 在測試前安裝 Chromium，執行格式及實際合成比較。

沒有剩餘發布阻擋。主代理另外完成 24 檔／297 項測試與兩種視口的真實離線驗收；實體手機及真人盲測的限制仍保留。
