export type LoadStatus = "queued" | "loading" | "loaded" | "failed";

export interface LoadQueueSnapshot<Key extends string> {
  active: number;
  queued: readonly Key[];
  status: ReadonlyMap<Key, LoadStatus>;
  attempts: ReadonlyMap<Key, number>;
}

export interface BoundedLoadQueueOptions<Key extends string> {
  concurrency?: number;
  maxAttempts?: number;
  onLoaded?: (key: Key) => void;
  onFailed?: (key: Key) => void;
}

export class BoundedLoadQueue<Key extends string> {
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly status = new Map<Key, LoadStatus>();
  private readonly attempts = new Map<Key, number>();
  private desired = new Set<Key>();
  private queue: Key[] = [];
  private active = 0;
  private idleWaiters: Array<() => void> = [];

  public constructor(
    private readonly loader: (key: Key, attempt: number) => Promise<void>,
    private readonly options: BoundedLoadQueueOptions<Key> = {},
  ) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  }

  public setPriority(keys: readonly Key[]): void {
    const priority = [...new Set(keys)];
    const prioritySet = new Set(priority);
    // A failed asset gets a fresh bounded attempt cycle only after it leaves
    // the desired scene. Repeated renders of the same scene never retry forever.
    for (const key of this.desired) {
      if (!prioritySet.has(key) && this.status.get(key) === "failed") {
        this.status.delete(key);
        this.attempts.delete(key);
      }
    }
    this.desired = prioritySet;
    for (const key of this.queue) {
      if (!prioritySet.has(key) && this.status.get(key) === "queued") {
        this.status.delete(key);
      }
    }
    this.queue = this.queue.filter((key) => prioritySet.has(key));
    for (const key of priority) {
      const status = this.status.get(key);
      if (status === "loaded" || status === "loading" || status === "queued") continue;
      if ((this.attempts.get(key) ?? 0) >= this.maxAttempts) continue;
      this.status.set(key, "queued");
      this.queue.push(key);
    }
    this.queue.sort((left, right) => priority.indexOf(left) - priority.indexOf(right));
    this.pump();
  }

  public evict(key: Key): void {
    if (this.status.get(key) === "loading") return;
    this.status.delete(key);
    this.attempts.delete(key);
    this.queue = this.queue.filter((candidate) => candidate !== key);
  }

  public isLoading(key: Key): boolean {
    return this.status.get(key) === "loading";
  }

  public snapshot(): LoadQueueSnapshot<Key> {
    return {
      active: this.active,
      queued: [...this.queue],
      status: new Map(this.status),
      attempts: new Map(this.attempts),
    };
  }

  public whenIdle(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const key = this.queue.shift();
      if (!key || this.status.get(key) !== "queued") continue;
      const attempt = (this.attempts.get(key) ?? 0) + 1;
      this.attempts.set(key, attempt);
      this.status.set(key, "loading");
      this.active += 1;
      void this.loader(key, attempt).then(
        () => {
          this.active -= 1;
          this.status.set(key, "loaded");
          this.options.onLoaded?.(key);
          this.finishCycle();
        },
        () => {
          this.active -= 1;
          if (!this.desired.has(key)) {
            this.status.delete(key);
            this.attempts.delete(key);
          } else if (attempt < this.maxAttempts) {
            this.status.set(key, "queued");
            this.queue.push(key);
          } else {
            this.status.set(key, "failed");
            this.options.onFailed?.(key);
          }
          this.finishCycle();
        },
      );
    }
    this.resolveIdleIfNeeded();
  }

  private finishCycle(): void {
    this.pump();
  }

  private resolveIdleIfNeeded(): void {
    if (this.active !== 0 || this.queue.length !== 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}
