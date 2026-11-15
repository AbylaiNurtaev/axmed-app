import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { deviceBindings } from "../../devices/deviceBindings";
import { deviceGateway } from "../../devices/deviceGateway";
import { deviceErrorMessage } from "../../devices/errorMessages";
import type { DeviceKind } from "../../devices/types";
import { ConnectionSuccess } from "../devices/ConnectionSuccess";
import { AuthScaffold, LinkButton, PageTitle, PrimaryButton, StepHeader } from "./onboardingUi";
import { useAuthStyles, type AuthColors } from "./authTheme";

const bracelet = deviceGateway.forKind("fitness-band");
const scale = deviceGateway.forKind("scale");
const labels = { "fitness-band": "Браслет", scale: "Весы" };
const pendingLabels: Record<string, string> = {
  requestingPermission: "Ожидаем разрешение Bluetooth…", scanning: "Ищем устройства рядом…",
  connecting: "Устанавливаем соединение…", verifying: "Проверяем подключение…"
};

export function OnboardingDevicesScreen({ kind, onSelect, onBack, onContinue, onChooseAnother }: {
  kind?: DeviceKind; onSelect: (kind: DeviceKind) => void; onBack: () => void;
  onContinue: () => void; onChooseAnother: () => void;
}) {
  const { styles, authColors } = useAuthStyles(createStyles);
  const braceletState = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const scaleState = useSyncExternalStore(scale.subscribe, scale.getSnapshot, scale.getSnapshot);
  const bindings = useSyncExternalStore(deviceBindings.subscribe, deviceBindings.getSnapshot, deviceBindings.getSnapshot);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    setSearched(false);
    return () => {
      if (kind && deviceGateway.forKind(kind).getSnapshot().phase !== "connected") void deviceBindings.cancel(kind);
    };
  }, [kind]);
  const state = kind === "scale" ? scaleState : braceletState;
  const connected = state.phase === "connected";
  const selected = state.devices.find(device => device.id === state.selectedDeviceId);
  const binding = kind ? bindings[kind] : undefined;
  const busy = ["requestingPermission", "scanning", "connecting", "verifying"].includes(state.phase);
  const saved = Boolean(binding?.saved && binding.device?.id === selected?.id);
  const choose = (deviceKind: DeviceKind) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelect(deviceKind);
  };
  const search = () => { if (kind) { setSearched(true); void deviceBindings.scan(kind); } };
  const connectionError = kind === "scale"
    ? state.errorCode === "bluetoothOff" ? "Включите Bluetooth и повторите поиск."
      : state.errorCode === "permissionDenied" ? "Разрешите AxMed доступ к Bluetooth в настройках iPhone."
        : ["nativeBuildRequired", "simulatorUnsupported", "iosOnly"].includes(state.errorCode ?? "") ? "Для подключения весов нужна dev-сборка AxMed на реальном iPhone."
          : "Не удалось подключить весы. Разбудите их и повторите поиск рядом с телефоном."
    : deviceErrorMessage(state.errorCode);

  return <AuthScaffold>
    <StepHeader current={4} onBack={onBack} />
    {!kind ? <>
      <PageTitle title="Подключите устройство" subtitle="Выберите, что подключить. Можно добавить оба устройства или сделать это позже." />
      <View style={styles.grid}>{(["fitness-band", "scale"] as const).map(deviceKind => {
        const deviceState = deviceKind === "scale" ? scaleState : braceletState;
        const active = deviceState.phase === "connected";
        return <Pressable key={deviceKind} accessibilityRole="button" accessibilityLabel={`Выбрать ${deviceKind === "scale" ? "весы" : "браслет"}`}
          onPress={() => choose(deviceKind)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
          <View style={styles.cardIcon}>{deviceKind === "scale" ? <MaterialCommunityIcons name="scale-bathroom" size={36} color={authColors.ink} /> : <Ionicons name="watch-outline" size={36} color={authColors.ink} />}</View>
          <Text style={styles.cardTitle}>{labels[deviceKind]}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.cardText}>{deviceKind === "scale" ? "Вес и состав тела" : "Активность и сон"}</Text>
          <View style={styles.cardBottom}><Text style={styles.cardStatus}>{active ? "Подключено" : "Выбрать"}</Text><Ionicons name={active ? "checkmark-circle" : "arrow-forward"} size={18} color={authColors.ink} /></View>
        </Pressable>;
      })}</View>
      <View style={styles.spacer} />
      <LinkButton title={braceletState.phase === "connected" || scaleState.phase === "connected" ? "Продолжить" : "Пропустить"} onPress={onContinue} />
    </> : connected ? <>
      <View style={styles.successCopy}>
        <ConnectionSuccess />
        <PageTitle centered title={kind === "scale" ? "Весы подключены" : "Браслет подключён"} subtitle={selected?.name} />
        {binding?.saving ? <View style={styles.status}><ActivityIndicator color={authColors.ink} /><Text style={styles.statusText}>Сохраняем привязку к аккаунту…</Text></View> : saved ? <Text style={styles.saved}>Устройство сохранено в вашем аккаунте. При следующем запуске AxMed попробует подключиться автоматически.</Text> : <View style={styles.notice}><Text accessibilityRole="alert" style={styles.noticeText}>{binding?.error ?? "Устройство подключено. Привязка к аккаунту пока не сохранена."}</Text><LinkButton title="Повторить сохранение" onPress={() => void deviceBindings.retrySave(kind)} /></View>}
      </View>
      <PrimaryButton title="Продолжить" disabled={binding?.saving} onPress={onContinue} />
      <LinkButton title="Подключить другое устройство" disabled={binding?.saving} onPress={onChooseAnother} />
    </> : <>
      <PageTitle title={kind === "scale" ? "Подключите весы" : "Подключите браслет"} subtitle={kind === "scale" ? "Разбудите весы и держите телефон рядом. Подключение не запускает измерение." : "Включите Bluetooth и держите браслет рядом с телефоном."} />
      <View style={styles.deviceHero}>{kind === "scale" ? <MaterialCommunityIcons name="scale-bathroom" size={80} color={authColors.ink} /> : <Ionicons name="watch-outline" size={80} color={authColors.ink} />}</View>
      {busy ? <View style={styles.status}><ActivityIndicator color={authColors.ink} /><Text accessibilityLiveRegion="polite" style={styles.statusText}>{pendingLabels[state.phase]}</Text></View> : null}
      {state.devices.length > 0 ? <View style={styles.foundList}>{state.devices.map(device => <Pressable key={device.id} accessibilityRole="button" accessibilityLabel={`Подключить ${device.name}`} disabled={state.phase === "connecting" || state.phase === "verifying"}
        onPress={() => void deviceBindings.connect(kind, device.id)} style={({ pressed }) => [styles.foundRow, pressed && styles.pressed]}>
        <Ionicons name="bluetooth" size={22} color={authColors.ink} /><View style={styles.foundCopy}><Text style={styles.foundName}>{device.name}</Text><Text style={styles.foundDetail}>Сигнал {device.rssi} dBm</Text></View><Ionicons name="chevron-forward" size={20} color={authColors.muted} />
      </Pressable>)}</View> : null}
      {state.phase === "error" ? <Text accessibilityRole="alert" style={styles.error}>{connectionError}</Text> : searched && state.phase === "idle" && !state.devices.length ? <Text style={styles.error}>Устройство не найдено. Поднесите его ближе и повторите поиск.</Text> : null}
      {state.errorCode === "permissionDenied" ? <LinkButton title="Открыть настройки" onPress={() => { void Linking.openSettings().catch(() => {}); }} /> : null}
      <View style={styles.spacer} />
      <PrimaryButton title={busy ? "Отменить поиск" : searched ? "Повторить поиск" : kind === "scale" ? "Найти весы" : "Найти браслет"} icon={busy ? "close" : "bluetooth"}
        onPress={busy ? () => void deviceBindings.cancel(kind) : search} />
      <LinkButton title="Выбрать другое устройство" onPress={onChooseAnother} />
      <LinkButton title="Пропустить" onPress={onContinue} />
    </>}
  </AuthScaffold>;
}

