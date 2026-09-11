import type { DeviceAdapter, DeviceSyncBatch, SyncStage } from "./types";

export type SyncSnapshot = {
  phase: "idle" | "reading" | "saving" | "complete" | "error";
  stage?: SyncStage;
  progress: number;
  batch?: DeviceSyncBatch;
  saved: boolean;
  error?: string;
};
export interface SyncPersistence {
  save(batch: DeviceSyncBatch, signal: AbortSignal): Promise<void>;
  load(signal: AbortSignal): Promise<DeviceSyncBatch | null>;
}

// SDK-independent synchronization lifecycle. Only this coordinator owns an
// in-flight read/upload. No health data is written to unencrypted JS storage.
export class SyncCoordinator {
  private snapshot: SyncSnapshot = { phase: "idle", progress: 0, saved: false };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private owner: string | null = null;
  private abort?: AbortController;
  private inFlight?: Promise<void>;
  private removeProgress?: () => void;
  private readonly adapter: DeviceAdapter;
  private readonly persistence: SyncPersistence;

  constructor(adapter: DeviceAdapter, persistence: SyncPersistence) {
    this.adapter = adapter;
    this.persistence = persistence;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(patch: Partial<SyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  setOwner(userId: string | null) {
    if (userId === this.owner) return;
    const hadOwner = this.owner !== null;
    this.owner = userId;
    this.epoch += 1;
    this.abort?.abort();
    this.removeProgress?.();
    this.removeProgress = undefined;
    this.inFlight = undefined;
    this.snapshot = { phase: "idle", progress: 0, saved: false };
    this.publish({});
    // Prevent readings and late native callbacks from crossing account boundaries.
    if (hadOwner) void this.adapter.disconnect();
    if (userId) void this.restore();
  }
  private async restore() {
    const epoch = this.epoch;
    const controller = new AbortController();
    this.abort = controller;
    try {
      const batch = await this.persistence.load(controller.signal);
      if (epoch === this.epoch && batch) this.publish({ batch, saved: true });
    } catch { /* Cached readings are optional; a fresh sync remains available. */ }
  }
  sync = (): Promise<void> => this.run(false);
  retrySave = (): Promise<void> => this.run(true);

  private run(saveOnly: boolean): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.owner) { this.publish({ phase: "error", error: "authRequired" }); return Promise.resolve(); }
    // Invalidates a late cache load as well as previous callbacks.
    const epoch = ++this.epoch;
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    const requestId = `${Date.now()}-${epoch}`;
    const work = async () => {
      try {
        if (epoch !== this.epoch) return;
        let batch = saveOnly ? this.snapshot.batch : undefined;
        if (!saveOnly) {
          this.publish({ phase: "reading", stage: "battery", progress: 0, error: undefined });
          this.removeProgress = this.adapter.subscribeSyncProgress?.(progress => {
            if (epoch === this.epoch && progress.requestId === requestId) {
              this.publish({ stage: progress.stage, progress: Math.max(0, Math.min(100, progress.progress)) });
            }
          });
          if (!this.adapter.syncData) throw new Error("syncBuildRequired");
          batch = await this.adapter.syncData(requestId);
          if (epoch !== this.epoch) return;
          this.publish({ batch, saved: false });
        }
        if (!batch) throw new Error("noReadings");
        if (epoch !== this.epoch) return;
        this.publish({ phase: "saving", progress: 100, error: undefined });
        await this.persistence.save(batch, controller.signal);
        if (epoch === this.epoch) this.publish({ phase: "complete", saved: true });
      } catch (error) {
        if (epoch === this.epoch) {
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.message : "syncFailed";
          this.publish({ phase: "error", error: code });
        }
      } finally {
        if (epoch === this.epoch) {
          this.removeProgress?.();
          this.removeProgress = undefined;
          this.inFlight = undefined;
        }
      }
    };
    // Schedule after assignment so synchronous errors also release the lock.
    this.inFlight = Promise.resolve().then(work);
    return this.inFlight;
  }
  cancel = async () => {
    this.epoch += 1;
    this.abort?.abort();
    this.removeProgress?.();
    this.removeProgress = undefined;
    this.inFlight = undefined;
    const wasReading = this.snapshot.phase === "reading";
    this.publish({ phase: "idle", progress: 0, error: undefined });
    if (wasReading) await this.adapter.disconnect();
  };
}
