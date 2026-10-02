# 現況盤點與企劃邊界

日期：2026-10-02。由獨立內建協作代理唯讀盤點，主代理讀回結果；不是跨模型或外部ChatGPT驗證。

## 版本

origin為`https://github.com/mars-tw/night-train-watch-protocol.git`。本機`codex/story-expansion-v110`的HEAD為`231b122`，package 1.1.0；遠端故事分支相同。實際fetch讀取main為`85f31ff`、package 0.8.0。v1.1比main多9個提交、109檔，三條故事線尚未整合到main。公開部署版本本次未查核，不能等同任一分支。

## 已實作與缺口

| 專案 | 來源位置（盤點commit） | 判讀 |
| --- | --- | --- |
| 三線七夜與永久分支 | model.ts:49；story.ts:277/319/517 | 可以保留，任務適配既有故事 |
| 五廂、作物、裝飾 | content.ts:156/164/182/189 | 兩槽、三作物、四小物、15相容槽 |
| AP與整備 | services.ts:2183/2395/3394/3442 | 已有成本及資源合法性，繼續作權威 |
| 操作式威脅 | services.ts:1056/1089/1891/2424 | 不是隻有一鍵攻擊，應保留契約 |
| 任務引擎 | types.ts:491；story.ts:370/390/406 | 沒有Quest/Mission資料，story.queue只有事件排程 |
| 跨局儲存 | view.ts:694；app.ts:79；model.ts:77；services.ts:2398 | 頁面讀當局data/techOwned，新局清空；「下一局快照」尚無Profile落點 |
| 路線 | content.ts:219 | RN01–03每日重用，尚無停站探索撤回流程 |
| 模組／科技實效 | content.ts的模組/科技定義；services.ts:3395；view.ts:1622 | E1/I1有落點；E2/E3/D1及M007/M010/M011/M012未見相應完整效果，須逐項驗證 |
| 機能建造空間 | services.ts:2141 | buildModule產生虛擬slotId，沒有廂別/容量限制；外觀槽系統較完整 |
| 場景 | renderer.ts:8/34/67/424/484 | 已有實際圖片載入及動態；新改造需要更細狀態圖層 |
| 存檔 | save.ts:28/306/389；types.ts:492 | schema1–5、localStorage優先/IndexedDB備援；與README所述優先序不同，以source為準 |
| PWA | public/sw.js:16 | cache-first，更新需防止舊程式和新資產混用 |

## 已執行驗證

內建協作代理在本次實際執行Vitest：12個測試檔、189項測試全部通過。這是v1.1基準的回歸證據，未重跑手機瀏覽器、公開部署或自然七夜真人流程，不能當作v2任務／新美術通過。

本次規劃新增檔案與任務目錄，沒有更動src/public/package、沒有生成遊戲美術、沒有釋出。檔案行號只用於這個來源commit，後續重構應依函式名稱定位。

## 優先順序

1. 先鎖定v1.1來源，建立任務／Profile／存檔交易。
2. 用R01前兩夜驗證新畫風與物件操作。
3. 修齊模組實效與機能槽、加入可撤回探索。
4. 接完整三線七夜與關係任務，再做平衡和美術量產。
5. 自然遊玩、手機操作、效能、遷移與PWA更新各有證據後，才處理main整合與發布。
