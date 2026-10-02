# 夜行列車 v2.0.1 更新驗收

日期：2026-10-02。使用者要求依新企劃製作並更新開源遊戲，本輪從`231b122`故事分支完成實作；原公開main為v0.8。發布結果於下方追加，不把本機建置當成線上部署。

## 已實作

- 三條完整七夜、56任務、期限／前情／分支／釘選／領獎去重。
- 五車廂新底圖、52格A-07、五家族100威脅格、50設備格；20場景狀態、8設施與8外觀有實際投影。真實解決接觸後播放退去姿勢，不以整圖縮放模擬肢體。
- 每日一次、固定seed的三節點探索；撤回保留已取得物資，不能刷新站點。
- 9種有代價的起始選配、8種純外觀；Profile保存成功才採納，新局只套一次，不累加上局資源。
- 機能槽、模組／科技效果、補電／濾水／配給、醫療、1／3／2夜作物成熟。
- 成本確認與取消、免費檢視、字級與拖曳替代、背景暫停。
- schema1–5匯入6、舊key與備份保留、run/Profile/receipts完整envelope；PWA build manifest及跨`Vary: Origin`的靜態快取命中。

## 驗證

| 項目 | 實際結果 | 證據 |
| --- | --- | --- |
| TypeScript／單元與整合 | 24檔、296項通過 | `npm run check` |
| 手機版面 | 5視口×3字級，179斷言通過；場景最低60.6%，新熱區最低60×48 | [ui-qa.json](evidence/v2/ui-qa.json) |
| 三線自然七夜 | 559次實際按鍵，三線從fresh context到合法勝利；不注入資源、phase或checkpoint | [journey-qa.json](evidence/v2/journey-qa.json) |
| 領獎與選配 | 自然claim→reload→選配→新局→標準還原；無重複發獎或數值累積 | UI／Profile測試及截图 |
| 正式版與離線 | 33項precache無缺件，斷網reload後回復同run與720 Canvas；11斷言通過 | [release-qa.json](evidence/v2/release-qa.json) |
| 效能 | Windows Chromium三跑中位p95：1366視口16.8ms、390視口16.7ms | release-qa.json；非實體手機 |
| 載入優化 | 12張無損WebP較PNG減少35.52%；首選單必要美術1.827MiB；完整快取14,520,667 bytes／13.848MiB，較v2.0.0減少74.65% | [compression-report.json](../public/assets/art/v2/compression-report.json)、runtime-loading-v2測試 |
| 平衡 | 30seed×3線×3策略=270局，210勝／60失守／0主線停滯 | [balance-report.md](evidence/v2/balance-report.md) |
| 美術 | Blender5.2實跑12來源，source/runtime SHA、52/100/50格、alpha邊緣與色盤檢查通過；暖色平均0.6786 | [pipeline-report.json](../public/assets/art/v2/pipeline-report.json) |
| 套件 | 升級Vitest4.1.11與修正間接依賴，npm audit 0漏洞 | [dependency-audit.json](evidence/v2/dependency-audit.json) |
| 秘密與版本 | 新檔與runtime秘密字串掃描0命中，package／lock版本2.0.1，diff check通過 | 本輪命令讀回 |

## 由完整流程找到並修正

1. prep水循環曾誤算夜間反制；現在只有真接觸完成才送counter事件。
2. Profile結局原本未由app寫入；現在由persist建立draft，保存成功才採納。
3. claim與pagehide曾可能以舊Profile覆寫新收據；actionInFlight期間不另送舊快照。
4. EV048無證據時曾擋住所有選項；可保留疑問並承受信任代價，不能憑空核實作者。
5. R02原攀附反制燃料需求不可持续；新增有限零件切離扣具，付出噪音與壓力代價。
6. 靜態資產`Vary: Origin`與crossorigin請求不一致造成離線空頁；僅對同scope不可變公開資產忽略Vary，實際重載已驗證。
7. 圖集動作名稱與列序原不一致；依真姿勢改名並由run／ledger選擇，死亡不播呼吸，退去幀有生命週期。

## 範圍與實證限制

實體iOS／Android效能、5位真人盲測尚未執行；手機尺寸測試使用桌機Chromium，背景暫停使用visibilitychange事件模擬。平衡報告是固定策略量測，貪深入策略在灰霧／白霜仍可能失守，不是所有策略都保證勝利。

生成工具沒有揭露可驗證的模型identifier，metadata保持null，未冒稱已確認gpt-image-2。349 cells／83檔是企劃製作上限，不寫成已交付數；本版使用实际12來源的5底圖＋202姿勢／設備格。未完成P2擴充、真人研究與整體服務大規模模組拆分，保留在設計路線圖，不影響本次完整七夜更新。

程式／文件沿用AGPL-3.0-or-later，美術沿用CC BY4.0。廣告照片、私人GDD與憑證未加入公開儲存庫。

## 發布記錄

v2.0.0 已於 2026-10-02 由 [PR #8](https://github.com/mars-tw/night-train-watch-protocol/pull/8) 合併；main commit 為 `f9a679bd090974e83d12f8c157d2a61298f12fe7`。[CI](https://github.com/mars-tw/night-train-watch-protocol/actions/runs/36999788399) 與 [Pages 部署](https://github.com/mars-tw/night-train-watch-protocol/actions/runs/36999788380) 均成功，[v2.0.0 release](https://github.com/mars-tw/night-train-watch-protocol/releases/tag/v2.0.0) 已公開。

公開驗收發現首次快取仍包含舊版素材，因而追加 v2.0.1：只快取目前 runtime，改用 lossless WebP，限制圖片載入併發為 2，並修正快速切廂取消佇列後無法重新排入的問題。Linux CI 會安裝 Chromium，執行真實 PNG／WebP 合成比較；半透明像素顯示差異最多 1／255，未宣稱其 Canvas unpremultiply 數值完全相等。v2.0.1 的發布與部署狀態以 [release](https://github.com/mars-tw/night-train-watch-protocol/releases/tag/v2.0.1) 及 [GitHub Actions](https://github.com/mars-tw/night-train-watch-protocol/actions) 記錄為準。
