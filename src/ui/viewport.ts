export interface AppViewportController {
  sync(): void;
  destroy(): void;
}

export function installAppViewport(win: Window = window): AppViewportController {
  const root = win.document.documentElement;
  const viewport = win.visualViewport;
  const write = () => {
    const zoomed = (viewport?.scale ?? 1) > 1.001;
    const width = Math.round(zoomed ? win.innerWidth : (viewport?.width ?? win.innerWidth));
    const height = Math.round(zoomed ? win.innerHeight : (viewport?.height ?? win.innerHeight));
    const shellWidth = Math.min(width, 430);
    const sceneWidth = Math.min(shellWidth, height * 0.5625);
    const sceneHeight = sceneWidth / 0.5625;
    const sceneLeft = (shellWidth - sceneWidth) / 2;
    const sceneTop = (height - sceneHeight) / 2;
    root.style.setProperty("--app-width", `${width}px`);
    root.style.setProperty("--app-height", `${height}px`);
    root.style.setProperty("--app-viewport-top", `${Math.round(viewport?.offsetTop ?? 0)}px`);
    root.style.setProperty("--scene-width", `${sceneWidth}px`);
    root.style.setProperty("--scene-height", `${sceneHeight}px`);
    root.style.setProperty("--scene-left", `${sceneLeft}px`);
    root.style.setProperty("--scene-top", `${sceneTop}px`);
    root.dataset.viewportZoomed = String(zoomed);
    root.dataset.viewportOrientation = width > height ? "landscape" : "portrait";
  };
  const sync = write;
  write();
  win.addEventListener("resize", sync, { passive: true });
  win.addEventListener("orientationchange", sync, { passive: true });
  viewport?.addEventListener("resize", sync, { passive: true });
  viewport?.addEventListener("scroll", sync, { passive: true });
  return {
    sync,
    destroy() {
      win.removeEventListener("resize", sync);
      win.removeEventListener("orientationchange", sync);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
    },
  };
}
