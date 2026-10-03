export class AudioService {
  private context: AudioContext | null = null;

  public async enable(): Promise<void> {
    const AudioCtor = globalThis.AudioContext ?? (globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioCtor) return;
    try {
      if (!this.context) this.context = new AudioCtor();
      if (this.context.state === "suspended") await this.context.resume();
    } catch {
      // Sound is optional; a browser restriction must not block a game action.
    }
  }

  public cue(kind: "tap" | "safe" | "warning" | "breach"): void {
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const settings = {
      tap: [260, 0.035, 0.035],
      safe: [420, 0.06, 0.1],
      warning: [180, 0.1, 0.16],
      breach: [90, 0.16, 0.25],
    } as const;
    const [frequency, volume, duration] = settings[kind];
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.type = kind === "breach" ? "sawtooth" : "sine";
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
