import type { ConnectionSnapshot, DeviceKind, NearbyDevice } from "./types";

export function connectedDevices(connections: ReadonlyArray<{
  kind: DeviceKind; adapterId: string; snapshot: ConnectionSnapshot;
}>): NearbyDevice[] {
  const devices = new Map<string, NearbyDevice>();
  for (const { kind, adapterId, snapshot } of connections) {
    if (snapshot.phase !== "connected") continue;
    const device = snapshot.devices.find(item => item.id === snapshot.selectedDeviceId
      && item.kind === kind && item.adapterId === adapterId);
    if (device && !devices.has(device.id)) devices.set(device.id, device);
  }
  return [...devices.values()];
}
