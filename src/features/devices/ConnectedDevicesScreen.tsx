import { deviceBindings } from "../../devices/deviceBindings";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, useSyncExternalStore } from "react";
import type { ComponentProps } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { deviceGateway } from "../../devices/deviceGateway";
import { deviceSync } from "../../devices/deviceSync";
import { deviceErrorMessage } from "../../devices/errorMessages";
import { scaleSync } from "../../devices/scaleSync";
import type { ConnectionSnapshot } from "../../devices/types";
import type { SyncSnapshot } from "../../devices/SyncCoordinator";
import { AxConfirmSheet, AxSnackbar } from "../../ui/feedback";
import { AxButton, AxCard, AxIconButton } from "../../ui/primitives";
import { axRadius, axSpace, axType } from "../../ui/tokens";
import { useAxTheme } from "../../ui/theme";
import { BraceletConnectionScreen } from "../auth/BraceletConnectionScreen";
import { ScaleMeasurementFlow } from "./ScaleMeasurementFlow";

type IconName = ComponentProps<typeof Ionicons>["name"];
const bracelet = deviceGateway.forKind("fitness-band");
const scale = deviceGateway.forKind("scale");

export function ConnectedDevicesScreen({ onBack, startPairing = false }: { onBack: () => void; startPairing?: boolean }) {
  const { colors } = useAxTheme();
  const [pairing, setPairing] = useState(startPairing);
  const [measuring, setMeasuring] = useState(false);
  const [disconnect, setDisconnect] = useState<"bracelet" | "scale">();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" }>();
  const braceletConnection = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const scaleConnection = useSyncExternalStore(scale.subscribe, scale.getSnapshot, scale.getSnapshot);
  const braceletData = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getSnapshot);
  const scaleData = useSyncExternalStore(scaleSync.subscribe, scaleSync.getSnapshot, scaleSync.getSnapshot);
  const connected = Number(braceletConnection.phase === "connected") + Number(scaleConnection.phase === "connected");

  if (pairing) return <BraceletConnectionScreen onboarding={false} onBack={() => setPairing(false)} onSkip={() => setPairing(false)} onContinue={() => setPairing(false)} />;

  const disconnectDevice = async () => {
    if (!disconnect || busy) return;
    setBusy(true);
    try {
      if (disconnect === "bracelet") { await deviceSync.cancel(); await deviceBindings.disconnect("fitness-band"); }
      else { await scaleSync.cancel(); await deviceBindings.disconnect("scale"); }
      setNotice({ message: "Устройство отключено", tone: "success" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDisconnect(undefined);
    } catch (error) { setNotice({ message: error instanceof Error ? error.message : "Не удалось отключить устройство", tone: "error" }); }
    finally { setBusy(false); }
  };

  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><AxIconButton icon="arrow-back" label="Назад" tone="neutral" onPress={onBack} /><View style={styles.flex}><Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Устройства</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Подключение, диагностика и синхронизация</Text></View></View>
      <View style={[styles.summary, { backgroundColor: "#111111" }]}><View><Text style={[styles.summaryLabel, { color: colors.muted }]}>Сейчас подключено</Text><Text style={[styles.summaryValue, { color: colors.white }]}>{connected} из 2</Text></View><View style={[styles.bluetoothBadge, { backgroundColor: connected ? colors.greenSoft : colors.surfaceMuted }]}><Ionicons name="bluetooth" size={18} color={connected ? colors.green : colors.muted} /><Text style={[styles.bluetoothText, { color: connected ? colors.green : colors.muted }]}>{connected ? "Активно" : "Ожидание"}</Text></View></View>
      <Text style={[styles.section, { color: colors.ink }]}>Ваши устройства</Text>
      <DeviceCard
        icon="watch-outline" title={selectedName(braceletConnection, braceletData.batch?.device.name, "Фитнес-браслет AxMed")}
        connection={braceletConnection} sync={braceletData} battery={batteryLabel(braceletData)} lastValue={braceletData.batch ? `${braceletData.batch.samples.filter(item => item.metric === "steps" && item.localDate === today()).reduce((sum, item) => sum + item.value, 0).toLocaleString("ru-RU")} шагов` : "Нет данных"}
        error={braceletConnection.errorCode ? deviceErrorMessage(braceletConnection.errorCode) : syncError(braceletData)}
        primaryLabel={braceletData.phase === "reading" || braceletData.phase === "saving" ? "Отменить" : braceletData.batch && !braceletData.saved ? "Повторить сохранение" : braceletConnection.phase === "connected" ? "Синхронизировать" : "Подключить"}
        primaryAction={() => braceletData.phase === "reading" || braceletData.phase === "saving" ? void deviceSync.cancel() : braceletData.batch && !braceletData.saved ? void deviceSync.retrySave() : braceletConnection.phase === "connected" ? void deviceSync.sync() : setPairing(true)}
        onDisconnect={braceletConnection.phase === "connected" ? () => setDisconnect("bracelet") : undefined}
      />
      <DeviceCard
        icon="scale-outline" title={selectedName(scaleConnection, scaleData.batch?.device.name, "Умные весы AxMed")}
        connection={scaleConnection} sync={scaleData} battery={batteryLabel(scaleData)} lastValue={latestWeight(scaleData)}
        error={scaleConnection.errorCode ? scaleError(scaleConnection.errorCode) : syncError(scaleData)}
        primaryLabel={scaleData.phase === "reading" || scaleData.phase === "saving" ? "Измерение идёт" : "Измерить"}
        primaryAction={() => setMeasuring(true)}
        onDisconnect={scaleConnection.phase === "connected" ? () => setDisconnect("scale") : undefined}
      />
      <AxCard tone="soft" style={styles.diagnostic}><View style={[styles.diagnosticIcon, { backgroundColor: colors.blueSoft }]}><Ionicons name="pulse-outline" size={21} color={colors.blue} /></View><View style={styles.flex}><Text style={[styles.cardTitle, { color: colors.ink }]}>Диагностика</Text><Text style={[styles.cardSubtitle, { color: colors.muted }]}>Статусы приходят напрямую из Bluetooth-модулей. При выключенном Bluetooth или потере соединения здесь появится конкретное действие.</Text></View></AxCard>
    </ScrollView>
    <ScaleMeasurementFlow visible={measuring} previousWeight={previousWeight(scaleData)} onClose={() => setMeasuring(false)} onComplete={() => { setMeasuring(false); setNotice({ message: "Измерение сохранено", tone: "success" }); }} />
    <AxConfirmSheet visible={Boolean(disconnect)} title={`Отключить ${disconnect === "scale" ? "весы" : "браслет"}?`} message="Текущая операция будет отменена. Уже сохранённые измерения останутся в аккаунте." confirmLabel="Отключить" danger loading={busy} onClose={() => setDisconnect(undefined)} onConfirm={() => void disconnectDevice()} />
    <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} onDismiss={() => setNotice(undefined)} />
  </View>;
}

