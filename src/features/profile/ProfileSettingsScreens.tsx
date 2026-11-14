import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Children, isValidElement, memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { deviceSync } from "../../devices/deviceSync";
import { scaleSync } from "../../devices/scaleSync";
import type { DeviceReading } from "../../devices/types";
import { AxBottomSheet, AxConfirmSheet, AxSnackbar } from "../../ui/feedback";
import { AxButton, AxCard, AxFilterChip, AxIconButton, AxPressable, AxStatePanel } from "../../ui/primitives";
import { axMotion, axRadius, axSpace, axType } from "../../ui/tokens";
import { useAxTheme, type AxThemePreference } from "../../ui/theme";
import {
  changeAccountPassword,
  closeActiveSession,
  loadActiveSessions,
  logoutAllSessions,
  type ActiveSession,
  type ProfileData,
  type ProfileSaveInput
} from "../auth/authApi";
import { HealthReportsScreen, type HealthMeasurement } from "../health/HealthInsightsScreens";
import {
  ensureProfileNotificationPermission,
  profileNotificationPermission,
  syncProfileNotifications,
  type ProfileNotificationKey,
  type ProfileNotificationSettings
} from "./profileNotifications";

type IconName = ComponentProps<typeof Ionicons>["name"];
type SaveProfile = (patch: ProfileSaveInput) => Promise<ProfileData>;
type CommonProps = { profile: ProfileData; onBack: () => void; onSave: SaveProfile; onProfileChange: (profile: ProfileData) => void };
type Notice = { message: string; tone: "success" | "error" | "neutral" };
type MedicalContextDraft = { conditions: string; medications: string; allergies: string; lastCheckup: string; notes: string };
const appearanceThemes: ReadonlyArray<{ key: AxThemePreference; title: string; subtitle: string; icon: IconName }> = [
  { key: "system", title: "Системная", subtitle: "Следует за iOS или Android", icon: "phone-portrait-outline" },
  { key: "light", title: "Светлая", subtitle: "Тёплый светлый фон", icon: "sunny-outline" },
  { key: "dark", title: "Тёмная", subtitle: "Спокойная тёмная палитра", icon: "moon-outline" }
];

export function AppearanceScreen(props: CommonProps) {
  const { profile, onBack } = props;
  const { colors, dark } = useAxTheme();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const preference = preferenceString(profile, "theme", "system") as AxThemePreference;
  const save = useOptimisticPreference(props, setBusy, setNotice);
  return <SettingsShell title="Внешний вид" subtitle="Тема, доступность и движение интерфейса" onBack={onBack}>
    <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.ink }]}>Тема</Text>
    <View style={[styles.themeGrid, width < 600 && styles.themeGridCompact]}>{appearanceThemes.map(item => <ThemePreview key={item.key} item={item} selected={preference === item.key} loading={busy === "theme"} onPress={() => void save("theme", item.key)} />)}</View>
    <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.ink }]}>Интерфейс</Text>
    <AxCard style={styles.groupCard}>
      <SettingSwitch icon="sparkles-outline" title="Уменьшить анимации" subtitle="Отключает необязательное движение" value={profile.appPreferences.reduceMotion === true} loading={busy === "reduceMotion"} onChange={value => void save("reduceMotion", value)} />
      <SettingSwitch icon="contrast-outline" title="Повышенный контраст" subtitle="Усиливает границы и подписи" value={profile.appPreferences.highContrast === true} loading={busy === "highContrast"} onChange={value => void save("highContrast", value)} last />
    </AxCard>
    <View style={[styles.contextNote, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name={dark ? "moon" : "sunny"} size={18} color={colors.green} /><Text maxFontSizeMultiplier={1.3} style={[styles.contextText, { color: colors.text }]}>Тема применяется сразу к «Здоровью», «Плану», «Профилю» и общим компонентам.</Text></View>
    <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} onDismiss={() => setNotice(undefined)} />
  </SettingsShell>;
}

