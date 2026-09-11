import { authenticatedRequest, getSessionUserId, subscribeSession } from "../features/auth/authApi";
import { deviceGateway } from "./deviceGateway";
import { SyncCoordinator } from "./SyncCoordinator";
import type { DeviceSyncBatch } from "./types";

const bracelet = deviceGateway.forKind("fitness-band");
export const deviceSync = new SyncCoordinator(bracelet, {
  save: async (batch, signal) => {
    await authenticatedRequest("/api/devices/sync", { body: { ...batch, complete: true }, signal });
  },
  load: signal => authenticatedRequest<DeviceSyncBatch | null>("/api/devices/readings", { method: "GET", signal })
});

let autoConnection: string | undefined;
function updateOwner() {
  deviceSync.setOwner(getSessionUserId());
  if (!getSessionUserId()) autoConnection = undefined;
}
updateOwner();
subscribeSession(updateOwner);
bracelet.subscribe(() => {
  const connection = bracelet.getSnapshot();
  if (connection.phase !== "connected") { autoConnection = undefined; return; }
  if (!getSessionUserId() || autoConnection === connection.selectedDeviceId) return;
  autoConnection = connection.selectedDeviceId;
  void deviceSync.sync();
});
