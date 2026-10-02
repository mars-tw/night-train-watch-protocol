# 開源首頁宣傳影片更新

日期：2026-10-03，版本2.1.1。使用者確認工作是更新開源首頁與錄製宣傳影片，不是商店上架。

README標題下方加入可點擊封面與播放入口，連到GitHub Pages的`trailer.html`。播放頁提供原生控制、中文字幕、直接遊玩、GitHub及MP4下載。GitHub README不依賴不受支援的video／iframe嵌入。

另外修正service worker把所有navigation當成遊戲shell的問題。只有遊戲根目錄與index.html使用離線shell，trailer.html會讀取真正的獨立文件；已安裝PWA的瀏覽器實測影片能播，返回遊戲仍可離線。

錄影來自fresh隔離瀏覽器的正常UI操作：主床、五廂巡覽、播種、熱食確認、TUT-03真領獎、紙本路線、T002真反制及Day2三節點探索。沒有注入存檔、資源、phase、checkpoint或改變遊戲速度。77.68秒原始實錄另加8.011秒乾淨主床動畫素材，精剪成55.133秒成品。音訊為原創宣傳配樂，不冒稱遊戲錄音。

| 驗證 | 結果 |
| --- | --- |
| 主片 | H.264／AAC、1280×720、30fps、5,831,490 bytes |
| 直式 | H.264／AAC、720×1280、30fps、7,398,515 bytes |
| 完整decode | 兩檔成功，無黑屏或freeze警告 |
| 音訊 | mean −22.2dBFS、peak −11.7dBFS，無削波 |
| 字幕 | 繁體中文11段，實際瀏覽器載入 |
| 頁面 | 390×844／1366×600控制可達；實際播放與seek35秒成功 |
| 內容終審 | 本機qwen3.8-27b兩份時序抽幀判斷PASS，無工具委派 |
| 回歸 | TypeScript、27檔／305項、build通過；影片不進38檔遊戲precache |

終審範圍如實標示為視覺抽幀；連續檔案及音訊另外做確定性檢查，不冒稱模型看完連續動態或聽過配樂。早先dispatcher錯誤委派的結果沒有用於成品或驗收，原始失敗／異常記錄留在ignored本機audit目錄。

素材時間線與hash見[evidence](evidence/promo-v211/edit-report.json)，播放與seek見[page-qa.json](evidence/promo-v211/page-qa.json)，本機判斷見[橫式](evidence/promo-v211/local-landscape-verdict.json)、[直式](evidence/promo-v211/local-portrait-verdict.json)。原始錄影與成品另提供Release附件，授權見[影片授權](../public/assets/video/night-train-promo-v211.LICENSE.txt)。

影片與封面採CC BY4.0，原創配樂採CC0-1.0；程式與文件沿用AGPL-3.0-or-later。