export function MedicalContextScreen(props: CommonProps) {
  const { profile, onBack, onSave, onProfileChange } = props;
  const { colors } = useAxTheme();
  const initial = useMemo(() => medicalContextDraft(profile), [profile]);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const requestBack = () => dirty && !saving ? setLeaveConfirm(true) : onBack();
  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const medicalProfile = { ...profile.medicalProfile, ...draft };
      const next = await onSave({ medicalProfile });
      onProfileChange(next);
      setNotice({ message: "Медицинский контекст сохранён", tone: "success" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) { setNotice({ message: message(error), tone: "error" }); }
    finally { setSaving(false); }
  };
  return <>
    <SettingsShell title="Медицинский контекст" subtitle="Информация для персонализации — без медицинских заключений" onBack={requestBack}>
      <View style={[styles.contextNote, { backgroundColor: colors.greenSoft, borderColor: colors.line }]}><Ionicons name="shield-checkmark-outline" size={19} color={colors.green} /><Text maxFontSizeMultiplier={1.3} style={[styles.contextText, { color: colors.text }]}>Указывайте только то, что хотите учитывать в рекомендациях AxMed.</Text></View>
      <AxCard style={styles.medicalForm}>
        <MedicalField label="Хронические состояния" value={draft.conditions} onChangeText={conditions => setDraft(current => ({ ...current, conditions }))} placeholder="Например: не указаны" />
        <MedicalField label="Регулярные лекарства" value={draft.medications} onChangeText={medications => setDraft(current => ({ ...current, medications }))} placeholder="Название и режим приёма" />
        <MedicalField label="Аллергии и непереносимости" value={draft.allergies} onChangeText={allergies => setDraft(current => ({ ...current, allergies }))} placeholder="Например: лактоза" />
        <MedicalField label="Последний медицинский чек-ап" value={draft.lastCheckup} onChangeText={lastCheckup => setDraft(current => ({ ...current, lastCheckup }))} placeholder="ДД.ММ.ГГГГ" keyboardType="number-pad" multiline={false} />
        <MedicalField label="Дополнительные заметки" value={draft.notes} onChangeText={notes => setDraft(current => ({ ...current, notes }))} placeholder="Что ещё важно учитывать" />
      </AxCard>
      <AxButton label="Сохранить" icon="checkmark" loading={saving} disabled={!dirty} onPress={() => void save()} />
      <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} onDismiss={() => setNotice(undefined)} />
    </SettingsShell>
    <AxConfirmSheet visible={leaveConfirm} title="Не сохранять изменения?" message="Внесённые данные будут потеряны." confirmLabel="Не сохранять" danger onClose={() => setLeaveConfirm(false)} onConfirm={onBack} />
  </>;
}

const ThemePreview = memo(function ThemePreview({ item, selected, loading, onPress }: { item: { key: AxThemePreference; title: string; subtitle: string; icon: IconName }; selected: boolean; loading: boolean; onPress: () => void }) {
  const { colors, reduceMotion } = useAxTheme();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => { progress.value = withTiming(selected ? 1 : 0, { duration: reduceMotion ? 0 : axMotion.standard }); }, [progress, reduceMotion, selected]);
  const border = useAnimatedStyle(() => ({ borderColor: interpolateColor(progress.value, [0, 1], [colors.line, colors.green]), borderWidth: 1 + progress.value }));
  const previewDark = item.key === "dark" || item.key === "system" && colors.background !== "#F5F6F2";
  return <AxPressable accessibilityLabel={`${item.title} тема`} accessibilityState={{ selected }} haptic disabled={loading} onPress={onPress} style={styles.themeCell}>
    <Animated.View style={[styles.themeCard, { backgroundColor: colors.surface }, border]}>
      <View style={[styles.themeMock, { backgroundColor: previewDark ? "#111713" : "#F5F6F2" }]}><View style={[styles.mockBar, { backgroundColor: previewDark ? "#26322B" : "#FFFFFF" }]} /><View style={styles.mockRow}><View style={[styles.mockTile, { backgroundColor: previewDark ? "#1B251F" : "#FFFFFF" }]} /><View style={[styles.mockTile, { backgroundColor: previewDark ? "#1B251F" : "#FFFFFF" }]} /></View></View>
      <View style={styles.themeCopy}><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.ink }]}>{item.title}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]} numberOfLines={2}>{item.subtitle}</Text></View>{loading ? <ActivityIndicator size="small" color={colors.green} /> : selected ? <Animated.View entering={FadeIn.duration(reduceMotion ? 0 : 180)} style={[styles.themeCheck, { backgroundColor: colors.green }]}><Ionicons name="checkmark" size={14} color="#FFFFFF" /></Animated.View> : <Ionicons name={item.icon} size={18} color={colors.muted} />}</View>
    </Animated.View>
  </AxPressable>;
});