const createStyles = (colors: AuthColors) => StyleSheet.create({
  grid: { flexDirection: "row", gap: 12, marginTop: 6, marginBottom: 24 },
  card: { flex: 1, minWidth: 0, aspectRatio: 1, justifyContent: "space-between", borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 15 },
  cardIcon: { height: 34, justifyContent: "center" }, cardTitle: { color: colors.ink, fontSize: 19, lineHeight: 23, fontWeight: "500", letterSpacing: -0.5 },
  cardText: { color: colors.muted, fontSize: 11, lineHeight: 16 }, cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, cardStatus: { color: colors.ink, fontSize: 11 },
  pressed: { opacity: 0.65 }, spacer: { flexGrow: 1, minHeight: 24 },
  deviceHero: { minHeight: 140, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  status: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginVertical: 16 }, statusText: { flex: 1, flexShrink: 1, color: colors.text, fontSize: 13, lineHeight: 20 },
  foundList: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, overflow: "hidden", marginBottom: 16 },
  foundRow: { minHeight: 72, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, foundCopy: { flex: 1 }, foundName: { color: colors.ink, fontSize: 15, fontWeight: "600" }, foundDetail: { color: colors.muted, fontSize: 11, marginTop: 4 },
  error: { color: colors.text, fontSize: 13, lineHeight: 20, marginVertical: 12 }, successCopy: { flexGrow: 1, justifyContent: "center", paddingVertical: 20 },
  saved: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: "center", marginBottom: 24 }, notice: { backgroundColor: colors.soft, padding: 16, borderRadius: 18, marginBottom: 20 }, noticeText: { color: colors.text, fontSize: 13, lineHeight: 20 }
});
