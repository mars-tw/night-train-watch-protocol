import { THREATS } from "../game/content";
import { counterReadiness, getEffectiveCounterCosts } from "../game/services";
import type { AppState, ProfileState, RunState } from "../game/types";

export interface OnboardingCue {
  eyebrow: string;
  title: string;
  detail: string;
  action: string;
  value?: string;
  label: string;
  showMissions?: boolean;
}

const TUTORIAL_IDS = ["TUT-01", "TUT-02", "TUT-03", "TUT-04", "TUT-05"] as const;

const COUNTER_LABELS: Record<string, string> = {
  "close-shutter": "關閉百葉",
  "shock-window": "窗框電擊",
  "emergency-boost": "緊急加速",
  "roof-release": "切離攀附扣具",
  decoy: "誘餌廣播",
};

const RESOURCE_LABELS: Record<string, string> = {
  energy: "電量",
  fuel: "燃料",
  parts: "零件",
};

function profileCompleted(profile: ProfileState, missionId: string): boolean {
  return profile.milestones.includes(`mission:${missionId}:completed`);
}

function objectiveDone(run: RunState, missionId: string, index: number): boolean {
  return (run.quests.missions[missionId]?.progress[index]?.count ?? 0) > 0;
}

function completedRewardCue(run: RunState, profile: ProfileState): OnboardingCue | null {
  for (const missionId of TUTORIAL_IDS) {
    const mission = run.quests.missions[missionId];
    if (mission?.lifecycle !== "completed" || profileCompleted(profile, missionId)) continue;
    return {
      eyebrow: "下一步・保存成果",
      title: "這項教學已完成",
      detail: "把紀錄收進旅程檔案；領取仍由原本的保存流程確認。",
      action: "claim-quest-rewards",
      value: missionId,
      label: "領取紀錄",
    };
  }
  return null;
}

function firstLegalCounter(run: RunState): string | undefined {
  const threat = THREATS.find((item) => item.id === run.activeContact?.definitionId);
  return threat?.counterIds.find((counterId) => counterReadiness(run, counterId).available);
}

function counterCost(run: RunState, counterId: string): string {
  const costs = Object.entries(getEffectiveCounterCosts(run, counterId))
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] < 0)
    .map(([key, amount]) => `${RESOURCE_LABELS[key] ?? key} ${Math.abs(amount)}`);
  if (counterId === "roof-release") costs.push("噪音 +4", "壓力 +2");
  return costs.join("・") || "不扣物資";
}

