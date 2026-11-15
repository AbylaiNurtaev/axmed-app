import { deviceBindings } from "../../devices/deviceBindings";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { deviceGateway } from "../../devices/deviceGateway";
import { scaleSync } from "../../devices/scaleSync";
import { authColors } from "../auth/ui";

const scale = deviceGateway.forKind("scale");
const connectionErrors: Record<string, string> = {
  nativeBuildRequired: "Для весов нужна свежая dev-сборка AxMed на iPhone.",
  iosOnly: "Подключение этих весов пока доступно только на iPhone.",
  simulatorUnsupported: "Симулятор не поддерживает Bluetooth. Откройте dev-сборку на iPhone.",
  bluetoothOff: "Включите Bluetooth и повторите поиск.",
  bluetoothUnavailable: "Bluetooth на этом устройстве недоступен.",
  permissionDenied: "Разрешите AxMed доступ к Bluetooth в настройках iPhone.",
  deviceNotFound: "Весы больше не видны. Разбудите их и повторите поиск.",
  nativeUnavailable: "Bluetooth-модуль недоступен. Перезапустите dev-сборку.",
  scaleCatalogMissing: "В сборке отсутствует каталог поддерживаемых весов. Обновите приложение.",
  unsupportedScaleProtocol: "Эта модель весов пока не поддерживается.",
  scaleConnectFailed: "Не удалось подключиться к весам. Разбудите их и повторите попытку."
};
const syncErrors: Record<string, string> = {
  measurementTimeout: "Измерение не получено. Нажмите ещё раз и встаньте на весы босиком.",
  disconnected: "Сначала выберите найденные весы.",
  syncInterrupted: "Измерение прервано. Оставьте AxMed открытым.",
  authRequired: "Войдите в аккаунт, чтобы сохранить измерение.",
  NETWORK_ERROR: "Вес прочитан, но сервер недоступен. Повторите сохранение.",
  simulatorUnsupported: "Измерять вес можно только на реальном iPhone."
};

