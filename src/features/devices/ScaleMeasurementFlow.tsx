import { deviceBindings } from "../../devices/deviceBindings";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { deviceGateway } from "../../devices/deviceGateway";
import { scaleSync } from "../../devices/scaleSync";
import { AxButton, AxPressable } from "../../ui/primitives";
import { useAxReducedMotion } from "../../ui/theme";
import { axColors, axMotion } from "../../ui/tokens";

const scale = deviceGateway.forKind("scale");
type IconName = React.ComponentProps<typeof Ionicons>["name"];

const stages: ReadonlyArray<{ title: string; detail: string; icon: IconName }> = [
  { title: "Поиск весов", detail: "Ищем AxMed Scale рядом", icon: "search-outline" },
  { title: "Подключение", detail: "Устанавливаем защищённое BLE-соединение", icon: "bluetooth-outline" },
  { title: "Встаньте на весы", detail: "Встаньте босиком и стойте ровно", icon: "footsteps-outline" },
  { title: "Получаем вес", detail: "Значение пока меняется", icon: "pulse-outline" },
  { title: "Фиксируем результат", detail: "Ждём устойчивого значения", icon: "radio-outline" },
  { title: "Вес получен", detail: "Проверяем итоговое значение", icon: "scale-outline" },
  { title: "Состав тела", detail: "Подготавливаем доступные показатели", icon: "body-outline" },
  { title: "Сохранение", detail: "Добавляем измерение в аккаунт", icon: "cloud-upload-outline" },
  { title: "Готово", detail: "Измерение сохранено", icon: "checkmark-circle-outline" }
];

const connectionMessages: Record<string, string> = {
  simulatorUnsupported: "Bluetooth весов недоступен в симуляторе. Интерфейс можно проверить, а измерение — только на реальном iPhone.",
  nativeBuildRequired: "Установите свежую dev-сборку AxMed.",
  iosOnly: "Подключение весов пока доступно только на iPhone.",
  bluetoothOff: "Включите Bluetooth и повторите поиск.",
  bluetoothUnavailable: "Bluetooth временно недоступен.",
  permissionDenied: "Разрешите AxMed доступ к Bluetooth в настройках iPhone.",
  deviceNotFound: "Весы не найдены. Разбудите их лёгким нажатием.",
  scaleCatalogMissing: "В сборке отсутствует каталог поддерживаемых весов.",
  unsupportedScaleProtocol: "Эта модель весов пока не поддерживается.",
  scaleConnectFailed: "Не удалось подключиться. Разбудите весы и попробуйте снова."
};

const syncMessages: Record<string, string> = {
  measurementTimeout: "Весы не передали устойчивое значение. Встаньте на них снова и повторите.",
  disconnected: "Соединение с весами потеряно.",
  syncInterrupted: "Измерение прервано. Оставьте AxMed открытым.",
  syncCancelled: "Измерение отменено.",
  scaleMeasureStartFailed: "Весы не начали измерение. Переподключите устройство.",
  NETWORK_ERROR: "Вес получен, но сервер недоступен. Его можно сохранить повторно.",
  TIMEOUT: "Сервер не ответил. Повторите сохранение.",
  authRequired: "Войдите в аккаунт, чтобы сохранить измерение."
};

function stepIndex(connectionPhase: ReturnType<typeof scale.getSnapshot>["phase"], phase: ReturnType<typeof scaleSync.getSnapshot>["phase"], stage?: ReturnType<typeof scaleSync.getSnapshot>["stage"], hasBatch = false) {
  if (phase === "complete") return 8;
  if (phase === "saving") return hasBatch ? 7 : 6;
  if (phase === "reading") {
    if (stage === "scaleResult" || stage === "scaleStable") return 5;
    if (stage === "scaleUnstable") return 3;
    return 2;
  }
  if (connectionPhase === "connecting" || connectionPhase === "verifying") return 1;
  if (connectionPhase === "connected") return 2;
  return 0;
}

