import { Ionicons } from "@expo/vector-icons";
import { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { deviceGateway } from "../../devices/deviceGateway";
import { AuthScaffold, PrimaryButton, authColors } from "./ui";

const bracelet = deviceGateway.forKind("fitness-band");

export function SetupCompleteScreen({ onComplete }: { onComplete: () => void }) {
  const connection = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const connectedDevice = connection.phase === "connected"
    ? connection.devices.find(device => device.id === connection.selectedDeviceId)
    : undefined;

  return <SetupCompleteContent connectedDeviceName={connectedDevice?.name} onComplete={onComplete} />;
}

export function SetupCompleteContent({
  connectedDeviceName,
  onComplete
}: {
  connectedDeviceName?: string;
  onComplete: () => void;
}) {
  const connected = connectedDeviceName !== undefined;

  return (
    <AuthScaffold contentStyle={styles.content}>
      <View style={styles.main}>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.halo}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={44} color={authColors.white} />
          </View>
        </View>

        <Text accessibilityRole="header" style={styles.title}>Всё готово</Text>
        <Text style={styles.subtitle}>Можно переходить в приложение.</Text>

        <View accessibilityLiveRegion="polite" style={[styles.device, !connected && styles.deviceNeutral]}>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.deviceIcon}>
            <Ionicons name="watch-outline" size={25} color={connected ? authColors.greenDark : authColors.muted} />
          </View>
          <View style={styles.deviceCopy}>
            <Text style={styles.deviceName}>{connected ? connectedDeviceName || "Браслет" : "Без браслета"}</Text>
            <Text style={[styles.deviceStatus, connected && styles.connectedStatus]}>
              {connected ? "Подключён" : "Можно подключить позже"}
            </Text>
          </View>
          {connected ? <View accessible={false} style={styles.connectedDot} /> : null}
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton title="Открыть AxMed" onPress={onComplete} />
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 24 },
  main: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 44 },
  halo: { width: 112, height: 112, borderRadius: 56, backgroundColor: "#EAF8F3", justifyContent: "center", alignItems: "center", marginBottom: 28 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: authColors.green, justifyContent: "center", alignItems: "center" },
  title: { color: authColors.ink, fontSize: 32, lineHeight: 40, fontWeight: "700", textAlign: "center" },
  subtitle: { color: authColors.muted, fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 10 },
  device: { width: "100%", maxWidth: 300, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 80, backgroundColor: "#F1FAF7", borderRadius: 20, padding: 16, marginTop: 32 },
  deviceNeutral: { backgroundColor: "#F6F8F8" },
  deviceIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: authColors.white, alignItems: "center", justifyContent: "center" },
  deviceCopy: { flex: 1, minWidth: 0 },
  deviceName: { color: authColors.ink, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  deviceStatus: { color: authColors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  connectedStatus: { color: authColors.greenDark },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: authColors.green },
  actions: { paddingTop: 16 }
});