export function deriveOnboardingCue(state: AppState): OnboardingCue | null {
  const run = state.run;
  if (!run || run.routeId !== "R01" || run.ended || run.day > 2) return null;
  if (run.quests.trackedMissionIds.length > 0) return null;

  if (run.phase === "night" && run.activeContact && !profileCompleted(state.profile, "TUT-05") && !objectiveDone(run, "TUT-05", 0)) {
    const counterId = firstLegalCounter(run);
    if (counterId) {
      const name = COUNTER_LABELS[counterId] ?? counterId;
      const cost = counterCost(run, counterId);
      return {
        eyebrow: "下一步・夜間反制",
        title: `${name}・${cost}`,
        detail: "這會立即執行並照標示扣除成本；你也可以改選下方其他反制。",
        action: "counter",
        value: counterId,
        label: `執行${name}`,
        showMissions: false,
      };
    }
  }
  if (run.phase === "night") return null;

  const reward = completedRewardCue(run, state.profile);
  if (reward) return { ...reward, showMissions: true };

  const tutorialFinished = TUTORIAL_IDS.every((id) => profileCompleted(state.profile, id));
  if (tutorialFinished) return null;

  if (!profileCompleted(state.profile, "TUT-01")) {
    if (!objectiveDone(run, "TUT-01", 0)) {
      if (state.activeCarriageId !== "sleep") {
        return {
          eyebrow: "下一步・免費檢查",
          title: "先去看看 A-07",
          detail: "切到臥室，查看呼吸與冷窗；兩次查看都不扣 AP。",
          action: "select-carriage",
          value: "sleep",
          label: "前往臥室",
          showMissions: true,
        };
      }
      return {
        eyebrow: "下一步・免費檢查",
        title: "確認她的呼吸",
        detail: "這次查看不扣 AP，也不會喚醒乘客。",
        action: "inspect-object",
        value: "passenger-breathing",
        label: "查看呼吸",
        showMissions: true,
      };
    }
    if (!objectiveDone(run, "TUT-01", 1)) {
      if (state.activeCarriageId !== "sleep") {
        return {
          eyebrow: "下一步・免費檢查",
          title: "回臥室看冷窗",
          detail: "窗外輪廓是第二個免費觀察點。",
          action: "select-carriage",
          value: "sleep",
          label: "前往臥室",
        };
      }
      return {
        eyebrow: "下一步・免費檢查",
        title: "再看一眼冷窗",
        detail: "辨識窗外輪廓；查看不扣 AP。",
        action: "inspect-object",
        value: "window-silhouette",
        label: "查看冷窗",
      };
    }
  }

  if (run.phase === "prep" && !profileCompleted(state.profile, "TUT-02")) {
    const guidedModule = run.modules.find((item) => item.definitionId === "M003");
    if (objectiveDone(run, "TUT-02", 0) && guidedModule && !guidedModule.active) {
      return {
        eyebrow: "下一步・整備",
        title: "先恢復剛才的供電",
        detail: "確認設備重新亮起後，再繼續配餐與出發。",
        action: "toggle-power",
        value: guidedModule.definitionId,
        label: "恢復設備供電",
      };
    }
    if (!objectiveDone(run, "TUT-02", 0)) {
      if (state.carriagePanel !== "power") {
        return {
          eyebrow: "下一步・整備",
          title: "打開今晚的配電",
          detail: "先看供電需求；開啟面板本身不扣 AP 或物資。",
          action: "power",
          label: "打開配電",
        };
      }
      const module = run.modules.find((item) => item.definitionId === "M003") ?? run.modules.find((item) => item.definitionId !== "M001");
      return module
        ? {
            eyebrow: "下一步・整備",
            title: "試切一項非防護設備",
            detail: "先暫停一次，下一步會請你恢復；防護板保持開啟。",
            action: "toggle-power",
            value: module.definitionId,
            label: "暫停溫室供電",
          }
        : null;
    }
    if (!objectiveDone(run, "TUT-02", 1)) {
      if (state.carriagePanel !== "meal") {
        return {
          eyebrow: "下一步・整備",
          title: "查看今晚的配餐",
          detail: "打開面板不扣資源；配餐效果會在黎明照原規則結算。",
          action: "meal",
          label: "打開配餐",
        };
      }
      return {
        eyebrow: "下一步・整備",
        title: "確認你的配餐方式",
        detail: "沿用目前選項，或在面板挑另一種；不會額外重複扣款。",
        action: "select-ration",
        value: run.rationMode,
        label: "沿用目前配餐",
      };
    }
  }

  if (run.phase === "prep" && !profileCompleted(state.profile, "TUT-03") && !objectiveDone(run, "TUT-03", 0)) {
    const plot = run.crops.find((item) => !item.cropId);
    if (state.activeCarriageId !== "greenhouse") {
      return {
        eyebrow: "下一步・播種",
        title: "到溫室選一座空槽",
        detail: "先查看播種成本；預覽可以取消，不會直接扣 AP 或飲水。",
        action: "select-carriage",
        value: "greenhouse",
        label: "前往溫室",
      };
    }
    if (plot) {
      return {
        eyebrow: "下一步・播種",
        title: "預覽第一株作物",
        detail: "下一畫面會列出 AP 與飲水成本；確認前都可以取消。",
        action: "preview-action",
        value: `plant-crop|${plot.id}:${state.selectedCropId}`,
        label: "查看播種成本",
      };
    }
  }

  if (run.phase === "prep" && !profileCompleted(state.profile, "TUT-04") && !objectiveDone(run, "TUT-04", 0)) {
    return {
      eyebrow: "下一步・路線",
      title: "準備好就查看路線",
      detail: "先比較燃料與風險；進入路線頁不會自動選路。",
      action: "route",
      label: "查看路線",
    };
  }

  return null;
}
