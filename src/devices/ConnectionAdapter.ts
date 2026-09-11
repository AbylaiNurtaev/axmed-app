import type { ConnectionSnapshot, ConnectionTransport, DeviceAdapter, DeviceKind, SyncTransport, SyncProgress } from "./types";

export class ConnectionAdapter implements DeviceAdapter {
  private snapshot: ConnectionSnapshot = { phase: "idle", devices: [] };
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private readonly nativeSubscription?: { remove(): void };
  readonly id: string;
  readonly kind: DeviceKind;
  private readonly transport: ConnectionTransport | null;
  private readonly unavailableCode: string;

  constructor(id: string, kind: DeviceKind, transport: ConnectionTransport | null, unavailableCode = "nativeBuildRequired") {
    this.id = id;
    this.kind = kind;
    this.transport = transport;
    this.unavailableCode = unavailableCode;
    if (transport) {
      // One native subscription for the app lifetime; screen subscriptions are removable.
      this.nativeSubscription = transport.addListener("onSnapshot", snapshot => this.update(snapshot));
      const revision = this.revision;
      void transport.getSnapshot().then(snapshot => {
        if (revision === this.revision) this.update(snapshot);
      }).catch(() => {
        if (revision === this.revision) this.fail("nativeUnavailable");
      });
    }
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(snapshot: ConnectionSnapshot) {
    this.revision += 1;
    const hasSelectedDevice = snapshot.devices.some(device => device.id === snapshot.selectedDeviceId);
    this.snapshot = snapshot.phase === "connected" && !hasSelectedDevice
      ? { phase: "error", devices: [], errorCode: "invalidNativeState" }
      : snapshot;
    this.listeners.forEach(listener => listener());
  }
  private fail(errorCode: string) {
    this.update({ phase: "error", devices: this.snapshot.devices, errorCode });
  }
  private async invoke(operation: (transport: ConnectionTransport) => Promise<void>) {
    this.revision += 1;
    if (!this.transport) { this.fail(this.unavailableCode); return; }
    try { await operation(this.transport); }
    catch { this.fail("nativeUnavailable"); }
  }
  startScan = () => this.invoke(transport => transport.startScan());
  connect = (deviceId: string) => this.invoke(transport => transport.connect(deviceId));
  disconnect = () => this.invoke(transport => transport.disconnect());
  cancelPending = async () => {
    if (!this.transport) { this.update({ phase: "idle", devices: [] }); return; }
    await this.invoke(transport => transport.cancelPending());
  };
  syncData = async (requestId: string) => {
    const transport = this.transport as (ConnectionTransport & Partial<SyncTransport>) | null;
    if (!transport?.syncData) throw new Error("syncBuildRequired");
    const deviceId = this.snapshot.selectedDeviceId;
    if (this.snapshot.phase !== "connected" || !deviceId) throw new Error("disconnected");
    const batch = await transport.syncData(requestId);
    if (this.snapshot.phase !== "connected" || this.snapshot.selectedDeviceId !== deviceId || batch.device.id !== deviceId) {
      throw new Error("disconnected");
    }
    return batch;
  };
  subscribeSyncProgress = (listener: (progress: SyncProgress) => void) => {
    const transport = this.transport as (ConnectionTransport & Partial<SyncTransport>) | null;
    if (!transport?.syncData) return () => {};
    const subscription = transport.addListener("onSyncProgress", listener);
    return () => subscription.remove();
  };
  dispose() {
    this.nativeSubscription?.remove();
    this.listeners.clear();
  }
}
