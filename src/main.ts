import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import "./styles/integration.css";
import "./styles/animation.css";
import "./styles/v2.css";
import "./styles/offline-status.css";
import { NightTrainApp } from "./app";
import { initializeRasterIcons } from "./ui/icons";
import { startOfflineStatus } from "./ui/offline-status";
import { installAppViewport } from "./ui/viewport";

installAppViewport();

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

const game = new NightTrainApp(root);
initializeRasterIcons();
void game.start();

void startOfflineStatus({
  serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
  isProduction: import.meta.env.PROD,
}).catch(() => undefined);
