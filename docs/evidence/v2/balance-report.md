# Reboot v2 balance simulation

- 模式：full
- 實際模擬：270 局
- 勝率：77.78%
- 停滯：0 局

這是固定策略對目前 runtime 的量測，不把企劃示意值、測試 fixture 或補資源當作自然七夜證據。

## 主要發現

- Forced main 停滯共 0 局；其中 R01 Day 6 EV048 缺證據停滯 0 局。
- R02 有 30/90 局車體失守；策略會先用 counterReadiness 判斷 roof-release／emergency-boost，再於兩者都不可用時承傷。
- R03 有 90/90 局完成；污染循環在 FILTER 缺電時可用全排放或手動排放繼續。
- 作物參數實差：萵苣 1 夜／2 食、番茄 3 夜／4 食、香草 2 夜／1 食並減壓；報告另列每 AP、水與持槽效率及實際收成日。
- D1 的 runtime 實差為窗側傷害 -3、維修 +4；與 M009 同時生效時完整維修由 14 提升為 21。

## 分組結果

| 路線／策略 | 勝率 | 勝利 | 車體失守 | 乘客失守 | 停滯 |
| --- | ---: | ---: | ---: | ---: | ---: |
| R01/safe | 100% | 30 | 0 | 0 | 0 |
| R01/production | 100% | 30 | 0 | 0 | 0 |
| R01/exploration | 0% | 0 | 30 | 0 | 0 |
| R02/safe | 100% | 30 | 0 | 0 | 0 |
| R02/production | 100% | 30 | 0 | 0 | 0 |
| R02/exploration | 0% | 0 | 30 | 0 | 0 |
| R03/safe | 100% | 30 | 0 | 0 | 0 |
| R03/production | 100% | 30 | 0 | 0 | 0 |
| R03/exploration | 100% | 30 | 0 | 0 | 0 |

完整每日分布、典型取捨與重現 seed 見 `balance-report.json`。
