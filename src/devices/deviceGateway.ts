import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { ConnectionAdapter } from "./ConnectionAdapter";
import { DeviceGateway } from "./GatewayRegistry";
import type { ConnectionTransport } from "./types";

export const deviceGateway = new DeviceGateway();
deviceGateway.register(new ConnectionAdapter(
  "hband", "fitness-band",
  Platform.OS === "ios" ? requireOptionalNativeModule<ConnectionTransport>("AxmedHBand") : null,
  Platform.OS === "ios" ? "nativeBuildRequired" : "iosOnly"
));
deviceGateway.register(new ConnectionAdapter(
  "lefu-scale", "scale",
  Platform.OS === "ios" ? requireOptionalNativeModule<ConnectionTransport>("AxmedLefuScale") : null,
  Platform.OS === "ios" ? "nativeBuildRequired" : "iosOnly"
));