export function NotificationsScreen(props: CommonProps) {
  const { profile, onBack, onSave, onProfileChange } = props;
  const { colors } = useAxTheme();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [scheduleSheet, setScheduleSheet] = useState(false);
  const [permission, setPermission] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const settings = useMemo(() => notificationSettings(profile), [profile]);
  useEffect(() => { void profileNotificationPermission().then(setPermission); }, []);

  const persist = useCallback(async (patch: Partial<ProfileNotificationSettings>, row: string) => {
    if (busy) return false;
    const previous = profile;
    const nextSettings = { ...settings, ...patch };
    const enabling = Object.entries(patch).some(([key, value]) => key.startsWith("notification") && !["notificationTime", "notificationDays", "notificationMarketing"].includes(key) && value === true);
    if (enabling && !await ensureProfileNotificationPermission()) {
      setPermission("denied");
      setNotice({ message: "Уведомления запрещены в системных настройках", tone: "error" });
      return false;
    }
    if (enabling) setPermission("granted");
    const optimistic = { ...profile, appPreferences: { ...profile.appPreferences, ...patch } };
    setBusy(row); onProfileChange(optimistic);
    try {
      const saved = await onSave({ appPreferences: patch });
      onProfileChange(saved);
      await syncProfileNotifications(profile.id, nextSettings);
      void Haptics.selectionAsync();
      setNotice({ message: "Настройки уведомлений сохранены", tone: "success" });
      return true;
    } catch (error) {
      onProfileChange(previous);
      await syncProfileNotifications(profile.id, settings).catch(() => undefined);
      setNotice({ message: message(error), tone: "error" });
      return false;
    } finally { setBusy(undefined); }
  }, [busy, onProfileChange, onSave, profile, settings]);

  const rows: ReadonlyArray<{ key: ProfileNotificationKey; icon: IconName; title: string; subtitle: string }> = [
    { key: "notificationGoals", icon: "flag-outline", title: "Цели", subtitle: "Следующее действие по активным целям" },
    { key: "notificationTasks", icon: "checkbox-outline", title: "Задачи", subtitle: "Запланированные задачи и сроки" },
    { key: "notificationHabits", icon: "repeat-outline", title: "Привычки", subtitle: "Мягкое напоминание без давления" },
    { key: "notificationMeasurements", icon: "pulse-outline", title: "Время измерения", subtitle: "Регулярное обновление показателей" },
    { key: "notificationBracelet", icon: "watch-outline", title: "Браслет", subtitle: "Напоминание о синхронизации" },
    { key: "notificationScale", icon: "scale-outline", title: "Весы", subtitle: "Напоминание о взвешивании" },
    { key: "notificationWeeklyReport", icon: "document-text-outline", title: "Недельный отчёт", subtitle: "Сводка изменений раз в неделю" },
    { key: "notificationMarketing", icon: "megaphone-outline", title: "Новости AxMed", subtitle: "Маркетинговые сообщения — отдельно", }
  ];
  return <SettingsShell title="Уведомления" subtitle="Только полезные и управляемые напоминания" onBack={onBack}>
    <View style={[styles.permissionCard, { backgroundColor: permission === "denied" ? colors.dangerSoft : colors.greenSoft }]}><Ionicons name={permission === "denied" ? "notifications-off-outline" : "notifications-outline"} size={21} color={permission === "denied" ? colors.danger : colors.green} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.ink }]}>{permission === "granted" ? "Системные уведомления разрешены" : permission === "denied" ? "Уведомления запрещены" : "Разрешение будет запрошено при включении"}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]}>AxMed не запрашивает доступ заранее.</Text></View></View>
    <AxCard style={styles.groupCard}>{rows.map((row, index) => <SettingSwitch key={row.key} icon={row.icon} title={row.title} subtitle={row.subtitle} value={settings[row.key]} loading={busy === row.key} onChange={value => void persist({ [row.key]: value }, row.key)} last={index === rows.length - 1} />)}</AxCard>
    <AxPressable accessibilityLabel="Настроить время и дни" onPress={() => setScheduleSheet(true)} style={[styles.scheduleCard, { backgroundColor: colors.surface, borderColor: colors.line }]}><View style={[styles.rowIcon, { backgroundColor: colors.amberSoft }]}><Ionicons name="calendar-outline" size={20} color={colors.amber} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.ink }]}>Время и дни</Text><Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]}>{settings.notificationTime} · {daysLabel(settings.notificationDays)}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.muted} /></AxPressable>
    <AxBottomSheet visible={scheduleSheet} title="Расписание" subtitle="Время применяется к включённым напоминаниям" onClose={() => !busy && setScheduleSheet(false)}><ScheduleEditor settings={settings} loading={busy === "schedule"} onSave={async next => { if (await persist(next, "schedule")) setScheduleSheet(false); }} /></AxBottomSheet>
    <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} onDismiss={() => setNotice(undefined)} />
  </SettingsShell>;
}

function ScheduleEditor({ settings, loading, onSave }: { settings: ProfileNotificationSettings; loading: boolean; onSave: (patch: Pick<ProfileNotificationSettings, "notificationTime" | "notificationDays">) => void }) {
  const { colors } = useAxTheme();
  const [time, setTime] = useState(settings.notificationTime);
  const [days, setDays] = useState(settings.notificationDays);
  const dayOptions = [1, 2, 3, 4, 5, 6, 7];
  return <View style={styles.sheetStack}><Text maxFontSizeMultiplier={1.3} style={[styles.inputLabel, { color: colors.text }]}>Время</Text><TextInput maxFontSizeMultiplier={1.3} accessibilityLabel="Время уведомлений" value={time} onChangeText={value => setTime(formatTime(value))} keyboardType="number-pad" keyboardAppearance={colors.background === "#101512" ? "dark" : "light"} maxLength={5} style={[styles.timeInput, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]} placeholder="09:00" placeholderTextColor={colors.muted} /><Text maxFontSizeMultiplier={1.3} style={[styles.inputLabel, { color: colors.text }]}>Дни недели</Text><View style={styles.dayGrid}>{dayOptions.map(day => <AxFilterChip key={day} label={dayShort(day)} selected={days.includes(day)} onPress={() => setDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort())} />)}</View><AxButton label="Сохранить расписание" loading={loading} disabled={!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || days.length === 0} onPress={() => onSave({ notificationTime: time, notificationDays: days })} /></View>;
}

