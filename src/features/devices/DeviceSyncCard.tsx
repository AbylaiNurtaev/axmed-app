import { Ionicons } from "@expo/vector-icons";
import { useMemo, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { deviceGateway } from "../../devices/deviceGateway";
import { deviceSync } from "../../devices/deviceSync";
import { readingSummary, syncErrorMessage } from "../../devices/readingSummary";
import { authColors } from "../auth/ui";
import { DeviceReadingsPanel } from "./DeviceReadingsPanel";
import { dateInZone } from "../../devices/readingSummary";

const bracelet = deviceGateway.forKind("fitness-band");
function timeLabel(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function DeviceSyncCard({ onConnect, expanded = false }: { onConnect: () => void; expanded?: boolean }) {
  const connection = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const sync = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getSnapshot);
  const connected = connection.phase === "connected";
  const selected = connection.devices.find(device => device.id === connection.selectedDeviceId);
  const batch = connected && sync.batch?.device.id !== selected?.id ? undefined : sync.batch;
  const today = batch ? dateInZone(new Date(), batch.timeZone) : "";
  const summary = useMemo(() => batch ? readingSummary(batch) : undefined, [batch, today]);
  const busy = sync.phase === "reading" || sync.phase === "saving";
  const unsaved = Boolean(sync.batch && !sync.saved);
  const stageLabels = { battery: "Читаем заряд", history: "Основная история", oxygen: "Кислород", hrv: "HRV",
    temperature: "Температура", manual: "Ручные измерения", activity: "Активность", complete: "Чтение завершено" };
  const status = sync.phase === "reading"
    ? `${stageLabels[sync.stage ?? "history"]} · ${sync.progress}%`
    : sync.phase === "saving" ? "Сохраняем в аккаунте…"
      : batch ? `Прочитано ${timeLabel(batch.readAt)}` : connected ? "Готов к синхронизации" : "Браслет не подключён";
  return <><View style={styles.card}>
    <View style={styles.heading}>
      <Ionicons name="watch-outline" size={25} color={authColors.greenDark} />
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>{selected?.name ?? batch?.device.name ?? "Браслет"}</Text>
        <Text style={styles.secondary}>{connected ? "Подключён" : batch ? "Сохранённые данные" : "Активность и сон"}</Text>
      </View>
      {batch?.battery && <Text style={styles.battery}>{batch.battery.value}{batch.battery.unit === "percent" ? "%" : " / 4"}</Text>}
    </View>
    {summary && <View style={styles.metrics}>
      <Metric label="Шаги сегодня" value={summary.steps?.toLocaleString("ru-RU") ?? "—"} />
      <Metric label="Пульс · уд/мин" value={summary.heartRate ? Math.round(summary.heartRate.value).toString() : "—"} />
      <Metric label="Последний сон" value={summary.sleepMinutes !== undefined ? `${Math.floor(summary.sleepMinutes / 60)} ч ${Math.round(summary.sleepMinutes % 60)} м` : "—"} />
    </View>}
    {summary?.heartRate && <Text style={styles.secondary}>Пульс{summary.heartRate.aggregation === "mean" ? " · среднее" : ""}: {timeLabel(summary.heartRate.recordedAt)}</Text>}
    {summary?.sleepDay && <Text style={styles.secondary}>Сон за {summary.sleepDay.split("-").reverse().join(".")}</Text>}
    <View style={styles.status}>
      {busy && <ActivityIndicator size="small" color={authColors.greenDark} />}
      <Text accessibilityLiveRegion="polite" style={styles.statusText}>{status}</Text>
    </View>
    {batch && !busy && <Text style={styles.secondary}>
      {sync.saved ? "Сохранено в аккаунте" : "Пока не сохранено в аккаунте"}
      {batch.samples.length === 0 ? " · Истории измерений пока нет" : ""}
    </Text>}
    {batch && batch.skippedRecords > 0 && <Text style={styles.secondary}>Часть записей SDK не удалось распознать.</Text>}
    {batch && (batch.syncVersion ?? 1) < 2 && <Text style={styles.secondary}>Это базовая синхронизация. Для остальных показателей обновите dev-сборку и синхронизируйте браслет.</Text>}
    {Boolean(batch?.warnings?.length) && <Text style={styles.secondary}>Часть каналов SDK недоступна. Подробности — в показателях браслета.</Text>}
    {sync.phase === "error" && <Text accessibilityRole="alert" style={styles.error}>{syncErrorMessage(sync.error)}</Text>}
    <View style={styles.buttons}>
      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={busy ? () => void deviceSync.cancel() : unsaved ? () => void deviceSync.retrySave() : connected ? () => void deviceSync.sync() : onConnect}>
        <Text style={styles.buttonText}>{busy ? "Отменить" : unsaved ? "Повторить сохранение" : connected ? "Синхронизировать" : "Подключить браслет"}</Text>
      </Pressable>
    </View>
    {!expanded && batch && <Pressable accessibilityRole="button" style={styles.details} onPress={onConnect}>
      <Text style={styles.detailsText}>Все показатели браслета</Text><Ionicons name="chevron-forward" size={17} color={authColors.greenDark} />
    </Pressable>}
  </View>{expanded && batch && <DeviceReadingsPanel batch={batch} />}</>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: "#F2FAF7", borderRadius: 20, padding: 18, gap: 8, marginBottom: 18 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  copy: { flex: 1 },
  title: { color: authColors.ink, fontSize: 18, fontWeight: "700" },
  secondary: { color: authColors.muted, fontSize: 12, lineHeight: 18 },
  battery: { color: authColors.greenDark, fontSize: 14, fontWeight: "600" },
  metrics: { flexDirection: "row", gap: 8, paddingVertical: 10 },
  metric: { flex: 1 },
  metricValue: { color: authColors.ink, fontSize: 19, lineHeight: 25, fontWeight: "700" },
  metricLabel: { color: authColors.text, fontSize: 11, lineHeight: 16, marginTop: 4 },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { flex: 1, color: authColors.text, fontSize: 12, lineHeight: 18 },
  error: { color: authColors.danger, fontSize: 13, lineHeight: 19 },
  buttons: { marginTop: 8 },
  details: { minHeight: 44, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  detailsText: { fontSize: 13, fontWeight: "600", color: authColors.greenDark },
  button: { minHeight: 46, borderRadius: 12, backgroundColor: authColors.greenDark, justifyContent: "center", alignItems: "center", padding: 10 },
  buttonText: { color: "white", fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.7 }
});
