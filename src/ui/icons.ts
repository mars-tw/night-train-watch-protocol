export const icons = {
  play: "play", plus: "build", hub: "hub", settings: "settings",
  power: "power", fuel: "fuel", temperature: "temperature", noise: "noise",
  hull: "hull", build: "build", meal: "meal", route: "route", back: "back",
  pause: "pause", scan: "scan", danger: "danger", tech: "tech", shield: "shield",
  shock: "shock", boost: "boost", sleep: "sleep", defense: "defense",
  workshop: "workshop", greenhouse: "greenhouse", kitchen: "kitchen", water: "water",
  medicine: "medicine", repair: "repair", comfort: "comfort", seed: "seed",
  harvest: "harvest", quest: "quest", journal: "journal",
} as const;

export type UiIcon = (typeof icons)[keyof typeof icons];

const ICON_LABELS: Record<UiIcon, string> = {
  play: "開始", build: "建造", hub: "中心", settings: "設定", power: "電量",
  fuel: "燃料", temperature: "溫度", noise: "噪音", hull: "車體", meal: "配餐",
  route: "路線", back: "返回", pause: "暫停", scan: "掃描", danger: "危險",
  tech: "科技", shield: "防護", shock: "電擊", boost: "增幅", sleep: "休息",
  defense: "防禦", workshop: "工坊", greenhouse: "溫室", kitchen: "廚房",
  water: "飲水", medicine: "藥品", repair: "修理", comfort: "安撫", seed: "種植",
  harvest: "收成", quest: "任務", journal: "日誌",
};

const LEGACY_ICON_ALIASES: Record<string, UiIcon> = {
  "▶": "play", "+": "build", "◇": "hub", "設": "settings",
  E: "power", F: "fuel", T: "temperature", N: "noise", H: "hull",
  "▦": "build", "食": "meal", "▷": "route", "‹": "back", "Ⅱ": "pause",
  "⌁": "scan", "!": "danger", "✦": "tech", "▥": "shield", "▧": "shock",
  "»": "boost", "◎": "scan", "扣": "repair", "▰": "hull", "剪": "repair",
  "門": "shield", "≋": "scan", "⇄": "tech", "葉": "greenhouse", "錶": "power",
  "光": "scan", "暖": "temperature", "軌": "route", "環": "greenhouse",
  "霜": "temperature", "嫁": "seed", "濾": "water", "焚": "danger", "根": "seed",
  "器": "workshop", "簿": "quest", "票": "journal", "記": "journal",
};

const ICON_ATLAS_URL = "./assets/art/v21/ui/icon-atlas.webp";

function escapeIconText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function initializeRasterIcons(): void {
  const image = new Image();
  image.onload = () =>
    document.documentElement.classList.add("raster-icons-ready");
  image.onerror = () =>
    document.documentElement.classList.remove("raster-icons-ready");
  image.src = ICON_ATLAS_URL;
}

export function iconMarkup(icon: string, label?: string): string {
  const resolved = LEGACY_ICON_ALIASES[icon] ?? icon;
  if (!(resolved in ICON_LABELS))
    return `<span class="ui-icon-fallback">${escapeIconText(label ?? icon)}</span>`;
  const safeIcon = resolved as UiIcon;
  const fallback = escapeIconText(label ?? ICON_LABELS[safeIcon]);
  return `<span class="ui-icon ui-icon--${safeIcon}" role="img" aria-label="${fallback}"><span>${fallback}</span></span>`;
}