export function GeneralSettingsScreen(props: CommonProps) {
  const { profile, onBack } = props;
  const { colors } = useAxTheme();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [picker, setPicker] = useState<PickerConfig>();
  const save = useOptimisticPreference(props, setBusy, setNotice);
  const open = (config: PickerConfig) => setPicker(config);
  const rows: PickerConfig[] = [
    pickerConfig("language", "Язык", "language-outline", "ru", [["ru", "Русский"]]),
    pickerConfig("weightUnit", "Единицы веса", "scale-outline", preferenceString(profile, "weightUnit", profile.appPreferences.units === "imperial" ? "lb" : "kg"), [["kg", "Килограммы (кг)"], ["lb", "Фунты (lb)"]]),
    pickerConfig("heightUnit", "Единицы роста", "resize-outline", preferenceString(profile, "heightUnit", profile.appPreferences.units === "imperial" ? "in" : "cm"), [["cm", "Сантиметры (см)"], ["in", "Дюймы (in)"]]),
    pickerConfig("timeFormat", "Формат времени", "time-outline", preferenceString(profile, "timeFormat", "24"), [["24", "24 часа"], ["12", "12 часов"]]),
    pickerConfig("firstDayOfWeek", "Первый день недели", "calendar-outline", preferenceString(profile, "firstDayOfWeek", "monday"), [["monday", "Понедельник"], ["sunday", "Воскресенье"]]),
    pickerConfig("timezone", "Часовой пояс", "globe-outline", preferenceString(profile, "timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Almaty"), [["Asia/Almaty", "Алматы (UTC+5)"], ["Asia/Dubai", "Дубай (UTC+4)"], ["Europe/Moscow", "Москва (UTC+3)"], ["UTC", "UTC"]])
  ];
  return <SettingsShell title="Общие настройки" subtitle="Язык, единицы, время и синхронизация" onBack={onBack}>
    <AxCard style={styles.groupCard}>{rows.map((row, index) => <ChoiceRow key={row.key} icon={row.icon} title={row.title} value={row.options.find(option => option[0] === row.value)?.[1] ?? row.value} loading={busy === row.key} onPress={() => open(row)} last={index === rows.length - 1} />)}</AxCard>
    <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.ink }]}>Данные</Text>
    <AxCard style={styles.groupCard}><SettingSwitch icon="sync-outline" title="Автосинхронизация" subtitle="Обновлять данные при подключении устройства" value={profile.appPreferences.autoSync !== false} loading={busy === "autoSync"} onChange={value => void save("autoSync", value)} last /></AxCard>
    <AxBottomSheet visible={Boolean(picker)} title={picker?.title ?? "Выбор"} subtitle="Изменение сохранится в вашем аккаунте" onClose={() => !busy && setPicker(undefined)}><View style={styles.optionList}>{picker?.options.map(([value, label]) => <AxPressable key={value} accessibilityLabel={label} onPress={() => void save(picker.key, value).then(() => setPicker(undefined))} style={[styles.optionRow, { backgroundColor: colors.surface, borderColor: picker.value === value ? colors.green : colors.line }]}><Text maxFontSizeMultiplier={1.3} style={[styles.optionText, { color: colors.ink }]}>{label}</Text>{busy === picker.key ? <ActivityIndicator size="small" color={colors.green} /> : picker.value === value ? <Ionicons name="checkmark-circle" size={21} color={colors.green} /> : null}</AxPressable>)}</View></AxBottomSheet>
    <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} onDismiss={() => setNotice(undefined)} />
  </SettingsShell>;
}

type PickerConfig = { key: string; title: string; icon: IconName; value: string; options: ReadonlyArray<readonly [string, string]> };
function pickerConfig(key: string, title: string, icon: IconName, value: string, options: ReadonlyArray<readonly [string, string]>): PickerConfig { return { key, title, icon, value, options }; }