function measuredAt(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ScaleSyncCard() {
  const connection = useSyncExternalStore(scale.subscribe, scale.getSnapshot, scale.getSnapshot);
  const sync = useSyncExternalStore(scaleSync.subscribe, scaleSync.getSnapshot, scaleSync.getSnapshot);
  const [hasSearched, setHasSearched] = useState(false);
  const connected = connection.phase === "connected";
  const busy = sync.phase === "reading" || sync.phase === "saving";
  const selected = connection.devices.find(device => device.id === connection.selectedDeviceId);
  const batch = connected && sync.batch?.device.id !== selected?.id ? undefined : sync.batch;
  const latestWeight = useMemo(() => batch?.samples
    .filter(sample => sample.metric === "weight")
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0], [batch]);
  const unsaved = Boolean(sync.batch && !sync.saved);
  const searching = ["requestingPermission", "scanning"].includes(connection.phase);
  const unavailable = ["simulatorUnsupported", "iosOnly", "nativeBuildRequired"].includes(connection.errorCode ?? "");

  useEffect(() => () => { void scale.cancelPending(); }, []);

  const startSearch = () => {
    setHasSearched(true);
    void deviceBindings.scan("scale");
  };
  const primaryAction = () => {
    if (busy) void scaleSync.cancel();
    else if (unsaved) void scaleSync.retrySave();
    else if (connected) void scaleSync.sync();
    else startSearch();
  };
  const primaryLabel = busy ? "Отменить" : unsaved ? "Повторить сохранение" : connected ? "Измерить вес" : searching ? "Ищем весы…" : unavailable ? "Нужен реальный iPhone" : "Найти весы";

  return <View style={styles.card}>
    <View style={styles.heading}>
      <View style={styles.icon}><Ionicons name="scale-outline" size={25} color={authColors.greenDark} /></View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>{selected?.name ?? batch?.device.name ?? "Умные весы"}</Text>
        <Text style={styles.secondary}>{connected ? "Готовы к измерению" : latestWeight ? "Последнее сохранённое измерение" : "Вес и динамика"}</Text>
      </View>
      {latestWeight && <Text style={styles.weight}>{latestWeight.value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<Text style={styles.unit}> кг</Text></Text>}
    </View>

    {latestWeight && <Text style={styles.secondary}>Измерено {measuredAt(latestWeight.recordedAt)}</Text>}
    {connected && !busy && <View style={styles.tip}>
      <Ionicons name="footsteps-outline" size={18} color={authColors.greenDark} />
      <Text style={styles.tipText}>Нажмите «Измерить вес», затем встаньте на весы босиком и дождитесь фиксации значения.</Text>
    </View>}
    {searching && <View style={styles.status}><ActivityIndicator size="small" color={authColors.greenDark} /><Text style={styles.statusText}>Разбудите весы лёгким нажатием и держите телефон рядом.</Text></View>}
    {!connected && connection.devices.map(device => <Pressable
      key={device.id}
      accessibilityRole="button"
      accessibilityLabel="Выбрать умные весы"
      onPress={() => void deviceBindings.connect("scale", device.id)}
      style={({ pressed }) => [styles.device, pressed && styles.pressed]}
    >
      <Ionicons name="bluetooth" size={20} color={authColors.greenDark} />
      <View style={styles.copy}><Text style={styles.deviceName}>AxMed Scale</Text><Text style={styles.secondary}>Сигнал {device.rssi} dBm</Text></View>
      <Text style={styles.select}>Выбрать</Text>
    </Pressable>)}
    {hasSearched && !searching && !connected && connection.devices.length === 0 && connection.phase !== "error" &&
      <Text style={styles.secondary}>Весы не найдены. Разбудите их и повторите поиск.</Text>}
    {connection.errorCode && <Text accessibilityRole="alert" style={styles.error}>{connectionErrors[connection.errorCode] ?? "Не удалось найти весы."}</Text>}
    {sync.phase === "reading" && <View style={styles.status}><ActivityIndicator size="small" color={authColors.greenDark} /><Text accessibilityLiveRegion="polite" style={styles.statusText}>Ожидаем устойчивое значение · {sync.progress}%</Text></View>}
    {sync.phase === "saving" && <View style={styles.status}><ActivityIndicator size="small" color={authColors.greenDark} /><Text style={styles.statusText}>Сохраняем измерение…</Text></View>}
    {sync.phase === "complete" && sync.saved && latestWeight && <View style={styles.success}>
      <Ionicons name="checkmark-circle" size={19} color={authColors.greenDark} />
      <Text style={styles.successText}>Вес и демо-показатели состава тела добавлены в историю.</Text>
    </View>}
    {sync.phase === "error" && <Text accessibilityRole="alert" style={styles.error}>{syncErrors[sync.error ?? ""] ?? "Не удалось завершить измерение."}</Text>}

    <Pressable accessibilityRole="button" disabled={searching || unavailable} onPress={primaryAction}
      style={({ pressed }) => [styles.button, (searching || unavailable) && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{primaryLabel}</Text>
    </Pressable>
    {connected && !busy && <Pressable accessibilityRole="button" onPress={() => void deviceBindings.disconnect("scale")} style={styles.disconnect}>
      <Text style={styles.disconnectText}>Отключить весы</Text>
    </Pressable>}
    <Text style={styles.note}>Вес считывается с устройства. Показатели состава тела пока демонстрационные и будут заменены расчётом LEFU; они не являются медицинским заключением.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#F8F8F8", borderRadius: 20, padding: 18, gap: 10, marginBottom: 18 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#F0F0F0" },
  copy: { flex: 1 },
  title: { color: authColors.ink, fontSize: 18, lineHeight: 24, fontWeight: "700" },
  secondary: { color: authColors.muted, fontSize: 12, lineHeight: 18 },
  weight: { color: authColors.ink, fontSize: 22, fontWeight: "700" },
  unit: { color: authColors.muted, fontSize: 12, fontWeight: "500" },
  tip: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 14, backgroundColor: "#F0F0F0" },
  tipText: { flex: 1, color: authColors.text, fontSize: 13, lineHeight: 19 },
  status: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 5 },
  statusText: { flex: 1, color: authColors.text, fontSize: 13, lineHeight: 19 },
  success: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderRadius: 13, backgroundColor: "#F0F0F0" },
  successText: { flex: 1, color: authColors.greenDark, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  device: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: authColors.line, borderRadius: 15, padding: 12, backgroundColor: "#FFF" },
  deviceName: { color: authColors.ink, fontSize: 15, fontWeight: "600" },
  select: { color: authColors.greenDark, fontSize: 13, fontWeight: "700" },
  error: { color: authColors.danger, fontSize: 13, lineHeight: 19 },
  button: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: authColors.greenDark, paddingHorizontal: 16 },
  buttonText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.65 },
  disconnect: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  disconnectText: { color: authColors.muted, fontSize: 13, fontWeight: "600" },
  note: { color: authColors.muted, fontSize: 11, lineHeight: 17 },
  pressed: { opacity: 0.7 }
});
