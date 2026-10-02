# 宣傳影片公開檔案

播放頁與 README 已先接好固定路徑；影片素材完成後放入下列位置：

- `public/assets/video/night-train-promo-v211.mp4`：主要橫式宣傳片，1280 × 720，H.264 MP4。
- `public/assets/video/night-train-promo-v211-cover.jpg`：README 與播放器共用封面。
- `public/assets/video/night-train-promo-v211.zh-Hant.vtt`：繁體中文字幕。
- `public/assets/video/night-train-promo-v211-portrait.mp4`：手機分享用直式版本，720 × 1280；主播放器仍使用橫式版本。

素材包含 77.68 秒的正常遊玩實錄，以及另行錄製的 8.011 秒乾淨 hero 畫面，最後精剪為 55.1 秒宣傳片。錄製過程沒有注入存檔、資源或 phase。音訊是 `edit-promo-v211.py` 製作的原創宣傳配樂，不是遊戲內音訊。

`public/trailer.html` 使用瀏覽器原生 controls，不自動播放音訊。所有站內網址皆採相對路徑，部署於 GitHub Pages 專案子路徑時仍可使用。

成品加入後，仍須在實際 Pages 網址確認影片可播放、封面與字幕可載入、下載連結可用，並檢查 390 × 844 與 1366 × 600 兩個視口的播放器 controls 和主要連結。

宣傳影片不列入 PWA precache，避免首次載入遊戲時下載大型媒體檔。

## 製作與來源

`tools/record-promo-v211.mjs` 錄製一般UI操作；`tools/edit-promo-v211.py` 依實際錄影時間線剪輯、加入字幕及原創配樂。程式與文件沿用AGPL-3.0-or-later；影片及封面沿用美術的CC BY4.0，署名「夜行列車：守夜協定 contributors」。原創宣傳配樂可依CC0-1.0使用。

原始兩段錄影的SHA及剪輯起訖見`docs/evidence/promo-v211/edit-report.json`。原始錄影在本機ignored的output資料夾保留，發行時另提供Release附件，沒有把測試checkpoint畫面或生成影片混入實錄。

## 驗收

橫式1280×720、直式720×1280，均為H.264／AAC／30fps，封裝長度55.133秒。兩檔全段decode成功，無blackdetect或freezedetect警告；音訊mean −22.2dBFS、peak −11.7dBFS。中文字幕11段，瀏覽器已實際播放及seek至35秒；頁面檢查見`docs/evidence/promo-v211/page-qa.json`。

影片內容終審由本機`qwen3.8-27b`完成，兩份時序抽幀皆PASS；不聲稱模型聽過音訊或看完連續影片。早先dispatcher錯誤委派額外圖片／文字工作，該結果未用作成品或驗收，改以同一本機模型、沒有工具委派的嚴格JSON判斷完成。完整紀錄保留在evidence。

內建協作代理的獨立上下文另外做唯讀技術覆核，確認README／Pages子路徑、影片與來源hash、授權、PWA首次快取及獨立影片頁導覽正確。該覆核不取代地端內容裁決，沒有剩餘發布阻礙。
