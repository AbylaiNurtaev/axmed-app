import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { AuthScaffold, BackButton, PageTitle, PrimaryButton, StepHeader, authColors } from "./ui";
import { deviceGateway } from "../../devices/deviceGateway";
import { deviceErrorMessage } from "../../devices/errorMessages";

const bracelet = deviceGateway.forKind("fitness-band");
const pendingLabels: Partial<Record<string, string>> = {
  requestingPermission: "Разрешите доступ к Bluetooth…",
  scanning: "Ищем браслет рядом…",
  connecting: "Подключаемся…",
  verifying: "Проверяем соединение…"
};

export function BraceletConnectionScreen({
  onBack,
  onSkip,
  onContinue,
  onboarding = true
}: {
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onboarding?: boolean;
}) {
  const state = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const [hasSearched, setHasSearched] = useState(false);
  const busy = ["requestingPermission", "scanning", "connecting", "verifying"].includes(state.phase);
  const connected = state.phase === "connected";
  const selected = state.devices.find(device => device.id === state.selectedDeviceId);
  useEffect(() => () => { void bracelet.cancelPending(); }, []);
  const search = () => { setHasSearched(true); void bracelet.startScan(); };

  return (
    <AuthScaffold>
      {onboarding ? <StepHeader current={4} onBack={onBack} /> : <BackButton onPress={onBack} />}
      <PageTitle
        title="Подключите браслет"
        subtitle="Для автоматического сбора данных о вашей активности."
      />

      <View style={styles.hero}>
        <BraceletIllustration />
        <Text style={styles.deviceTitle}>{connected ? selected?.name : "Фитнес-браслет"}</Text>
        <View style={styles.connectionType}>
          <Ionicons name="bluetooth" size={16} color={authColors.greenDark} />
          <Text accessibilityLiveRegion="polite" style={styles.connectionTypeText}>
            {connected ? "Браслет подключён" : "Подключение по Bluetooth"}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {!connected && <Text style={styles.hint}>Включите Bluetooth и держите браслет рядом с телефоном.</Text>}
        {busy && <View style={styles.searchStatus}>
          <ActivityIndicator color={authColors.greenDark} />
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>{pendingLabels[state.phase]}</Text>
        </View>}
        {!connected && state.devices.length > 0 && <View style={styles.deviceList}>
          {state.devices.map(device => <Pressable
            key={device.id}
            accessibilityRole="button"
            accessibilityLabel={`Подключить ${device.name}`}
            disabled={state.phase === "connecting" || state.phase === "verifying"}
            onPress={() => void bracelet.connect(device.id)}
            style={({ pressed }) => [styles.deviceRow, pressed && styles.pressed]}
          >
            <Ionicons name="watch-outline" size={23} color={authColors.greenDark} />
            <View style={styles.deviceCopy}>
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceDetail}>{device.id.slice(-6)} · {device.rssi} dBm</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={authColors.muted} />
          </Pressable>)}
        </View>}
        {hasSearched && state.phase === "idle" && state.devices.length === 0 &&
          <Text style={styles.hint}>Браслет не найден. Отключите его в G Band и повторите поиск.</Text>}

        {state.phase === "error" && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={21} color={authColors.greenDark} />
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.noticeText}>
              {deviceErrorMessage(state.errorCode)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть уведомление"
              onPress={() => { setHasSearched(false); void bracelet.cancelPending(); }}
              style={({ pressed }) => [styles.closeNotice, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={authColors.muted} />
            </Pressable>
          </View>
        )}

        {state.errorCode === "permissionDenied" && <Pressable
          accessibilityRole="button"
          onPress={() => { void Linking.openSettings().catch(() => undefined); }}
          style={styles.skipButton}
        ><Text style={styles.skipText}>Открыть настройки</Text></Pressable>}
        <PrimaryButton
          title={connected ? "Продолжить" : busy ? "Отменить" : hasSearched ? "Повторить поиск" : "Найти браслет"}
          icon={connected ? "checkmark" : busy ? undefined : "bluetooth"}
          onPress={connected ? onContinue : busy ? () => { setHasSearched(false); void bracelet.cancelPending(); } : search}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityHint={connected ? "Разорвать соединение с браслетом" : "Продолжить без подключения браслета"}
          onPress={connected ? () => { void bracelet.disconnect(); } : onSkip}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
        >
          <Text style={styles.skipText}>{connected ? "Отключить браслет" : "Пропустить"}</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}

function BraceletIllustration() {
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={240} height={260} viewBox="0 0 240 260">
        <Defs>
          <LinearGradient id="braceletStrap" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#526365" />
            <Stop offset="0.5" stopColor="#29383D" />
            <Stop offset="1" stopColor="#15252B" />
          </LinearGradient>
          <LinearGradient id="braceletFrame" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#6C7F80" />
            <Stop offset="0.5" stopColor="#35474B" />
            <Stop offset="1" stopColor="#172A2E" />
          </LinearGradient>
        </Defs>
        <Circle cx="120" cy="130" r="112" fill="#F7FBF9" />
        <Circle cx="120" cy="130" r="88" fill="#EAF7F1" />
        <Circle cx="120" cy="130" r="111.5" fill="none" stroke="#E9F3EE" />
        <G rotation={14} origin="120, 130">
          <Rect x="98" y="14" width="52" height="236" rx="25" fill="#D7E8E0" opacity="0.5" />
          <Rect x="94" y="8" width="52" height="236" rx="25" fill="url(#braceletStrap)" />
          <Path d="M103 27 V55 M103 199 V216" stroke="#718280" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
          <Rect x="116" y="208" width="8" height="4" rx="2" fill="#112229" />
          <Rect x="116" y="220" width="8" height="4" rx="2" fill="#112229" />
          <Rect x="84" y="63" width="72" height="133" rx="31" fill="url(#braceletFrame)" />
          <Rect x="89" y="68" width="62" height="123" rx="27" fill="#0C1C22" />
          <Path d="M100 94 V86 C100 81 104 77 109 77" stroke="#B5C7C4" strokeWidth="2" opacity="0.3" strokeLinecap="round" fill="none" />
          <Path d="M120 121 C118 118 108 113 108 108 C108 102 115 101 120 106 C125 101 132 102 132 108 C132 113 122 118 120 121 Z" fill="#3ED8AA" />
          <Path d="M98 140 H108 L113 131 L119 150 L126 135 L131 140 H142" stroke="#3ED8AA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Rect x="109" y="163" width="22" height="3" rx="1.5" fill="#3ED8AA" opacity="0.3" />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingBottom: 32 },
  deviceTitle: { color: authColors.ink, fontSize: 19, lineHeight: 26, fontWeight: "600", marginTop: 14 },
  connectionType: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
  connectionTypeText: { color: authColors.muted, fontSize: 13, lineHeight: 20, flexShrink: 1 },
  actions: { gap: 8 },
  searchStatus: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, paddingVertical: 12 },
  statusText: { flexShrink: 1, color: authColors.text, fontSize: 14, lineHeight: 21 },
  deviceList: { borderWidth: 1, borderColor: authColors.line, borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  deviceRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  deviceCopy: { flex: 1 },
  deviceName: { color: authColors.ink, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  deviceDetail: { color: authColors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  hint: { color: authColors.text, fontSize: 14, lineHeight: 21, textAlign: "center", alignSelf: "center", maxWidth: 290, marginBottom: 12 },
  notice: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: authColors.soft, borderRadius: 14, paddingLeft: 12, paddingVertical: 8, marginBottom: 6 },
  noticeText: { flex: 1, color: authColors.text, fontSize: 13, lineHeight: 19 },
  closeNotice: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  skipButton: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  skipText: { color: authColors.muted, fontSize: 15, lineHeight: 22, fontWeight: "500" },
  pressed: { opacity: 0.6 }
});
