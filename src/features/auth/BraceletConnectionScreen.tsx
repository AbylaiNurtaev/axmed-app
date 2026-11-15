import { deviceBindings } from "../../devices/deviceBindings";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import * as legacyUi from "./ui";
import * as onboardingUi from "./onboardingUi";
import { deviceGateway } from "../../devices/deviceGateway";
import { deviceErrorMessage } from "../../devices/errorMessages";
import { useAuthStyles, type AuthColors } from "./authTheme";

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
  const { AuthScaffold, BackButton, PageTitle, PrimaryButton, StepHeader } = onboarding ? onboardingUi : legacyUi;
  const { styles, authColors } = useAuthStyles(onboarding ? createOnboardingStyles : createStyles);
  const state = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const [hasSearched, setHasSearched] = useState(false);
  const busy = ["requestingPermission", "scanning", "connecting", "verifying"].includes(state.phase);
  const connected = state.phase === "connected";
  const selected = state.devices.find(device => device.id === state.selectedDeviceId);
  useEffect(() => () => { void bracelet.cancelPending(); }, []);
  const search = () => { setHasSearched(true); void deviceBindings.scan("fitness-band"); };

  return (
    <AuthScaffold>
      {onboarding ? <StepHeader current={4} onBack={onBack} /> : <BackButton onPress={onBack} />}
      <PageTitle
        title="Подключите браслет"
        subtitle="Для автоматического сбора данных о вашей активности."
      />

      <View style={styles.hero}>
        <BraceletIllustration monochrome={onboarding} />
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
            onPress={() => void deviceBindings.connect("fitness-band", device.id)}
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
          onPress={connected ? () => { void deviceBindings.disconnect("fitness-band"); } : onSkip}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
        >
          <Text style={styles.skipText}>{connected ? "Отключить браслет" : "Пропустить"}</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}

function BraceletIllustration({ monochrome = false }: { monochrome?: boolean }) {
  const { authColors } = useAuthStyles(createStyles);
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={monochrome ? 216 : 240} height={monochrome ? 234 : 260} viewBox="0 0 240 260">
        <Defs>
          <LinearGradient id="braceletStrap" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#606060" />
            <Stop offset="0.5" stopColor="#383838" />
            <Stop offset="1" stopColor="#202020" />
          </LinearGradient>
          <LinearGradient id="braceletFrame" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#787878" />
            <Stop offset="0.5" stopColor="#404040" />
            <Stop offset="1" stopColor="#282828" />
          </LinearGradient>
        </Defs>
        <Circle cx="120" cy="130" r="112" fill={authColors.surface} />
        <Circle cx="120" cy="130" r="88" fill={authColors.soft} />
        <Circle cx="120" cy="130" r="111.5" fill="none" stroke={authColors.line} />
        <G rotation={14} origin="120, 130">
          <Rect x="98" y="14" width="52" height="236" rx="25" fill="#E0E0E0" opacity="0.5" />
          <Rect x="94" y="8" width="52" height="236" rx="25" fill="url(#braceletStrap)" />
          <Path d="M103 27 V55 M103 199 V216" stroke="#808080" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
          <Rect x="116" y="208" width="8" height="4" rx="2" fill="#202020" />
          <Rect x="116" y="220" width="8" height="4" rx="2" fill="#202020" />
          <Rect x="84" y="63" width="72" height="133" rx="31" fill="url(#braceletFrame)" />
          <Rect x="89" y="68" width="62" height="123" rx="27" fill="#181818" />
          <Path d="M100 94 V86 C100 81 104 77 109 77" stroke="#C0C0C0" strokeWidth="2" opacity="0.3" strokeLinecap="round" fill="none" />
          <Path d="M120 121 C118 118 108 113 108 108 C108 102 115 101 120 106 C125 101 132 102 132 108 C132 113 122 118 120 121 Z" fill="#FFFFFF" />
          <Path d="M98 140 H108 L113 131 L119 150 L126 135 L131 140 H142" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Rect x="109" y="163" width="22" height="3" rx="1.5" fill="#FFFFFF" opacity="0.3" />
        </G>
      </Svg>
    </View>
  );
}

function createStyles(authColors: AuthColors) {
  return StyleSheet.create({
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
}
function createOnboardingStyles(authColors: AuthColors) {
const baseOnboardingStyles = createStyles(authColors);
return StyleSheet.create({
  ...baseOnboardingStyles,
  hero: { ...baseOnboardingStyles.hero, paddingBottom: 22 },
  deviceTitle: { ...baseOnboardingStyles.deviceTitle, fontSize: 17, marginTop: 10 },
  deviceList: { ...baseOnboardingStyles.deviceList, backgroundColor: authColors.surface, borderRadius: 22 },
  notice: { ...baseOnboardingStyles.notice, borderWidth: 1, borderColor: authColors.line, backgroundColor: authColors.surface, borderRadius: 18 }
});
}
