import type { DeviceAdapter, DeviceKind, NearbyDevice } from "./types";

export type SavedDevice = Pick<NearbyDevice, "id" | "name" | "adapterId" | "kind">;
export type BindingState = { device?: SavedDevice; saving: boolean; saved: boolean; error?: string };
type Persistence = {
  load: (signal: AbortSignal) => Promise<SavedDevice[]>;
  save: (device: SavedDevice, signal: AbortSignal) => Promise<unknown>;
};

export class DeviceBindingsCoordinator {
  private owner: string | null = null;
  private epoch = 0;
  private controller = new AbortController();
  private state: Partial<Record<DeviceKind, BindingState>> = {};
  private readonly listeners = new Set<() => void>();
  private readonly intent = new Map<DeviceKind, string>();
  private readonly autoTargets = new Map<DeviceKind, string>();
  private readonly paused = new Set<DeviceKind>();
  private readonly removeListeners: Array<() => void>;
  private readonly adapters: readonly DeviceAdapter[];
  private readonly persistence: Persistence;

  constructor(adapters: readonly DeviceAdapter[], persistence: Persistence) {
    this.adapters = adapters;
    this.persistence = persistence;
    this.removeListeners = adapters.map(adapter => adapter.subscribe(() => this.observe(adapter)));
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(kind: DeviceKind, state: BindingState) {
    this.state = { ...this.state, [kind]: state };
    this.listeners.forEach(listener => listener());
  }
  private adapter(kind: DeviceKind) {
    const adapter = this.adapters.find(item => item.kind === kind);
    if (!adapter) throw new Error("Device adapter unavailable");
    return adapter;
  }
  setOwner = (owner: string | null) => {
    if (owner === this.owner) return;
    const hadOwner = Boolean(this.owner);
    this.owner = owner;
    this.epoch += 1;
    this.controller.abort();
    this.controller = new AbortController();
    this.intent.clear(); this.autoTargets.clear(); this.paused.clear();
    this.state = {};
    this.listeners.forEach(listener => listener());
    // Do not allow a connection started by another account to be remembered.
    const epoch = this.epoch;
    const disconnecting = hadOwner ? Promise.all(this.adapters.map(adapter => adapter.disconnect())) : Promise.resolve();
    if (owner) void disconnecting.then(() => this.load(epoch)).catch(() => {});
  };
  private async load(epoch: number) {
    if (epoch !== this.epoch || !this.owner) return;
    try {
      const bindings = await this.persistence.load(this.controller.signal);
      if (epoch !== this.epoch) return;
      for (const device of bindings) {
        // A manual selection made while the request was in flight takes priority.
        if (this.intent.has(device.kind) || this.state[device.kind]?.device) continue;
        this.publish(device.kind, { device, saving: false, saved: true });
      }
      this.restoreConnections();
    } catch { /* A failed restore never invents a Bluetooth connection. */ }
  }
  restoreConnections = () => {
    if (!this.owner) return;
    for (const adapter of this.adapters) {
      const saved = this.state[adapter.kind];
      if (!saved?.saved || !saved.device || this.paused.has(adapter.kind) || this.intent.has(adapter.kind)) continue;
      if (!["idle", "error"].includes(adapter.getSnapshot().phase)) continue;
      this.autoTargets.set(adapter.kind, saved.device.id);
      void adapter.startScan().catch(() => { this.autoTargets.delete(adapter.kind); });
    }
  };
  resume = () => { if (this.owner) void this.load(this.epoch); };
  pause = (kind: DeviceKind) => {
    this.paused.add(kind); this.autoTargets.delete(kind); this.intent.delete(kind);
  };
  scan = async (kind: DeviceKind) => {
    this.pause(kind);
    await this.adapter(kind).startScan();
  };
  cancel = async (kind: DeviceKind) => {
    this.pause(kind);
    await this.adapter(kind).cancelPending();
  };
  disconnect = async (kind: DeviceKind) => {
    this.pause(kind);
    await this.adapter(kind).disconnect();
  };
  connect = async (kind: DeviceKind, id: string) => {
    this.autoTargets.delete(kind);
    if (this.owner) this.intent.set(kind, id);
    await this.adapter(kind).connect(id);
  };
  private observe(adapter: DeviceAdapter) {
    const snapshot = adapter.getSnapshot();
    const target = this.autoTargets.get(adapter.kind);
    if (target && snapshot.phase === "scanning" && snapshot.devices.some(device => device.id === target && device.adapterId === adapter.id)) {
      this.autoTargets.delete(adapter.kind);
      void adapter.connect(target);
    } else if (target && ["idle", "error", "connected"].includes(snapshot.phase)) this.autoTargets.delete(adapter.kind);
    if (!this.owner || snapshot.phase !== "connected" || this.intent.get(adapter.kind) !== snapshot.selectedDeviceId) return;
    const selected = snapshot.devices.find(device => device.id === snapshot.selectedDeviceId && device.kind === adapter.kind && device.adapterId === adapter.id);
    if (!selected) return;
    this.intent.delete(adapter.kind);
    this.paused.delete(adapter.kind);
    const { id, name, adapterId, kind } = selected;
    void this.save({ id, name, adapterId, kind });
  }
  private async save(device: SavedDevice) {
    if (!this.owner) return;
    const epoch = this.epoch;
    this.publish(device.kind, { device, saving: true, saved: false });
    try {
      await this.persistence.save(device, this.controller.signal);
      if (epoch === this.epoch && this.state[device.kind]?.device?.id === device.id) this.publish(device.kind, { device, saving: false, saved: true });
    } catch {
      if (epoch === this.epoch && this.state[device.kind]?.device?.id === device.id) this.publish(device.kind, { device, saving: false, saved: false, error: "Устройство подключено, но привязку не удалось сохранить. Проверьте интернет и повторите." });
    }
  }
  retrySave = (kind: DeviceKind) => {
    const state = this.state[kind];
    const connection = this.adapter(kind).getSnapshot();
    if (state?.device && !state.saving && connection.phase === "connected" && connection.selectedDeviceId === state.device.id) return this.save(state.device);
    return Promise.resolve();
  };
  dispose() { this.controller.abort(); this.removeListeners.forEach(remove => remove()); this.listeners.clear(); }
}