function DeviceCard({ icon, title, connection, sync, battery, lastValue, error, primaryLabel, primaryAction, onDisconnect }: { icon: IconName; title: string; connection: ConnectionSnapshot; sync: SyncSnapshot; battery: string; lastValue: string; error?: string; primaryLabel: string; primaryAction: () => void; onDisconnect?: () => void }) {
  const { colors } = useAxTheme();
  const connected = connection.phase === "connected";
  const busy = ["requestingPermission", "scanning", "connecting", "verifying"].includes(connection.phase) || sync.phase === "reading" || sync.phase === "saving";
  return <AxCard style={styles.deviceCard}>
    <View style={styles.deviceTop}><View style={[styles.deviceIcon, { backgroundColor: connected ? colors.greenSoft : colors.surfaceMuted }]}><Ionicons name={icon} size={25} color={connected ? colors.green : colors.muted} /></View><View style={styles.flex}><Text style={[styles.cardTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text><View style={styles.statusLine}><View style={[styles.statusDot, { backgroundColor: connected ? colors.green : error ? colors.danger : colors.amber }]} /><Text style={[styles.statusText, { color: connected ? colors.green : error ? colors.danger : colors.muted }]}>{connected ? "Подключено" : busy ? phaseLabel(connection.phase) : error ? "Требует внимания" : sync.batch ? "Данные сохранены" : "Не подключено"}</Text></View></View>{busy ? <ActivityIndicator color={colors.green} /> : null}</View>
    <View style={styles.facts}><DeviceFact label="Заряд" value={battery} /><DeviceFact label="Последние данные" value={lastValue} /><DeviceFact label="Синхронизация" value={sync.batch?.readAt ? shortDate(sync.batch.readAt) : "—"} /></View>
    {sync.phase === "reading" || sync.phase === "saving" ? <View style={[styles.progress, { backgroundColor: colors.surfaceMuted }]}><View style={[styles.progressFill, { backgroundColor: colors.green, width: `${Math.max(5, sync.progress)}%` }]} /></View> : null}
    {error ? <View style={[styles.error, { backgroundColor: colors.dangerSoft }]}><Ionicons name="alert-circle-outline" size={19} color={colors.danger} /><Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text></View> : null}
    <View style={styles.actions}><AxButton label={primaryLabel} icon={connected ? "sync-outline" : "bluetooth-outline"} loading={busy && connection.phase !== "connected"} onPress={primaryAction} /><AxButton label={onDisconnect ? "Отключить" : "Нет активного подключения"} variant="ghost" disabled={!onDisconnect} onPress={onDisconnect ?? (() => undefined)} /></View>
  </AxCard>;
}

function DeviceFact({ label, value }: { label: string; value: string }) { const { colors } = useAxTheme(); return <View style={[styles.fact, { backgroundColor: colors.surfaceMuted }]}><Text style={[styles.factValue, { color: colors.ink }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text></View>; }
function selectedName(connection: ConnectionSnapshot, saved: string | undefined, fallback: string) { return connection.devices.find(item => item.id === connection.selectedDeviceId)?.name || saved || fallback; }
function batteryLabel(sync: SyncSnapshot) { const battery = sync.batch?.battery; return battery ? `${battery.value}${battery.unit === "percent" ? "%" : "/4"}` : "—"; }
function latestWeight(sync: SyncSnapshot) { const item = sync.batch?.samples.filter(value => value.metric === "weight").sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]; return item ? `${item.value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг` : "Нет измерений"; }
function previousWeight(sync: SyncSnapshot) { return sync.batch?.samples.filter(value => value.metric === "weight").sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[1]?.value; }
function shortDate(value: string) { return new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function today() { return new Date().toLocaleDateString("sv-SE"); }
function phaseLabel(phase: ConnectionSnapshot["phase"]) { return phase === "scanning" ? "Поиск…" : phase === "connecting" ? "Подключение…" : phase === "verifying" ? "Проверка…" : phase === "requestingPermission" ? "Разрешение…" : "Ожидание"; }
function syncError(sync: SyncSnapshot) { return sync.phase === "error" ? sync.error === "NETWORK_ERROR" ? "Данные получены, но сервер недоступен. Повторите сохранение." : "Операция не завершена. Повторите действие." : undefined; }
function scaleError(code: string) { const messages: Record<string, string> = { bluetoothOff: "Включите Bluetooth и повторите поиск.", permissionDenied: "Разрешите Bluetooth в настройках iPhone.", simulatorUnsupported: "Bluetooth недоступен в симуляторе.", nativeBuildRequired: "Установите свежую dev-сборку AxMed.", deviceNotFound: "Весы не найдены. Разбудите их и повторите." }; return messages[code] ?? "Не удалось подключить весы."; }

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: axSpace.x4, paddingTop: axSpace.x3, paddingBottom: axSpace.x8 }, flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginBottom: axSpace.x5 }, title: { ...axType.title }, subtitle: { ...axType.body, marginTop: 2 },
  summary: { minHeight: 116, borderRadius: axRadius.xl, padding: axSpace.x5, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, summaryLabel: { ...axType.caption }, summaryValue: { fontSize: 30, lineHeight: 36, fontWeight: "800", marginTop: 3 }, bluetoothBadge: { minHeight: 38, borderRadius: 14, paddingHorizontal: axSpace.x3, flexDirection: "row", alignItems: "center", gap: 6 }, bluetoothText: { ...axType.caption, fontWeight: "800" },
  section: { ...axType.section, marginTop: axSpace.x6, marginBottom: axSpace.x3 }, deviceCard: { marginBottom: axSpace.x3 }, deviceTop: { flexDirection: "row", alignItems: "center", gap: axSpace.x3 }, deviceIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" }, cardTitle: { ...axType.cardTitle }, cardSubtitle: { ...axType.caption, marginTop: 3 }, statusLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }, statusDot: { width: 7, height: 7, borderRadius: 4 }, statusText: { ...axType.caption, fontWeight: "700" },
  facts: { flexDirection: "row", gap: axSpace.x2, marginTop: axSpace.x4 }, fact: { flex: 1, minWidth: 0, minHeight: 61, borderRadius: axRadius.md, padding: axSpace.x2, justifyContent: "center" }, factValue: { fontSize: 12, fontWeight: "800" }, factLabel: { fontSize: 8, lineHeight: 11, marginTop: 3 }, progress: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: axSpace.x3 }, progressFill: { height: 6, borderRadius: 3 }, error: { borderRadius: axRadius.md, padding: axSpace.x3, flexDirection: "row", alignItems: "flex-start", gap: axSpace.x2, marginTop: axSpace.x3 }, errorText: { ...axType.caption, flex: 1 }, actions: { gap: axSpace.x1, marginTop: axSpace.x4 },
  diagnostic: { flexDirection: "row", gap: axSpace.x3, alignItems: "flex-start", marginTop: axSpace.x2 }, diagnosticIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }
});
