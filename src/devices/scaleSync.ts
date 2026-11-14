import { authenticatedRequest, getSessionUserId, subscribeSession } from "../features/auth/authApi";
import { deviceGateway } from "./deviceGateway";
import { SyncCoordinator } from "./SyncCoordinator";
import type { DeviceSyncBatch } from "./types";
import { mergeScaleBatches, withMockScaleComposition } from "./mockScaleComposition";

const scale = deviceGateway.forKind("scale");
export const scaleSync = new SyncCoordinator(scale, {
  prepare: (batch, previous) => withMockScaleComposition(mergeScaleBatches(previous, batch)),
  save: async (batch, signal) => {
    await authenticatedRequest("/api/devices/sync", { body: { ...batch, complete: true }, signal });
  },
  load: async signal => {
    const batch = await authenticatedRequest<DeviceSyncBatch | null>("/api/devices/readings?kind=scale", { method: "GET", signal });
    return batch ? withMockScaleComposition(batch) : null;
  }
});

function updateOwner() { scaleSync.setOwner(getSessionUserId()); }
updateOwner();
subscribeSession(updateOwner);