export function SecurityScreen({ profile, onBack, onLogout, onLoggedOut }: { profile: ProfileData; onBack: () => void; onLogout: () => Promise<void>; onLoggedOut: () => void }) {
  const { colors } = useAxTheme();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmSession, setConfirmSession] = useState<ActiveSession>();
  const [confirmAll, setConfirmAll] = useState(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => { setLoading(true); try { const next = await loadActiveSessions(); if (mounted.current) setSessions(next); } catch (error) { if (mounted.current) setNotice({ message: message(error), tone: "error" }); } finally { if (mounted.current) setLoading(false); } }, []);
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; }; }, [refresh]);
  const changePassword = async () => {
    if (busy || newPassword.length < 8 || !/\p{L}/u.test(newPassword) || !/\p{N}/u.test(newPassword)) return;
    setBusy("password");
    try { await changeAccountPassword(currentPassword, newPassword); setPasswordOpen(false); setCurrentPassword(""); setNewPassword(""); setNotice({ message: "Пароль изменён. Другие сессии завершены", tone: "success" }); await refresh(); }
    catch (error) { setNotice({ message: message(error), tone: "error" }); }
    finally { setBusy(undefined); }
  };
  const closeSession = async () => {
    if (!confirmSession || busy) return;
    if (confirmSession.current) { setBusy(confirmSession.id); try { await onLogout(); } finally { setBusy(undefined); } return; }
    setBusy(confirmSession.id);
    try { await closeActiveSession(confirmSession.id); setSessions(current => current.filter(item => item.id !== confirmSession.id)); setConfirmSession(undefined); setNotice({ message: "Сессия завершена", tone: "success" }); }
    catch (error) { setNotice({ message: message(error), tone: "error" }); }
    finally { setBusy(undefined); }
  };
  const logoutEverywhere = async () => {
    if (busy) return; setBusy("all");
    try { await logoutAllSessions(); onLoggedOut(); }
    catch (error) { setNotice({ message: message(error), tone: "error" }); setBusy(undefined); setConfirmAll(false); }
  };
  return <SettingsShell title="Безопасность" subtitle="Пароль и активные сеансы" onBack={onBack}>
    <View style={[styles.securityHero, { backgroundColor: colors.greenSoft }]}><View style={[styles.securityIcon, { backgroundColor: colors.surface }]}><Ionicons name="shield-checkmark" size={26} color={colors.green} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.securityTitle, { color: colors.ink }]}>Аккаунт защищён</Text><Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]}>{profile.emailVerified ? "Email подтверждён" : "Подтвердите email для полной защиты"}</Text></View></View>
    <AxButton label="Сменить пароль" icon="key-outline" variant="secondary" onPress={() => setPasswordOpen(true)} />
    <View style={styles.sectionHeading}><Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.ink, marginBottom: 0 }]}>Активные сессии</Text><AxPressable accessibilityLabel="Обновить сессии" onPress={() => void refresh()} style={styles.refreshButton}><Ionicons name="refresh" size={18} color={colors.green} /></AxPressable></View>
    {loading ? <AxCard style={styles.loadingCard}><ActivityIndicator color={colors.green} /><Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]}>Проверяем активные устройства…</Text></AxCard> : sessions.length ? <AxCard style={styles.groupCard}>{sessions.map((session, index) => <AxPressable key={session.id} accessibilityLabel={`${session.device}, ${session.current ? "текущее устройство" : "другая сессия"}`} onPress={() => setConfirmSession(session)} style={[styles.sessionRow, index < sessions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.line }]}><View style={[styles.rowIcon, { backgroundColor: session.current ? colors.greenSoft : colors.blueSoft }]}><Ionicons name={session.device.includes("iPhone") ? "phone-portrait-outline" : "desktop-outline"} size={20} color={session.current ? colors.green : colors.blue} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.ink }]}>{session.device}{session.current ? " · Это устройство" : ""}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]}>Активность: {dateTime(session.lastSeenAt)}</Text></View>{busy === session.id ? <ActivityIndicator size="small" color={colors.green} /> : <Ionicons name="log-out-outline" size={18} color={colors.muted} />}</AxPressable>)}</AxCard> : <AxStatePanel icon="phone-portrait-outline" title="Нет активных сессий" message="Список обновится после следующего входа." />}
    <AxButton label="Выйти на всех устройствах" icon="log-out-outline" variant="danger" onPress={() => setConfirmAll(true)} />
    <AxBottomSheet visible={passwordOpen} title="Смена пароля" subtitle="После изменения остальные сессии будут завершены" onClose={() => !busy && setPasswordOpen(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetStack}><SecureInput label="Текущий пароль" value={currentPassword} onChange={setCurrentPassword} /><SecureInput label="Новый пароль" value={newPassword} onChange={setNewPassword} helper="Минимум 8 символов, буква и цифра" /><AxButton label="Изменить пароль" loading={busy === "password"} disabled={!currentPassword || newPassword.length < 8 || !/\p{L}/u.test(newPassword) || !/\p{N}/u.test(newPassword)} onPress={() => void changePassword()} /></KeyboardAvoidingView></AxBottomSheet>
    <AxConfirmSheet visible={Boolean(confirmSession)} title={confirmSession?.current ? "Выйти на этом устройстве?" : "Завершить эту сессию?"} message={confirmSession?.current ? "Локальные данные будут очищены, данные аккаунта сохранятся." : `${confirmSession?.device ?? "Устройство"} потеряет доступ к аккаунту.`} confirmLabel="Завершить" danger loading={Boolean(confirmSession && busy === confirmSession.id)} onClose={() => setConfirmSession(undefined)} onConfirm={() => void closeSession()} />
    <AxConfirmSheet visible={confirmAll} title="Выйти на всех устройствах?" message="Все активные сеансы, включая этот, будут завершены. Данные останутся в аккаунте." confirmLabel="Выйти везде" danger loading={busy === "all"} onClose={() => setConfirmAll(false)} onConfirm={() => void logoutEverywhere()} />
    <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} onDismiss={() => setNotice(undefined)} />
  </SettingsShell>;
}

