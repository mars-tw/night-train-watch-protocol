import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import "./styles/integration.css";
import "./styles/animation.css";
import { NightTrainApp } from "./app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

const game = new NightTrainApp(root);
void game.start();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("./sw.js"));
}
