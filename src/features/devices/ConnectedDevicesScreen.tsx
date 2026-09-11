import { useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { deviceGateway } from "../../devices/deviceGateway";
import { BraceletConnectionScreen } from "../auth/BraceletConnectionScreen";
import { AuthScaffold, BackButton, PageTitle, authColors } from "../auth/ui";
import { DeviceSyncCard } from "./DeviceSyncCard";

const bracelet = deviceGateway.forKind("fitness-band");
export function ConnectedDevicesScreen({ onBack, startPairing = false }: { onBack: () => void; startPairing?: boolean }) {
  const [pairing, setPairing] = useState(startPairing);
  const connection = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  if (pairing) return <BraceletConnectionScreen onboarding={false} onBack={() => setPairing(false)} onSkip={() => setPairing(false)} onContinue={() => setPairing(false)} />;
  return <AuthScaffold>
    <BackButton onPress={onBack} />
    <PageTitle title="Мои устройства" subtitle="Данные вашего браслета в AxMed." />
    <DeviceSyncCard expanded onConnect={() => setPairing(true)} />
    {connection.phase === "connected" && <Pressable accessibilityRole="button" style={styles.disconnect} onPress={() => void bracelet.disconnect()}>
      <Text style={styles.disconnectText}>Отключить браслет</Text>
    </Pressable>}
  </AuthScaffold>;
}
const styles = StyleSheet.create({
  disconnect: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  disconnectText: { fontSize: 14, color: authColors.muted }
});
