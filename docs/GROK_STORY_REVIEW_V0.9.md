# Grok v0.9 故事紅隊審查

- 審查日期：2026-07-25
- 審查對象：`spec/spec-design-story-expansion-v0-9.md`
- 模型：grok-4.5
模式：單回合、純文字輸出、停用 web search、subagents 與 memory

## 驗證狀態

執行前以 `grok models` 驗證 CLI，結果為 `You are logged in with grok.com.`。審查命令採用：

```text
grok.exe -p <prompt-with-spec> --output-format plain --max-turns 1 --disable-web-search --no-subagents --no-memory --verbatim
```

本文件不包含登入帳號、OAuth URL、授權碼、API key 或其他敏感憑證。

## 結論

**有條件可施工。**

Typed StoryState、Day 4 永久車廂轉換、Day 7 狀態機與事件資料表已足以讓工程開工；但必須先封閉真實路線資料取得、終局操作映射及 Day 7 時間預算三個 P0，否則玩家可能在不了解原因的情況下被鎖死結局。

## P0 findings

| ID | Finding | 玩家可見問題 | 已合併修正 |
|---|---|---|---|
| GR-P0-01 | GO 沒有明確 `trueRouteData` 取得路徑 | 資源不足而被迫 GO 後，幾乎被鎖死 `arrival` 與 `reroute` | GO 隔離逆向定位、DETOUR 路線抽樣、STOP 名冊比對各固定兩次；三支線都能取得資料 |
| GR-P0-02 | Day 7 原預算 90 + 240 + 60 秒 | 終局單夜接近整局目標時間，手機玩家會覺得拖長 | 改為 45 + 120 + 45 秒，硬上限 210 秒 |
| GR-P0-03 | EV050–EV052 與 `FinalDecision` 沒有單義映射 | 同一組選擇可能產生不同結局，或工程無法決定何時解析 | 只有 EV051 提供 `open`、`seal`、`reroute`、`terminate` 四選一並呼叫 EndingService |
| GR-P0-04 | 文件混用四結局與五個 EndingId | UI、QA 與測試數量會不一致 | 統一為四種正式結局加一種 `arrival-unverified` 保底失敗 |

## P1 findings

| ID | Finding | 已合併或排程修正 |
|---|---|---|
| GR-P1-01 | Day 1 省電會使 EV043 與 A-07 弧線消失 | 改為 `signalSampleQuality=partial`；EV043 在 Day 3 固定出現 |
| GR-P1-02 | E4、I2、EV047 與覆寫成本有多個真相來源 | E4 明確要求、讀完第七條自動解鎖 I2、覆寫信任只扣 3 一次 |
| GR-P1-03 | T006「反應時間 -20%」不可測 | 改為 8 秒判斷窗與 0.5 秒線索延遲；無作物時保留 35% 電表提示 |
| GR-P1-04 | 作物對 Day 7 存活影響沒有公式 | 新增 `finaleHealthBuffer = min(4, usableCropCount * 2)` 與 HUD |
| GR-P1-05 | T005 第一次錯誤即扣血缺乏公平線索 | 第一次錯誤只顯示色、形、節拍條；第二次才健康 -2 |
| GR-P1-06 | A-07 交還控制權缺少數值門檻 | 信任 ≥60 同意；40–59 且有作者證據可說服；其餘拒絕 |

## Required automated acceptance

1. Given Day 1 選省電，When 進 Day 3，Then EV043 仍觸發且樣本品質為 partial。
2. Given DETOUR 或 STOP 資源不足，When 開啟 EV044，Then GO 可選、其他選項 disabled 並列缺少資源。
3. Given 三個分支固定 seed，When 進 Day 7 第三波，Then 威脅依序為 GO=T006、DETOUR=T004、STOP=T005。
4. Given 任一分支完成兩次指定資料操作，When 結算，Then `trueRouteData=true`。
5. Given T004 鎖定種植槽，When 未拖入割具，Then 澆水與收成被拒；拖入後同夜恢復。
6. Given T005 第一次選錯，When 結算，Then 健康不下降；第二次才健康 -2。
7. Given Day 7 中途存檔，When 重載，Then 從同一 `finaleStage` 恢復且不重複扣成本。
8. Given EV051 任一選項，When 確認，Then 只寫入一個對應 `FinalDecision`。
9. Given 同時符合多個結局，When EndingService 解析，Then 只回傳優先序最高的 `endingId` 並保留全部 reasons。
10. Given Day 7 完成三階段，When 計算實際時間，Then 不超過 210 秒。

## Deferred, not blocking implementation start

- 黎明紀錄全文與文案潤飾。
- 額外 seed 的敘事變體。
- A-07 更多個性動畫。
- 結果畫面高階美術。
- 公開證據頁與影片製作；仍是正式發布前的必要 gate。

## Controller disposition

Codex 已將 GR-P0-01 至 GR-P0-04 及 GR-P1-01 至 GR-P1-06 合併至故事規格。Grok 只提供獨立 findings，不直接修改原始碼、規格、Git 分支或發布狀態。