export function LogoutScreen({ onBack, onLogout }: { onBack: () => void; onLogout: () => Promise<void> }) {
  const { colors } = useAxTheme();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const run = async () => { if (loading) return; setLoading(true); try { await onLogout(); } catch (error) { setNotice({ message: message(error), tone: "error" }); setLoading(false); setConfirm(false); } };
  return <SettingsShell title="Выход" subtitle="Безопасное завершение текущего сеанса" onBack={onBack}>
    <View style={[styles.logoutHero, { backgroundColor: colors.surface, borderColor: colors.line }]}><View style={[styles.logoutIcon, { backgroundColor: colors.dangerSoft }]}><Ionicons name="log-out-outline" size={30} color={colors.danger} /></View><Text maxFontSizeMultiplier={1.3} style={[styles.logoutTitle, { color: colors.ink }]}>Данные останутся в аккаунте</Text><Text maxFontSizeMultiplier={1.3} style={[styles.logoutText, { color: colors.muted }]}>Измерения, цели, настройки и фотография не удаляются. При следующем входе они восстановятся с сервера.</Text><View style={[styles.logoutFact, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="shield-checkmark-outline" size={18} color={colors.green} /><Text maxFontSizeMultiplier={1.3} style={[styles.contextText, { color: colors.text }]}>Текущие синхронизации будут отменены, локальные токены и напоминания очищены.</Text></View></View>
    <AxButton label="Выйти из аккаунта" icon="log-out-outline" variant="danger" onPress={() => setConfirm(true)} />
    <AxButton label="Остаться в AxMed" variant="ghost" onPress={onBack} />
    <AxConfirmSheet visible={confirm} title="Выйти из аккаунта?" message="После выхода потребуется снова ввести данные для входа." confirmLabel="Выйти" danger loading={loading} onClose={() => setConfirm(false)} onConfirm={() => void run()} />
    <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} onDismiss={() => setNotice(undefined)} />
  </SettingsShell>;
}

export function ProfileReportsScreen({ onBack }: { onBack: () => void }) {
  const bracelet = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getSnapshot);
  const scale = useSyncExternalStore(scaleSync.subscribe, scaleSync.getSnapshot, scaleSync.getSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const samples = useMemo(() => [...(bracelet.batch?.samples ?? []), ...(scale.batch?.samples ?? [])], [bracelet.batch, scale.batch]);
  const measurements = useMemo(() => groupMeasurements(samples), [samples]);
  const error = bracelet.phase === "error" && scale.phase === "error" ? "Не удалось обновить данные устройств." : undefined;
  const refresh = async () => { setRefreshing(true); await Promise.allSettled([deviceSync.refresh(), scaleSync.refresh()]); setRefreshing(false); };
  return <HealthReportsScreen samples={samples} measurements={measurements} refreshing={refreshing} error={error} onRefresh={() => void refresh()} onBack={onBack} />;
}

function SettingsShell({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: ReactNode }) {
  const { colors } = useAxTheme();
  const items = Children.toArray(children);
  const overlays = items.filter(item => isValidElement(item) && item.type === AxSnackbar);
  const content = items.filter(item => !isValidElement(item) || item.type !== AxSnackbar);
  return <View style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><View style={styles.header}><AxIconButton icon="arrow-back" label="Назад" tone="neutral" onPress={onBack} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{title}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text></View></View>{content}</ScrollView>{overlays}</View>;
}

function SettingSwitch({ icon, title, subtitle, value, loading, onChange, last = false }: { icon: IconName; title: string; subtitle: string; value: boolean; loading?: boolean; onChange: (value: boolean) => void; last?: boolean }) {
  const { colors } = useAxTheme();
  return <View style={[styles.settingRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.line }]}><View style={[styles.rowIcon, { backgroundColor: value ? colors.greenSoft : colors.surfaceMuted }]}><Ionicons name={icon} size={20} color={value ? colors.green : colors.muted} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]}>{subtitle}</Text></View>{loading ? <ActivityIndicator accessibilityLabel={`Сохранение: ${title}`} size="small" color={colors.green} /> : <Switch accessibilityLabel={title} accessibilityState={{ checked: value }} value={value} onValueChange={onChange} trackColor={{ false: colors.lineStrong, true: colors.green }} thumbColor="#FFFFFF" />}</View>;
}

function ChoiceRow({ icon, title, subtitle, value, onPress, loading, last = false }: { icon: IconName; title: string; subtitle?: string; value: string; onPress: () => void; loading?: boolean; last?: boolean }) {
  const { colors } = useAxTheme();
  return <AxPressable accessibilityLabel={`${title}: ${value}`} disabled={loading} onPress={onPress} style={[styles.settingRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.line }]}><View style={[styles.rowIcon, { backgroundColor: colors.blueSoft }]}><Ionicons name={icon} size={20} color={colors.blue} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text>{subtitle ? <Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}</View>{loading ? <ActivityIndicator size="small" color={colors.green} /> : <><Text maxFontSizeMultiplier={1.3} style={[styles.rowValue, { color: colors.muted }]} numberOfLines={1}>{value}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></>}</AxPressable>;
}

