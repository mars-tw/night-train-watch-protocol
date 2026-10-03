import { describe, expect, it, vi } from "vitest";
import { startOfflineStatus, type OfflineState, type ServiceWorkerContainerLike } from "../src/ui/offline-status";

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installing";
  ready = false;
  autoRespond = true;
  pendingPorts: MessagePort[] = [];
  postMessage(_message: unknown, transfer?: Transferable[]) {
    const port = transfer?.[0] as MessagePort;
    if (this.autoRespond) this.respond(port);
    else this.pendingPorts.push(port);
  }
  respond(port = this.pendingPorts.shift()) {
    port?.postMessage({ type: "NTWP_OFFLINE_STATUS", state: this.ready ? "ready" : "installing" });
  }
  respondAll() {
    while (this.pendingPorts.length) this.respond();
  }
  change(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
}

class FakeContainer extends EventTarget implements ServiceWorkerContainerLike {
  controller: FakeWorker | null = null;
  registration = new FakeRegistration();
  register = vi.fn(async () => this.registration);
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function harness(container: FakeContainer) {
  const states: OfflineState[] = [];
  let retry: (() => void) | undefined;
  return {
    states,
    get retry() { return retry; },
    run: () => startOfflineStatus({
      serviceWorker: container,
      isProduction: true,
      createView: () => ({ show(state, _message, nextRetry) { states.push(state); retry = nextRetry; } }),
      messageChannel: () => new MessageChannel(),
    }),
  };
}

describe("offline status", () => {
  it("reports install failure and retries the same registration", async () => {
    const container = new FakeContainer();
    const installing = new FakeWorker();
    container.registration.installing = installing;
    const test = harness(container);
    await test.run();
    installing.change("redundant");
    expect(test.states.at(-1)).toBe("failed");
    test.retry?.();
    await settle();
    expect(container.registration.update).toHaveBeenCalledOnce();
    expect(test.states).toContain("downloading");
  });

  it("only reports ready after an active controller confirms the complete cache", async () => {
    const container = new FakeContainer();
    const test = harness(container);
    await test.run();
    expect(test.states.at(-1)).toBe("downloading");
    const controller = new FakeWorker();
    controller.ready = true;
    container.controller = controller;
    container.dispatchEvent(new Event("controllerchange"));
    await settle();
    expect(test.states.at(-1)).toBe("ready");
  });

  it("announces a changed controller without reloading the page", async () => {
    const container = new FakeContainer();
    const first = new FakeWorker();
    first.ready = true;
    container.controller = first;
    const test = harness(container);
    await test.run();
    expect(test.states.at(-1)).toBe("ready");
    const updated = new FakeWorker();
    updated.ready = true;
    container.controller = updated;
    container.dispatchEvent(new Event("controllerchange"));
    await settle();
    expect(test.states.at(-1)).toBe("update-ready");
  });

  it("ignores a late reply from the replaced controller during retry", async () => {
    const container = new FakeContainer();
    const old = new FakeWorker();
    old.autoRespond = false;
    container.controller = old;
    container.registration.installing = old;
    const test = harness(container);
    const starting = test.run();
    await settle();
    old.change("redundant");
    test.retry?.();
    await settle();
    expect(container.registration.update).toHaveBeenCalledOnce();

    const next = new FakeWorker();
    next.ready = true;
    container.controller = next;
    container.dispatchEvent(new Event("controllerchange"));
    await settle();
    expect(test.states.at(-1)).toBe("update-ready");

    old.respondAll();
    await starting;
    await settle();
    expect(test.states.at(-1)).toBe("update-ready");
  });
});
