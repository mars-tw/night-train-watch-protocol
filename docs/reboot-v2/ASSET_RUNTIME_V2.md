# v2 美術 Runtime 與後處理紀錄

版本：2026-10-02

## 實際交付

本次收到並驗證 12 張生成圖片：臥室、防禦物資、工坊情報、溫室、廚房儲藏各 1 張、A-07 透明圖集 1 張、五個威脅家族圖集，以及 1 張 50 格設備狀態圖集。來源工具記為 `OpenAI built-in image generation tool`；工具沒有提供可驗證的模型 identifier，因此 metadata 保持 `null`，不推測模型名稱。提示詞與生成批次由主製作紀錄彙整，本檔不重造未取得的 prompt。

原始圖片完整保存在 `public/assets/art/v2/source/`。Runtime 版本位於：

- `public/assets/art/v2/carriages/{sleep,defense,workshop,greenhouse,kitchen}.png`
- `public/assets/art/v2/characters/a07/atlas.png`
- `public/assets/art/v2/threats/{knocker,clinger,vine,echo,crowd}/atlas.png`
- `public/assets/art/v2/equipment/atlas.png`
- `public/assets/art/v2/pipeline-report.json`
- `public/assets/art/v2/v2-art-pipeline.blend`

五張房間圖皆由實際來源中心裁切、nearest sampling 到 720×1280，再做每色頻道 5-bit posterize。沒有把臥室床鋪複製到其他車廂。防禦車廂只有窄凳，工坊是工作桌與收音機，溫室是雙植床與循環箱，廚房是爐具與儲藏。

## Blender pipeline

實際執行程式為 Blender 5.2.0 LTS：

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --python tools\process-v2-art.py -- `
  --output-dir public\assets\art\v2 `
  --sleep <sleep.png> --defense <defense.png> --workshop <workshop.png> `
  --greenhouse <greenhouse.png> --kitchen <kitchen.png> --atlas <a07-atlas.png>
```

執行前已用 Blender background mode 查到：`bpy.app.version_string=5.2.0 LTS`、render engine `BLENDER_EEVEE`、PNG image settings 可用、color look enum 為 `None`。Pipeline 載入實際圖像 datablock、寫出處理圖、把資產路徑／色票／來源工具／幀數存入 `.blend` scene properties，沒有開啟可見 UI，也沒有修改 Blender MCP 設定。

第一次圖集驗證得到 bottom-up occupancy `[6,6,8,8,8,8,8]`。這是 `bpy` pixel buffer 原點在左下造成的列序，不是缺幀；修正成 Canvas top-down 後實測為 `[8,8,8,8,8,6,6]`，共 52 格。若未來來源不符合這個占用表，腳本會直接失敗，不倒播、複製或補空格。

圖集清除了 62 個符合明確紅／黃 spill 色鍵的 alpha 像素。Runtime PNG 四角透明，最後兩列最右兩格透明。所有 52 格均有實際 opaque bounds；詳細 cell bounds、opaque pixel 數、主色與 64px 檢查在 `pipeline-report.json`。

五個威脅家族均實測為 4×5、20 個 occupied cell；Runtime 依 6 幀接近、8 幀動作、6 幀解除播放，切換 contact stage 時重新計時，不用整張 body 縮放或長距離位移冒充姿勢。反制成功若同一 service call 已切到下一波或移除 `activeContact`，renderer 保留已繪 contact 的物件 reference；只有該 reference 確實寫入 `resolvedBy` 才播放 1 秒 resolve clip，未解除、換頁或新 run 不會誤播。這層只讀狀態，不回寫傷害、資源或 domain event。設備 atlas 實測為 10×5、50 格；配對順序依生成批次為燈／窗框／暖氣／電池／收音機、濾芯／醫療／扣具／工具箱／水培、番茄／香草／隔離／電池陣／樣本室、床邊暖機／除冰／循環／嫁接／濾塔、封存／種籃／蕨類／電路／茶杯。

Alpha 邊緣清理實測移除像素：A-07 62、敲窗者 13、攀附者 20、霧藤 95、回聲乘客 64、群影 13、設備 45。威脅與設備使用「只清除接觸透明邊界的極端紅／黃／藍／綠 spill」規則，避免刪除醫療紅十字、發光果實、藍色衣物或設備狀態燈。每張 source/runtime 的 SHA-256 都寫入報告，測試會重新雜湊核對。

## Runtime 分層