function SecureInput({ label, value, onChange, helper }: { label: string; value: string; onChange: (value: string) => void; helper?: string }) {
  const { colors } = useAxTheme();
  const [visible, setVisible] = useState(false);
  return <View><Text maxFontSizeMultiplier={1.3} style={[styles.inputLabel, { color: colors.text }]}>{label}</Text><View style={[styles.passwordInput, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name="lock-closed-outline" size={18} color={colors.muted} /><TextInput maxFontSizeMultiplier={1.3} accessibilityLabel={label} accessibilityHint={helper} value={value} onChangeText={onChange} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} keyboardAppearance={colors.background === "#101512" ? "dark" : "light"} style={[styles.passwordText, { color: colors.ink }]} placeholder="••••••••" placeholderTextColor={colors.muted} /><AxPressable accessibilityLabel={visible ? "Скрыть пароль" : "Показать пароль"} onPress={() => setVisible(current => !current)} style={styles.eyeButton}><Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={19} color={colors.muted} /></AxPressable></View>{helper ? <Text maxFontSizeMultiplier={1.3} style={[styles.rowSubtitle, { color: colors.muted }]}>{helper}</Text> : null}</View>;
}

function MedicalField({ label, multiline = true, ...props }: ComponentProps<typeof TextInput> & { label: string; multiline?: boolean }) {
  const { colors, dark } = useAxTheme();
  return <View><Text maxFontSizeMultiplier={1.3} style={[styles.inputLabel, { color: colors.text }]}>{label}</Text><TextInput maxFontSizeMultiplier={1.3} {...props} accessibilityLabel={label} multiline={multiline} maxLength={500} keyboardAppearance={dark ? "dark" : "light"} placeholderTextColor={colors.muted} style={[styles.medicalInput, !multiline && styles.medicalInputSingle, { color: colors.ink, backgroundColor: colors.surfaceMuted, borderColor: colors.line }]} /></View>;
}

function useOptimisticPreference(props: CommonProps, setBusy: (key?: string) => void, setNotice: (notice?: Notice) => void) {
  const { profile, onSave, onProfileChange } = props;
  const inFlight = useRef(false);
  return useCallback(async (key: string, value: unknown) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const previous = profile;
    setBusy(key);
    onProfileChange({ ...profile, appPreferences: { ...profile.appPreferences, [key]: value } });
    try { const next = await onSave({ appPreferences: { [key]: value } }); onProfileChange(next); setNotice({ message: "Настройка сохранена", tone: "success" }); void Haptics.selectionAsync(); }
    catch (error) { onProfileChange(previous); setNotice({ message: message(error), tone: "error" }); }
    finally { inFlight.current = false; setBusy(undefined); }
  }, [onProfileChange, onSave, profile, setBusy, setNotice]);
}

function notificationSettings(profile: ProfileData): ProfileNotificationSettings {
  const pref = profile.appPreferences;
  return {
    notificationGoals: pref.notificationGoals === true,
    notificationTasks: pref.notificationTasks === true,
    notificationHabits: pref.notificationHabits === true,
    notificationMeasurements: pref.notificationMeasurements === true,
    notificationBracelet: pref.notificationBracelet === true,
    notificationScale: pref.notificationScale === true,
    notificationWeeklyReport: pref.notificationWeeklyReport === true,
    notificationMarketing: pref.notificationMarketing === true,
    notificationTime: typeof pref.notificationTime === "string" ? pref.notificationTime : "09:00",
    notificationDays: Array.isArray(pref.notificationDays) ? pref.notificationDays.filter((value): value is number => typeof value === "number" && value >= 1 && value <= 7) : [1, 2, 3, 4, 5, 6, 7]
  };
}

function medicalContextDraft(profile: ProfileData): MedicalContextDraft {
  const source = profile.medicalProfile;
  const text = (key: keyof MedicalContextDraft) => typeof source[key] === "string" ? String(source[key]) : "";
  return { conditions: text("conditions"), medications: text("medications"), allergies: text("allergies"), lastCheckup: text("lastCheckup"), notes: text("notes") };
}

