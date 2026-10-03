# v2.3.0 手機與細緻像素風驗收

本輪修正使用者實際指出的三個問題：手機跑版、啟動首頁人物亂動，以及畫面偏平滑插畫。四張參考只作本機風格對照，廣告介面與原照片不進遊戲。

## 修正內容

- 首頁使用一張包含人物、枕頭與毛毯的完整像素場景。Renderer 不再在主選單播放角色、列車搖晃、窗景或舊旅程狀態；標題與按鈕也不滑入。
- 移除 640px 最小高度，以可視 viewport 更新高度並處理旋轉。主畫布保持 9:16，互動熱區共用同一場景矩形；pinch zoom 保留 layout viewport，不反向縮窄內容。
- 新圖片重製首頁、五車廂、52 格 A-07 及 12 張作物階段，保留暖燈、織物、木作、瓶罐與冷窗的像素層次。細節來自新圖，不把模糊插畫換個 CSS 就稱為像素重製。
- 睡眠圖格以實際膚色區域量測並對齊，保持正方形比例，安放在新床位。對位後 X／Y variance 為 0.047788／0.06141 像素平方；原始圖及位移紀錄保留。
- 首夜提示避開整個頭部，播種提示移到左右控制之間。作物使用白色淺槽，移除疊出的舊式預設植槽；成熟植物由實際生長狀態顯示。
- 存檔與離線資訊在固定底列，下載失敗另預留 48px 重試空間，保留上一版快取與存檔。不支援或拒絕 Web Audio 時，仍可正常操作遊戲。

## 驗證

| 驗收 | 實際結果 |
| --- | --- |
| TypeScript、Vitest、正式 build | `npm run check`：40 個測試檔、341 項測試通過 |
| 手機選單 | [Chromium](evidence/v23/after-mobile-layout.json)、[WebKit](evidence/v23/after-webkit-layout.json)各 24 組尺寸／真實 100／120／140% 設定；有存檔、同頁旋轉及高度變化通過，沒有 AudioContext 模擬 |
| 遊戲控制 | [15 組矩陣與真實兩夜流程](evidence/v23/ui-qa.json)通過，含成本取消、保存、跨局配置 |
| 首頁與人物 | [25 項 Canvas／圖片驗證](evidence/v23/pixel-qa.json)通過：首頁等待前後 pixel hash 相同、帶有實際存檔也固定、八格真睡眠來源、完整頭部不被提示遮住、場景比例及新作物來源正確 |
| 圖片與動畫 | [四視口、38 項檢查](evidence/v23/raster-qa.json)通過，五廂、四個火焰來源畫格、零 SVG 元素／請求 |
| 離線更新 | production browser 測試涵蓋首次快取、下載失敗、舊版離線重載及修復更新；15 組 ready／控制與五視口 retry 檢查通過 |
| 正式版 | [恢復同一 run、完整圖片與零錯誤](evidence/v23/release-qa.json)，三跑中位 p95：1366×600 與 390×844 均 16.7ms |
| 網路重量 | [首頁只請求一張 1,282,512-byte 主圖](evidence/v23/loading-qa.json)；完整離線 45 檔，約 20.39 MiB，包括七段角色及 12 張作物 |

效能是 Windows 桌面 Chromium 的手機尺寸視口，沒有實體 iOS／Android 效能證據。桌面第三次 p95 為 33.3ms，其餘桌面兩次 16.7ms；以原定三跑中位門檻判定通過，原始數據沒有刪除。WebKit 是 Playwright Windows runtime 26.5，沒有把它當成實體 Safari。

## 來源與品質

圖像使用內建 `image_gen`，沒有切換到 CLI／API。工具未提供模型 slug，紀錄維持 null。原始 PNG、processed PNG、三份實際 Blender 5.2 `.blend`、lossless WebP 與 hash 保留在 `public/assets/art/v23/`。[素材與處理](reboot-v23/ASSET_PIPELINE.md)、[提示詞](reboot-v23/IMAGEGEN_PROMPTS.json)、[作物／空植槽提示詞](reboot-v23/IMAGEGEN_ADDITIONAL_PROMPTS.json)、[對位](reboot-v23/A07_ALIGNMENT_REPORT.json)可追溯。

生成角色邊緣仍有紅黃 spill，兩次生成清理沒有成功除淨；最終由 Blender 材質管線清除 34,990 個指定 spill 像素，未宣稱工具已自行清乾淨。作物沒有套用該遮罩，避免刪掉合法紅番茄與黃綠葉片。編碼無損驗證比較 processed PNG 與 runtime WebP，不把重畫、對位或清理誤稱為原始圖完全無損。

故事、56 項任務、權威資源結算與 schema 6 沿用；舊版素材、存檔 key 與備份保留。宣傳頁仍明示為 v2.1 實錄，沒有冒稱舊片呈現新版畫風。獨立上下文覆核與公開版本驗證另保存紀錄，GitHub CI／Pages 完成後確認實際公開網址。