`src/game/scene-manifest.ts` 是 v2 場景正本：

- 五張 720×1280 背景。
- 每廂 3 個熱區，共 15 個；臥室床頭錨點依實際成圖調到約 `(60%, 38%)`。
- 五廂各 4 個可組合視覺狀態，共 20 個映射。
- 八個 `run.voyage.facilities` 改裝使用 50 格 atlas 中對應的真設備狀態、固定錨點與 fallback 幾何；不是只顯示數字。
- Profile 選中的八種外觀只在新局由已擁有的 `selectedCosmeticId` 寫成 `cosmetic:<rewardId>` run flag，再由 renderer 投影到場景；中途更改 Profile 不會改動目前旅程。A-07 便條、老許通聯卡、柔光燈罩、備援電表、菜牌、工具套、五廂章及封存日誌封面各自使用設備 atlas 的合適底件，再加紙卡、刻度、織套、圖章或封面細節；只改畫面，不改生存數值。
- A-07 實際圖集為 8×7、52 幀；逐列目視後的真實 clip 是 `sleep／turn／listen／startle／sit／drink／settle`，幀數 `8/8/8/8/8/6/6`。沒有不存在的 cold、wake 或 write 動作，也不沿用企劃初稿的 `8/10/6/6/8/4/10`。

A-07 只在臥室主床繪製。穩定狀態循環 sleep；冷或高噪音使用 turn；夜間 warning 使用 listen；attack、breach 或本夜 wakeups 增量使用 startle；aftermath／ending／dawn 使用 sit。Prep 會倒序讀取本日已提交 ledger：最近成功 comfort 選 settle，最近成功 hot meal 選 drink。一次性動作播放完停在真實結尾，不因每次 render 重播。`survivor-lost` 固定 sleep 第 0 幀，不再呼吸；低速模式仍逐幀播放，`reducedMotion` 顯示各 clip 指定的關鍵姿勢。

Renderer 不再把 `threat-fog-vine-gpt-v1.png` 等整幅故事插圖蓋在新背景上。舊檔名僅保留成 migration/provenance reference，不載入 `ART_SOURCES`。T002／T003／T004／T005／T006 使用五個新 20 幀 atlas；T008 共用群影家族的遮擋／揭示姿勢。T009 繼續使用霜層，T013 使用孢子層，綠潮管路與既有 DOM 謎題保留。

主選單現在也使用 v2 臥室底圖並播放 A-07 的預設 sleep 真幀；A-07 仍只會出現在臥室。結果頁沿用同一臥室空間，正常 ending 坐起，乘客死亡則凍結安靜幀。

## 全域色彩閾值

`pipeline-report.json` 以實際像素抽樣檢查兩件事。原始後處理的暖色比例為 0.8596，超出企劃門檻；之後只對鐵門、窗框、冰箱、循環設備及低亮非發光陰影套 feathered 區域遮罩，沒有對整張圖套藍色濾鏡。最終五廂暖色比例依序為 **0.6563／0.6933／0.6949／0.6508／0.6976**，平均 **0.6786**，全部落在 0.60–0.70。指定 v2 palette 的平均覆蓋率為 **0.9060**，高於 0.45 閾值。暖色比例與 palette coverage 兩項全域色彩門檻均通過；燈芯、木桌、食物、毛毯與床鋪暖色仍保留。

## 尚未有對應生成資產的範圍

本批已有五個威脅家族的 20 幀透明 atlas 與 50 格設備狀態 atlas。尚未提供的是每個威脅的逐幀命中事件標記與獨立 window mask，因此 runtime 的傷害仍只由既有權威 contact state 決定，不能由動畫自行扣血。T009／T013 是環境威脅，不以人形 atlas 取代霜與孢子證據層。

`pipeline-report.json` 的 64px pass 是色彩與明暗可分辨性機器檢查，不等於真人辨識測試。角色外觀、熱區位置和設備組合仍需以 360×640、390×844、430×932 實際畫面覆核。

本輪已用 Playwright 在 390×844 實際查看主選單 A-07 睡姿、臥室睡姿、四個無人物車廂與敲窗者 contact；人物／威脅都來自不同 atlas cell，瀏覽器 console 為 0 error。五張威脅 source contact sheet 也逐張目視，均可看到接近、伸手／接觸及退去方向的多種姿勢。其他視口與五家族完整時間序列仍由最終 QA 批次補錄，不以單張截圖取代動畫驗收。