export function ScaleMeasurementFlow({ visible, previousWeight, onClose, onComplete }: {
  visible: boolean;
  previousWeight?: number;
  onClose: () => void;
  onComplete: () => void;
}) {
  const connection = useSyncExternalStore(scale.subscribe, scale.getSnapshot, scale.getSnapshot);
  const sync = useSyncExternalStore(scaleSync.subscribe, scaleSync.getSnapshot, scaleSync.getSnapshot);
  const insets = useSafeAreaInsets();
  const reduceMotion = useAxReducedMotion();
  const [started, setStarted] = useState(false);
  const [observedActive, setObservedActive] = useState(false);
  const connected = connection.phase === "connected";
  const searching = connection.phase === "requestingPermission" || connection.phase === "scanning";
  const busy = sync.phase === "reading" || sync.phase === "saving";
  const unavailable = ["simulatorUnsupported", "iosOnly", "nativeBuildRequired"].includes(connection.errorCode ?? "");
  const flowPhase: typeof sync.phase = observedActive ? sync.phase : "idle";
  const current = stepIndex(connection.phase, flowPhase, observedActive ? sync.stage : undefined, observedActive && Boolean(sync.batch));
  const progress = Math.round((current / (stages.length - 1)) * 100);
  const latestWeight = useMemo(() => sync.batch?.samples
    .filter(sample => sample.metric === "weight")
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0]?.value, [sync.batch]);

  useEffect(() => {
    if (!visible) return;
    setStarted(false);
    setObservedActive(false);
    if (connection.phase === "connected") {
      setStarted(true);
      void scaleSync.sync();
    } else if (!["requestingPermission", "scanning", "connecting", "verifying"].includes(connection.phase) && !unavailable) {
      void deviceBindings.scan("scale");
    }
    // Opening the flow is the only trigger. Connection changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || started || !connected) return;
    setStarted(true);
    void scaleSync.sync();
  }, [connected, started, visible]);

  useEffect(() => {
    if (sync.phase === "reading" || sync.phase === "saving") setObservedActive(true);
    if (visible && observedActive && sync.phase === "complete") onComplete();
  }, [observedActive, onComplete, sync.phase, visible]);

  const cancel = () => {
    if (busy) void scaleSync.cancel();
    else if (searching || connection.phase === "connecting" || connection.phase === "verifying") void scale.cancelPending();
    onClose();
  };
  const retry = () => {
    if (sync.batch && !sync.saved) {
      setObservedActive(true);
      void scaleSync.retrySave();
    } else if (connected) {
      setStarted(true);
      setObservedActive(false);
      void scaleSync.sync();
    } else {
      setStarted(false);
      void deviceBindings.scan("scale");
    }
  };

  const error = unavailable
    ? connectionMessages[connection.errorCode ?? ""]
    : connection.phase === "error"
    ? connectionMessages[connection.errorCode ?? ""] ?? "Не удалось подключить весы."
    : observedActive && sync.phase === "error"
      ? syncMessages[sync.error ?? ""] ?? "Не удалось завершить измерение."
      : undefined;

  return <Modal visible={visible} animationType="none" onRequestClose={cancel}>
    <SafeAreaView accessibilityViewIsModal style={[styles.screen, { paddingTop: Math.max(insets.top, 52) }]} edges={["bottom"]}>
      <View style={styles.header}><View style={styles.headerCopy}><Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.title}>Измерение</Text><Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>AxMed Scale · пошаговый режим</Text></View><AxPressable accessibilityLabel="Отменить измерение" onPress={cancel} style={styles.close}><Ionicons name="close" size={22} color={axColors.ink} /></AxPressable></View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(axMotion.standard)} style={styles.liveCard}>
          <View style={styles.liveIcon}><Ionicons name={flowPhase === "complete" ? "checkmark" : "scale-outline"} size={28} color={axColors.green} /></View>
          <Text maxFontSizeMultiplier={1.3} style={styles.liveLabel}>{sync.liveValue !== undefined && observedActive ? "Вес меняется" : latestWeight !== undefined && flowPhase !== "idle" ? "Результат" : connected ? "Весы готовы" : searching ? "Ищем устройство" : "Подготовка"}</Text>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={styles.liveValue}>{sync.liveValue !== undefined ? sync.liveValue.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : latestWeight !== undefined && observedActive ? latestWeight.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : "—"}<Text maxFontSizeMultiplier={1.3} style={styles.liveUnit}> кг</Text></Text>
          {previousWeight !== undefined && latestWeight !== undefined && observedActive ? <Text maxFontSizeMultiplier={1.3} style={styles.liveDelta}>Изменение: {latestWeight - previousWeight > 0 ? "+" : ""}{(latestWeight - previousWeight).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг</Text> : null}
          <View style={styles.progressTrack}><Animated.View style={[styles.progressFill, { width: `${Math.max(4, progress)}%` }]} /></View>
          <Text maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite" style={styles.progressText}>{progress}% · {stages[current]?.title}</Text>
        </Animated.View>

        {error ? <View style={styles.error}><View style={styles.errorIcon}><Ionicons name="alert-circle-outline" size={21} color={axColors.danger} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} accessibilityRole="alert" style={styles.errorTitle}>Измерение остановлено</Text><Text maxFontSizeMultiplier={1.3} style={styles.errorText}>{error}</Text></View></View> : null}

        {!connected && connection.devices.length > 0 ? <View style={styles.devices}>
          <Text maxFontSizeMultiplier={1.3} style={styles.devicesTitle}>Найдены рядом</Text>
          {connection.devices.map(device => <AxPressable key={device.id} accessibilityLabel={`Подключить ${device.name}`} onPress={() => void deviceBindings.connect("scale", device.id)} style={styles.deviceRow}><View style={styles.deviceIcon}><Ionicons name="bluetooth" size={19} color={axColors.green} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.deviceName}>{device.name || "AxMed Scale"}</Text><Text maxFontSizeMultiplier={1.3} style={styles.deviceMeta}>Сигнал {device.rssi} dBm</Text></View><Text maxFontSizeMultiplier={1.3} style={styles.deviceAction}>Подключить</Text></AxPressable>)}
        </View> : null}

        <View style={styles.timeline}>{stages.map((item, index) => {
          const complete = index < current || flowPhase === "complete";
          const active = index === current && flowPhase !== "complete";
          return <Animated.View key={item.title} entering={reduceMotion ? undefined : FadeIn.duration(axMotion.standard).delay(index * 35)} style={styles.stageRow}>
            <View style={styles.stageRail}>{index > 0 ? <View style={[styles.railTop, index <= current && styles.railDone]} /> : null}<View style={[styles.stageIcon, complete && styles.stageIconDone, active && styles.stageIconActive]}><Ionicons name={complete ? "checkmark" : item.icon} size={17} color={complete || active ? axColors.onAccent : axColors.muted} /></View>{index < stages.length - 1 ? <View style={[styles.railBottom, index < current && styles.railDone]} /> : null}</View>
            <View style={styles.stageCopy}><Text maxFontSizeMultiplier={1.3} style={[styles.stageTitle, (complete || active) && styles.stageTitleActive]}>{item.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.stageDetail}>{active && sync.liveValue !== undefined ? `${sync.liveValue.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг · дождитесь фиксации` : item.detail}</Text></View>
            {active && !error ? <View style={styles.activeDot} /> : null}
          </Animated.View>;
        })}</View>

        {!error && current === 2 ? <View style={styles.hint}><Ionicons name="information-circle-outline" size={19} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.hintText}>Поставьте весы на твёрдый ровный пол. Встаньте босиком и не двигайтесь до фиксации значения.</Text></View> : null}
      </ScrollView>
      <View style={styles.footer}>{error ? <AxButton label={sync.batch && !sync.saved ? "Повторить сохранение" : unavailable ? "Закрыть" : "Попробовать снова"} icon={unavailable ? "close" : "refresh"} onPress={unavailable ? onClose : retry} /> : <AxButton label={busy ? "Отменить безопасно" : searching ? "Отменить поиск" : "Отменить"} icon="close" variant={busy ? "outline" : "ghost"} onPress={cancel} />}</View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: axColors.background },
  header: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1 },
  title: { color: axColors.ink, fontSize: 28, lineHeight: 34, fontWeight: "500", letterSpacing: -0.6 },
  subtitle: { color: axColors.muted, fontSize: 11, marginTop: 2 },
  close: { width: 44, height: 44, borderRadius: 15, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 18, paddingBottom: 24 },
  liveCard: { minHeight: 210, borderRadius: 26, padding: 20, backgroundColor: "#111111", alignItems: "center", marginBottom: 16 },
  liveIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#303030", alignItems: "center", justifyContent: "center" },
  liveLabel: { color: "#C0C0C0", fontSize: 11, marginTop: 12 },
  liveValue: { color: axColors.white, fontSize: 46, lineHeight: 54, fontWeight: "500", letterSpacing: -1 },
  liveUnit: { color: "#B0B0B0", fontSize: 16, fontWeight: "600" },
  liveDelta: { color: "#C0C0C0", fontSize: 10, marginTop: 2 },
  progressTrack: { width: "100%", height: 5, borderRadius: 3, backgroundColor: "#404040", overflow: "hidden", marginTop: 18 },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: "#FFFFFF" },
  progressText: { color: "#C0C0C0", fontSize: 9, marginTop: 7 },
  devices: { borderRadius: 20, padding: 14, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, marginBottom: 14 },
  devicesTitle: { color: axColors.ink, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  deviceRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10 },
  deviceIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: axColors.greenSoft, alignItems: "center", justifyContent: "center" },
  deviceName: { color: axColors.ink, fontSize: 13, fontWeight: "800" },
  deviceMeta: { color: axColors.muted, fontSize: 9, marginTop: 2 },
  deviceAction: { color: axColors.green, fontSize: 10, fontWeight: "800" },
  timeline: { borderRadius: 22, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line },
  stageRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 11 },
  stageRail: { width: 34, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  stageIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#F0F0F0", alignItems: "center", justifyContent: "center", zIndex: 2 },
  stageIconDone: { backgroundColor: axColors.green },
  stageIconActive: { backgroundColor: axColors.blue },
  railTop: { position: "absolute", top: 0, bottom: "50%", width: 2, backgroundColor: axColors.line },
  railBottom: { position: "absolute", top: "50%", bottom: 0, width: 2, backgroundColor: axColors.line },
  railDone: { backgroundColor: axColors.green },
  stageCopy: { flex: 1, minWidth: 0 },
  stageTitle: { color: axColors.muted, fontSize: 12, fontWeight: "700" },
  stageTitleActive: { color: axColors.ink, fontWeight: "800" },
  stageDetail: { color: axColors.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: axColors.blue },
  hint: { borderRadius: 17, padding: 13, backgroundColor: axColors.greenSoft, flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 14 },
  hintText: { flex: 1, color: axColors.text, fontSize: 10, lineHeight: 15 },
  error: { borderRadius: 17, padding: 13, backgroundColor: axColors.dangerSoft, flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 14, marginBottom: 14 },
  errorIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: axColors.surface, alignItems: "center", justifyContent: "center" },
  errorTitle: { color: axColors.danger, fontSize: 11, fontWeight: "800" },
  errorText: { color: axColors.text, fontSize: 9, lineHeight: 14, marginTop: 2 },
  footer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6, backgroundColor: axColors.background },
  flex: { flex: 1, minWidth: 0 }
});
