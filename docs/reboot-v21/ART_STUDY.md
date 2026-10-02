# v2.1 圖片動畫美術技法

日期：2026-10-02。

本輪延續 `reboot-v2/ART_STUDY.md` 的材質、剪影、局部光源與姿勢幀原則，並針對遊戲內小尺寸圖示、環境循環與紙本地圖補上實作限制。

## 圖示與道具

- 以單一清楚剪影及一個主要材質面表意，避免把細小線稿當成 64px 圖示的主要辨識依據。
- 圖集每格固定 crop、固定 pivot、固定留白；runtime 不以 CSS 或 Canvas 重畫幾何補足圖像。
- 透明邊緣保留原始 alpha。Pipeline 不做黑底、白底或色鍵去背，避免誤刪木材、鐵件及陰影。

## 環境動畫

- 雨、霜、霧、孢子是四個單格狀態；蒸氣、火焰、葉片各四格，按 row-major 順序播放。
- 四格循環靠形狀、密度與局部明暗的實際變化形成動作，不用整張圖平移或縮放冒充動畫。
- 每格保持相同作用區域與視覺重心，讓 renderer 切格時不出現跳位。

## 車廂與地圖

- 五張車廂沿用既有生成來源的暖木、鐵件與局部燈光質感，重新由 Blender image plane、emission material、orthographic camera 輸出。
- 取樣改為 Linear，Standard view transform，移除 v2 的 nearest、5-bit quantization 與額外冷色平衡，避免暗部顆粒與整體變黑。
- 地圖的兩個 panel 以固定 2×1 crop 保存紙張紋理與既有繪製內容；runtime 只讀圖片，不重畫 SVG 路線。

## 套用到產線

`tools/process-v21-art.py` 為每格建立獨立 UV crop image plane，以同一張來源圖的 emission material 投影，透過正交相機輸出 processed PNG 與 runtime WebP。這保留來源圖像質感，同時讓尺寸、格數、幀順序、alpha 與 runtime byte budget 可以用機器報告查核。
