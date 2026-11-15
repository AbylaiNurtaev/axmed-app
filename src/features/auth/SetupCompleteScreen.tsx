import { useAuthStyles, type AuthColors } from "./authTheme";
import { Ionicons } from "@expo/vector-icons";
import { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { deviceGateway } from "../../devices/deviceGateway";
import { connectedDevices } from "../../devices/connectedDevices";
import type { DeviceKind } from "../../devices/types";
import { AuthScaffold, AuthHeader, PrimaryButton } from "./onboardingUi";

const bracelet = deviceGateway.forKind("fitness-band");
const scale = deviceGateway.forKind("scale");

export function SetupCompleteScreen({ onComplete }: { onComplete: () => void }) {
  const braceletState = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const scaleState = useSyncExternalStore(scale.subscribe, scale.getSnapshot, scale.getSnapshot);
  const devices = connectedDevices([
    { kind: bracelet.kind, adapterId: bracelet.id, snapshot: braceletState },
    { kind: scale.kind, adapterId: scale.id, snapshot: scaleState }
  ]);
  return <SetupCompleteContent devices={devices} onComplete={onComplete} />;
}

export function SetupCompleteContent({
  devices,
  onComplete
}: {
  devices: Array<{ name: string; kind: DeviceKind }>;
  onComplete: () => void;
}) {
  const { styles, authColors } = useAuthStyles(createStyles);

  return (
    <AuthScaffold contentStyle={styles.content}>
      <AuthHeader />
      <View style={styles.main}>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.halo}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={44} color={authColors.onAccent} />
          </View>
        </View>

        <Text accessibilityRole="header" style={styles.title}>Всё готово</Text>
        <Text style={styles.subtitle}>Можно переходить в приложение.</Text>

        {(devices.length ? devices : [{ name: "Без устройств", kind: "fitness-band" as const }]).map((device, index) => <View key={`${device.kind}-${index}`} accessibilityLiveRegion="polite" style={styles.device}>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.deviceIcon}>
            <Ionicons name={device.kind === "scale" ? "scale-outline" : "watch-outline"} size={25} color={devices.length ? authColors.greenDark : authColors.muted} />
          </View>
          <View style={styles.deviceCopy}>
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text style={[styles.deviceStatus, devices.length > 0 && styles.connectedStatus]}>
              {devices.length ? "Подключено" : "Можно подключить позже"}
            </Text>
          </View>
          {devices.length ? <View accessible={false} style={styles.connectedDot} /> : null}
        </View>)}
      </View>

      <View style={styles.actions}>
        <PrimaryButton title="Открыть AxMed" onPress={onComplete} />
      </View>
    </AuthScaffold>
  );
}

const createStyles = (authColors: AuthColors) => StyleSheet.create({
  content: {},
  main: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 44 },
  halo: { width: 112, height: 112, borderRadius: 38, backgroundColor: authColors.soft, justifyContent: "center", alignItems: "center", marginBottom: 28 },
  successIcon: { width: 80, height: 80, borderRadius: 27, backgroundColor: authColors.green, justifyContent: "center", alignItems: "center" },
  title: { color: authColors.ink, fontSize: 40, lineHeight: 48, fontWeight: "500", letterSpacing: -1.8, textAlign: "center" },
  subtitle: { color: authColors.muted, fontSize: 14, lineHeight: 22, textAlign: "center", marginTop: 10 },
  device: { width: "100%", maxWidth: 334, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 80, backgroundColor: authColors.surface, borderRadius: 22, borderWidth: 1, borderColor: authColors.line, padding: 18, marginTop: 32 },
  deviceIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: authColors.surface, alignItems: "center", justifyContent: "center" },
  deviceCopy: { flex: 1, minWidth: 0 },
  deviceName: { color: authColors.ink, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  deviceStatus: { color: authColors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  connectedStatus: { color: authColors.greenDark },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: authColors.green },
  actions: { paddingTop: 16 }
});
