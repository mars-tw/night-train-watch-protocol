import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioService } from "../src/game/audio";

afterEach(() => vi.unstubAllGlobals());

describe("optional browser audio", () => {
  it("keeps game actions usable when Web Audio is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const audio = new AudioService();
    await expect(audio.enable()).resolves.toBeUndefined();
    expect(() => audio.cue("tap")).not.toThrow();
  });

  it("does not play into a suspended context after browser resume refusal", async () => {
    const oscillator = vi.fn();
    vi.stubGlobal("AudioContext", class {
      state = "suspended";
      resume = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
      createOscillator = oscillator;
    });
    const audio = new AudioService();
    await expect(audio.enable()).resolves.toBeUndefined();
    audio.cue("warning");
    expect(oscillator).not.toHaveBeenCalled();
  });

  it("accepts a prefixed context and tolerates constructor refusal", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const constructed = vi.fn();
    vi.stubGlobal("webkitAudioContext", class {
      constructor() { constructed(); throw new Error("Audio disabled"); }
    });
    const audio = new AudioService();
    await expect(audio.enable()).resolves.toBeUndefined();
    expect(constructed).toHaveBeenCalledOnce();
    expect(() => audio.cue("tap")).not.toThrow();
  });
});