function groupMeasurements(samples: DeviceReading[]): HealthMeasurement[] {
  const groups = new Map<string, HealthMeasurement>();
  for (const sample of samples) {
    const source = sample.metric === "weight" || ["bodyFatPercentage", "muscleMass", "bodyWaterPercentage", "proteinPercentage", "visceralFatLevel", "boneMass", "basalMetabolicRate", "metabolicAge", "bodyScore"].includes(sample.metric) ? "scale" : "bracelet";
    const key = `${source}:${sample.localDate}`;
    const current = groups.get(key) ?? { id: key, source, recordedAt: sample.recordedAt, samples: [], saved: true };
    current.samples.push(sample);
    if (sample.recordedAt > current.recordedAt) current.recordedAt = sample.recordedAt;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

function preferenceString(profile: ProfileData, key: string, fallback: string) { const value = profile.appPreferences[key]; return typeof value === "string" && value ? value : fallback; }
function message(error: unknown) { return error instanceof Error ? error.message : "Не удалось сохранить изменение."; }
function dateTime(value: string) { return new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function dayShort(day: number) { return ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][day - 1] ?? ""; }
function daysLabel(days: number[]) { return days.length === 7 ? "каждый день" : days.map(dayShort).join(", "); }
function formatTime(value: string) { const digits = value.replace(/\D/g, "").slice(0, 4); return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`; }

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: axSpace.x4, paddingTop: axSpace.x3, paddingBottom: axSpace.x10 }, flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginBottom: axSpace.x6 }, title: { ...axType.title }, subtitle: { ...axType.body, marginTop: 2 },
  sectionLabel: { ...axType.section, marginTop: axSpace.x3, marginBottom: axSpace.x3 }, groupCard: { padding: 0, overflow: "hidden", marginBottom: axSpace.x5 },
  themeGrid: { flexDirection: "row", gap: axSpace.x2, marginBottom: axSpace.x5 }, themeGridCompact: { flexDirection: "column" }, themeCell: { flex: 1, minWidth: 0 }, themeCard: { minHeight: 168, borderRadius: axRadius.lg, padding: axSpace.x2 }, themeMock: { height: 92, borderRadius: axRadius.md, padding: 8 }, mockBar: { height: 18, borderRadius: 6 }, mockRow: { flex: 1, flexDirection: "row", gap: 5, paddingTop: 6 }, mockTile: { flex: 1, borderRadius: 7 }, themeCopy: { flexDirection: "row", alignItems: "center", gap: 5, padding: 7, paddingBottom: 2 }, themeCheck: { width: 23, height: 23, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  settingRow: { minHeight: 78, paddingHorizontal: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x3 }, rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, rowTitle: { ...axType.bodyStrong }, rowSubtitle: { ...axType.caption, marginTop: 2 }, rowValue: { ...axType.caption, maxWidth: 118, fontWeight: "700" }, chips: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2, paddingHorizontal: axSpace.x3, paddingBottom: axSpace.x3 },
  contextNote: { minHeight: 58, borderRadius: axRadius.md, padding: axSpace.x3, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: axSpace.x2, marginBottom: axSpace.x5 }, contextText: { ...axType.caption, flex: 1 },
  permissionCard: { minHeight: 70, borderRadius: axRadius.lg, padding: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginBottom: axSpace.x4 }, scheduleCard: { minHeight: 76, borderRadius: axRadius.lg, paddingHorizontal: axSpace.x3, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  sheetStack: { gap: axSpace.x4 }, inputLabel: { ...axType.label, marginBottom: 7 }, timeInput: { minHeight: 56, borderRadius: axRadius.md, borderWidth: 1, paddingHorizontal: axSpace.x4, fontSize: 20, fontWeight: "800", letterSpacing: 1 }, dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2 },
  optionList: { gap: axSpace.x2 }, optionRow: { minHeight: 58, borderRadius: axRadius.md, borderWidth: 1, paddingHorizontal: axSpace.x4, flexDirection: "row", alignItems: "center", gap: axSpace.x3 }, optionText: { ...axType.bodyStrong, flex: 1 },
  securityHero: { minHeight: 92, borderRadius: axRadius.xl, padding: axSpace.x4, flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginBottom: axSpace.x3 }, securityIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" }, securityTitle: { ...axType.cardTitle }, sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: axSpace.x5, marginBottom: axSpace.x3 }, refreshButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, loadingCard: { minHeight: 86, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: axSpace.x3 }, sessionRow: { minHeight: 76, paddingHorizontal: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  passwordInput: { minHeight: 54, borderRadius: axRadius.md, borderWidth: 1, paddingLeft: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x2 }, passwordText: { flex: 1, minWidth: 0, minHeight: 52, fontSize: 15, fontWeight: "600" }, eyeButton: { width: 46, height: 52, alignItems: "center", justifyContent: "center" },
  medicalForm: { gap: axSpace.x4, marginBottom: axSpace.x4 }, medicalInput: { minHeight: 88, borderRadius: axRadius.md, borderWidth: 1, paddingHorizontal: axSpace.x3, paddingVertical: axSpace.x3, fontSize: 14, lineHeight: 20, textAlignVertical: "top" }, medicalInputSingle: { minHeight: 52, textAlignVertical: "center" },
  logoutHero: { borderRadius: axRadius.xl, borderWidth: 1, padding: axSpace.x5, alignItems: "center", marginBottom: axSpace.x5 }, logoutIcon: { width: 68, height: 68, borderRadius: 23, alignItems: "center", justifyContent: "center" }, logoutTitle: { ...axType.section, marginTop: axSpace.x4, textAlign: "center" }, logoutText: { ...axType.body, marginTop: axSpace.x2, textAlign: "center" }, logoutFact: { marginTop: axSpace.x5, borderRadius: axRadius.md, padding: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x2 }
});
