export type OfflineState = "hidden" | "downloading" | "ready" | "failed" | "update-ready" | "unavailable";

interface OfflineView {
  show(state: OfflineState, message: string, retry?: () => void): void;
}

type WorkerLike = EventTarget & {
  state: ServiceWorkerState;
  postMessage(message: unknown, transfer: Transferable[]): void;
};
type RegistrationLike = {
  installing: WorkerLike | null;
  waiting: WorkerLike | null;
  active: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: "updatefound", listener: EventListener): void;
};

export interface ServiceWorkerContainerLike extends EventTarget {
  controller: WorkerLike | null;
  register(scriptURL: string): Promise<RegistrationLike>;
}

export interface OfflineStatusOptions {
  serviceWorker?: ServiceWorkerContainerLike;
  isProduction: boolean;
  document?: Document;
  createView?: () => OfflineView;
  messageChannel?: () => MessageChannel;
}

const copy: Record<Exclude<OfflineState, "hidden">, string> = {
  downloading: "正在準備離線遊玩…",
  ready: "離線遊玩已準備好",
  failed: "離線資料下載失敗",
  "update-ready": "離線資料已更新，下次開啟載入新版遊戲",
  unavailable: "這個瀏覽器無法準備離線遊玩",
};

function createDomView(doc: Document): OfflineView {
  const root = doc.createElement("aside");
  root.className = "offline-status";
  root.hidden = true;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  const label = doc.createElement("span");
  label.className = "offline-status__label";
  const retryButton = doc.createElement("button");
  retryButton.className = "offline-status__retry";
  retryButton.type = "button";
  retryButton.textContent = "重新下載";
  root.append(label, retryButton);
  doc.body.append(root);

  let currentState: OfflineState = "hidden";
  const app = doc.querySelector("#app");
  const mainMenu = () => app?.querySelector<HTMLElement>(".screen--menu, .screen--main-menu, [data-screen^=\"SCR-MM-\"], [data-screen=\"main-menu\"]") ?? null;
  const syncVisibility = () => {
    const menu = mainMenu();
    root.hidden = currentState === "hidden" || !menu;
    const slot = menu?.querySelector<HTMLElement>(".menu-status-slot");
    if (slot && root.parentElement !== slot) slot.append(root);
    if (!menu && root.parentElement !== doc.body) doc.body.append(root);
  };
  const Observer = doc.defaultView?.MutationObserver;
  if (app && Observer) {
    new Observer(mutations => {
      if (mutations.every(mutation => root.contains(mutation.target))) return;
      syncVisibility();
    }).observe(app, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-screen"],
    });
  }
  return {
    show(state, message, retry) {
      currentState = state;
      root.dataset.state = state;
      doc.documentElement.dataset.offlineStatus = state;
      label.textContent = message;
      retryButton.hidden = !retry;
      retryButton.onclick = retry ?? null;
      syncVisibility();
    },
  };
}

function queryController(worker: WorkerLike, makeChannel: () => MessageChannel): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const channel = makeChannel();
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(ready);
    };
    const timer = globalThis.setTimeout(() => finish(false), 2500);
    channel.port1.onmessage = (event: MessageEvent) => {
      finish(event.data?.type === "NTWP_OFFLINE_STATUS" && event.data.state === "ready");
    };
    try {
      worker.postMessage({ type: "NTWP_OFFLINE_STATUS" }, [channel.port2]);
    } catch (error) {
      globalThis.clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      reject(error);
    }
  });
}

export async function startOfflineStatus(options: OfflineStatusOptions): Promise<void> {
  if (!options.isProduction) return;
  const view = options.createView?.() ?? createDomView(options.document ?? document);
  const serviceWorker = options.serviceWorker;
  if (!serviceWorker) {
    view.show("unavailable", copy.unavailable);
    return;
  }

  const makeChannel = options.messageChannel ?? (() => new MessageChannel());
  let registration: RegistrationLike | null = null;
  let hadController = Boolean(serviceWorker.controller);
  let queryGeneration = 0;

  const showDownloading = () => {
    queryGeneration += 1;
    view.show("downloading", copy.downloading);
  };
  const showFailure = () => {
    queryGeneration += 1;
    view.show("failed", copy.failed, () => void retry());
  };
  const inspectController = async (changed = false) => {
    const controller = serviceWorker.controller;
    const generation = ++queryGeneration;
    if (!controller) {
      view.show("downloading", copy.downloading);
      return;
    }
    try {
      const complete = await queryController(controller, makeChannel);
      if (generation !== queryGeneration || serviceWorker.controller !== controller) return;
      if (!complete) {
        showFailure();
        return;
      }
      view.show(changed && hadController ? "update-ready" : "ready", changed && hadController ? copy["update-ready"] : copy.ready);
      hadController = true;
    } catch {
      if (generation !== queryGeneration || serviceWorker.controller !== controller) return;
      showFailure();
    }
  };

  const watchInstalling = (worker: WorkerLike | null) => {
    if (!worker) return;
    showDownloading();
    worker.addEventListener("statechange", () => {
      if (worker.state === "redundant") showFailure();
    });
  };

  const attachRegistration = (next: RegistrationLike) => {
    registration = next;
    watchInstalling(next.installing);
    next.addEventListener("updatefound", () => watchInstalling(next.installing));
  };

  const register = async () => {
    showDownloading();
    try {
      attachRegistration(await serviceWorker.register("./sw.js"));
      await inspectController();
    } catch {
      showFailure();
    }
  };

  const retry = async () => {
    showDownloading();
    try {
      if (!registration) {
        await register();
        return;
      }
      await registration.update();
      watchInstalling(registration.installing);
      await inspectController();
    } catch {
      showFailure();
    }
  };

  serviceWorker.addEventListener("controllerchange", () => void inspectController(true));
  await register();
}
