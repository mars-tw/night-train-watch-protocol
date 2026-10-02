# 重製美術研究與實際應用

日期：2026-10-02。新資產不沿用廣告圖中的人物、商標、文字或家具排序。

參考開源列車遊戲 [OpenTTD 的色盤原始碼](https://github.com/OpenTTD/OpenTTD/blob/master/src/table/palettes.h)：原始碼列出透明色、灰階與一般色的固定色盤。由此採用固定色票与分階明度維持本遊戲素材一致；此處只研究方法，不複製遊戲資產。v2用暖木作、霧綠鐵件、奶油毛毯與少量冷窗色，金屬與木作各有至少三階明度。

参考 [LibreSprite](https://github.com/LibreSprite/LibreSprite) 的圖集與逐幀工作流程：每個cell有固定畫布、pivot與順序；人物／敵人必須改變肩、手、頭或肢體姿勢，不能以單圖平移當动画。背景另存，角色與狀態獨立載入。

像素簇、陰影與動畫節奏研究參考 [Miniboss 教學](https://studiominiboss.itch.io/pixel-art-tutorials)。實際應用：低解析可讀的群塊、陰影偏冷而亮部偏暖、臉與工具不用密集dither，只有霧與玻璃採少量顆粒。整體維持大毛毯折面和單點透視，降低舊版滿畫面的寫實材質噪點。

本輪生產順序：五廂背景→A-07身份與姿勢圖集→五威脅家族→設備與改造圖層→runtime與熱區對照。來源、實際生成方式與後處理寫入ASSET_MANIFEST；產物在工具輸出前不標完成。
