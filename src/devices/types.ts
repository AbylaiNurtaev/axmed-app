export type DeviceKind = "fitness-band" | "scale";
export type ConnectionPhase = "idle" | "requestingPermission" | "scanning" | "connecting" | "verifying" | "connected" | "error";
export type NearbyDevice = { id: string; name: string; rssi: number; adapterId: string; kind: DeviceKind };
export type ConnectionSnapshot = {
  phase: ConnectionPhase;
  devices: readonly NearbyDevice[];
  selectedDeviceId?: string;
  errorCode?: string;
};
export interface DeviceAdapter {
  readonly id: string;
  readonly kind: DeviceKind;
  getSnapshot(): ConnectionSnapshot;
  subscribe(listener: () => void): () => void;
  startScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  cancelPending(): Promise<void>;
  disconnect(): Promise<void>;
  syncData?(requestId: string): Promise<DeviceSyncBatch>;
  subscribeSyncProgress?(listener: (progress: SyncProgress) => void): () => void;
}

export type Metric = "steps" | "heartRate" | "sleepDuration" | "weight"
  | "distance" | "activeCalories" | "oxygenSaturation" | "bloodPressureSystolic" | "bloodPressureDiastolic"
  | "bodyTemperature" | "hrv" | "stress" | "met" | "sleepDeep" | "sleepLight" | "sleepRem" | "sleepAwake";
export type DeviceReading = {
  sourceRecordId: string;
  metric: Metric;
  value: number;
  unit: "count" | "bpm" | "min" | "kg" | "km" | "kcal" | "percent" | "mmHg" | "celsius" | "ms" | "score" | "MET";
  // An array with no per-element times is a mean at the vendor record's time,
  // never an invented instantaneous reading. Old bridges omit this field.
  aggregation?: "mean" | "dailyTotal";
  origin?: "automatic" | "manual";
  recordedAt: string;
  periodEnd?: string;
  localDate: string;
};
export type DeviceBattery = { value: number; unit: "percent" | "bars"; low: boolean };
export type DeviceSyncBatch = {
  device: Pick<NearbyDevice, "id" | "name" | "adapterId" | "kind">;
  readAt: string;
  timeZone: string;
  historyDays: number;
  skippedRecords: number;
  battery?: DeviceBattery;
  samples: DeviceReading[];
  syncVersion?: number;
  warnings?: string[];
};
export type SyncStage = "battery" | "history" | "oxygen" | "hrv" | "temperature" | "manual" | "activity" | "complete";
export type SyncProgress = { requestId: string; stage: SyncStage; progress: number };
export interface SyncTransport {
  syncData(requestId: string): Promise<DeviceSyncBatch>;
  addListener(event: "onSyncProgress", listener: (progress: SyncProgress) => void): { remove(): void };
}
// Transport is private to an adapter. Future scales need not use Veepoo or even BLE.
export interface ConnectionTransport {
  getSnapshot(): Promise<ConnectionSnapshot>;
  addListener(event: "onSnapshot", listener: (snapshot: ConnectionSnapshot) => void): { remove(): void };
  startScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  cancelPending(): Promise<void>;
  disconnect(): Promise<void>;
}
