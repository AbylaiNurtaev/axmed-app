import { AppState } from "react-native";
import { authenticatedRequest, getSessionUserId, subscribeSession } from "../features/auth/authApi";
import { DeviceBindingsCoordinator, type SavedDevice } from "./DeviceBindingsCoordinator";
import { deviceGateway } from "./deviceGateway";

export const deviceBindings = new DeviceBindingsCoordinator([
  deviceGateway.forKind("fitness-band"), deviceGateway.forKind("scale")
], {
  load: signal => authenticatedRequest<SavedDevice[]>("/api/devices/bindings", { method: "GET", signal }),
  save: (device, signal) => authenticatedRequest("/api/devices/bindings", { body: device, signal })
});

export function startDeviceBindings() {
  const update = () => deviceBindings.setOwner(getSessionUserId());
  update();
  const removeSession = subscribeSession(update);
  const subscription = AppState.addEventListener("change", state => {
    if (state === "active") deviceBindings.resume();
    else if (state === "background") {
      for (const kind of ["fitness-band", "scale"] as const) {
        const adapter = deviceGateway.forKind(kind);
        if (["requestingPermission", "scanning"].includes(adapter.getSnapshot().phase)) void adapter.cancelPending();
      }
    }
  });
  return () => { removeSession(); subscription.remove(); deviceBindings.setOwner(null); };
}
