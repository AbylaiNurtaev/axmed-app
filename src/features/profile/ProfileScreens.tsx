import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { deviceGateway } from "../../devices/deviceGateway";
import { scaleSync } from "../../devices/scaleSync";
import {
  deleteProfileAvatar,
  loadPlanWorkspace,
  type PlanGamification,
  type ProfileData,
  type ProfileSaveInput,
  uploadProfileAvatar
} from "../auth/authApi";
import { AxBottomSheet, AxConfirmSheet, AxSnackbar } from "../../ui/feedback";
import { AxButton, AxCard, AxFilterChip, AxIconButton, AxPressable, AxScreenHeader, AxSkeleton } from "../../ui/primitives";
import { AxReveal } from "../../ui/motion";
import { axColors, axRadius, axSpace, axType } from "../../ui/tokens";
import { useAxReducedMotion, useAxTheme } from "../../ui/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
export type ProfileRoute = "personal" | "medical" | "security" | "devices" | "reports" | "dataSync" | "notifications" | "appearance" | "languageUnits" | "general" | "help" | "privacy" | "about" | "scale" | "connectDevice" | "logout";

type MenuItem = {
  key: ProfileRoute;
  icon: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  color: string;
  soft: string;
};

type AvatarDraft = { uri: string; dataBase64: string; fileName: string };
type AvatarStage = "idle" | "processing" | "uploading" | "success" | "error";

const defaultGame: PlanGamification = {
  points: 0,
  level: 1,
  levelTitle: "Листочек",
  nextLevelPoints: 80,
  levelProgress: 0,
  streakDays: 0,
  completedGoals: 0,
  weeklySequence: [],
  monthActivity: [],
  achievements: []
};

export function ProfileMainScreen({ profile, loading, onRefresh, onOpen, onProfileChange }: {
  profile: ProfileData;
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  onOpen: (route: ProfileRoute) => void;
  onProfileChange: (profile: ProfileData) => void;
}) {
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft>();
  const [avatarStage, setAvatarStage] = useState<AvatarStage>("idle");
  const [avatarError, setAvatarError] = useState<string>();
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [game, setGame] = useState(defaultGame);
  const progress = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  const mounted = useRef(true);

  const bracelet = deviceGateway.forKind("fitness-band");
  const braceletState = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const scale = deviceGateway.forKind("scale");
  const scaleState = useSyncExternalStore(scale.subscribe, scale.getSnapshot, scale.getSnapshot);
  const scaleMeasurements = useSyncExternalStore(scaleSync.subscribe, scaleSync.getSnapshot, scaleSync.getSnapshot);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const localDate = formatIsoDate(new Date());
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void loadPlanWorkspace(localDate, timeZone).then(result => {
      if (active) setGame(result.gamification);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const connectedCount = (braceletState.phase === "connected" ? 1 : 0) + (scaleState.phase === "connected" ? 1 : 0);
  const latestWeight = useMemo(() => scaleMeasurements.batch?.samples
    .filter(sample => sample.metric === "weight")
    .reduce<typeof scaleMeasurements.batch.samples[number] | undefined>((latest, sample) => !latest || sample.recordedAt > latest.recordedAt ? sample : latest, undefined), [scaleMeasurements.batch]);
  const completion = useMemo(() => profileCompletion(profile), [profile]);
  const displayName = profile.fullName || profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Ваш профиль";
  const contact = profile.email || profile.phone || "Добавьте контактные данные";
  const avatarUri = profile.avatarUrl ? appendVersion(profile.avatarUrl, profile.updatedAt) : null;
  const theme = String(profile.appPreferences.theme ?? "light");
  const units = String(profile.appPreferences.units ?? "metric");

  const sections = useMemo(() => [
    { title: "Аккаунт", data: [
      menu("personal", "person-outline", "Личные данные", "Имя, контакты и параметры", axColors.green, axColors.greenSoft),
      menu("medical", "medical-outline", "Медицинский контекст", "Состояния, лекарства и ограничения", axColors.coral, axColors.coralSoft),
      menu("security", "shield-checkmark-outline", "Безопасность", profile.emailVerified ? "Email подтверждён" : "Проверьте параметры входа", axColors.blue, axColors.blueSoft, profile.emailVerified ? "Защищён" : undefined)
    ]},
    { title: "Здоровье", data: [
      menu("devices", "watch-outline", "Устройства", "Браслет и умные весы", axColors.blue, axColors.blueSoft, connectedCount ? `${connectedCount} подкл.` : "Не подключены"),
      menu("reports", "document-text-outline", "Отчёты", "История, динамика и экспорт", axColors.purple, axColors.purpleSoft),
      menu("dataSync", "cloud-done-outline", "Данные и синхронизация", "Обновление и хранение показателей", axColors.green, axColors.greenSoft, profile.appPreferences.syncEnabled === false ? "Выкл." : "Вкл.")
    ]},
    { title: "Настройки", data: [
      menu("notifications", "notifications-outline", "Уведомления", "Напоминания и рекомендации", axColors.amber, axColors.amberSoft),
      menu("appearance", "color-palette-outline", "Внешний вид", undefined, axColors.purple, axColors.purpleSoft, themeLabel(theme)),
      menu("general", "options-outline", "Общие настройки", "Язык, единицы, время и синхронизация", axColors.green, axColors.greenSoft, units === "imperial" ? "lb, in" : "кг, см")
    ]},
    { title: "Поддержка", data: [
      menu("help", "help-buoy-outline", "Помощь", "Ответы и связь с поддержкой", axColors.blue, axColors.blueSoft),
      menu("privacy", "lock-closed-outline", "Политика конфиденциальности", undefined, axColors.green, axColors.greenSoft),
      menu("about", "information-circle-outline", "О приложении", "AxMed 1.0.0", axColors.muted, axColors.surfaceMuted),
      menu("logout", "log-out-outline", "Выйти", "Данные останутся в аккаунте", axColors.danger, axColors.dangerSoft)
    ]}
  ], [connectedCount, profile.appPreferences.syncEnabled, profile.emailVerified, theme, units]);

  const chooseImage = useCallback(async (source: "library" | "camera") => {
    if (avatarStage === "uploading" || avatarStage === "processing") return;
    setAvatarError(undefined);
    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAvatarError(source === "camera" ? "Разрешите доступ к камере в настройках устройства." : "Разрешите доступ к медиатеке в настройках устройства.");
      return;
    }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    setAvatarStage("processing");
    progress.value = reduceMotion ? 0.25 : withTiming(0.25, { duration: 180 });
    try {
      const resizedWidth = Math.min(1200, Math.max(320, asset.width || 1200));
      const prepared = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: resizedWidth } }], {
        compress: 0.78,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true
      });
      if (!prepared.base64) throw new Error("Не удалось подготовить изображение.");
      setAvatarDraft({ uri: prepared.uri, dataBase64: prepared.base64, fileName: `avatar-${Date.now()}.jpg` });
      setAvatarStage("idle");
      progress.value = reduceMotion ? 0 : withTiming(0, { duration: 120 });
    } catch (error) {
      setAvatarStage("error");
      setAvatarError(errorMessage(error));
    }
  }, [avatarStage, progress, reduceMotion]);

  const uploadAvatar = useCallback(async () => {
    if (!avatarDraft || avatarStage === "uploading") return;
    setAvatarStage("uploading");
    setAvatarError(undefined);
    progress.value = reduceMotion ? 0.72 : withTiming(0.82, { duration: 1600 });
    try {
      const next = await uploadProfileAvatar({ fileName: avatarDraft.fileName, mimeType: "image/jpeg", dataBase64: avatarDraft.dataBase64 });
      progress.value = reduceMotion ? 1 : withTiming(1, { duration: 180 });
      if (!mounted.current) return;
      onProfileChange(next);
      setAvatarStage("success");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        if (!mounted.current) return;
        setAvatarDraft(undefined);
        setAvatarSheet(false);
        setAvatarStage("idle");
        progress.value = 0;
      }, reduceMotion ? 0 : 420);
    } catch (error) {
      setAvatarStage("error");
      setAvatarError(errorMessage(error));
      progress.value = reduceMotion ? 0 : withTiming(0, { duration: 180 });
    }
  }, [avatarDraft, avatarStage, onProfileChange, progress, reduceMotion]);

  const removeAvatar = useCallback(async () => {
    if (avatarStage === "uploading") return;
    setAvatarStage("uploading");
    setAvatarError(undefined);
    try {
      const next = await deleteProfileAvatar();
      onProfileChange(next);
      setRemoveConfirm(false);
      setAvatarSheet(false);
      setAvatarDraft(undefined);
      setAvatarStage("idle");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setAvatarStage("error");
      setAvatarError(errorMessage(error));
      setRemoveConfirm(false);
    }
  }, [avatarStage, onProfileChange]);

  const header = <View>
    <AxScreenHeader title="Профиль" subtitle="Ваш аккаунт, устройства и настройки" />
    <AxReveal><AxCard style={styles.profileHero}>
      <AxPressable accessibilityLabel="Изменить фото профиля" onPress={() => { setAvatarError(undefined); setAvatarSheet(true); }} style={styles.avatarButton}>
        {loading && !profile.id ? <AxSkeleton width={88} height={88} radius={44} /> : avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text maxFontSizeMultiplier={1.3} style={styles.avatarInitials}>{initials(displayName)}</Text></View>}
        <View style={styles.avatarEdit}><Ionicons name="camera" size={15} color={axColors.onAccent} /></View>
      </AxPressable>
      <View style={styles.heroIdentity}><Text maxFontSizeMultiplier={1.3} style={styles.profileName} numberOfLines={2}>{displayName}</Text><Text maxFontSizeMultiplier={1.3} style={styles.profileContact} numberOfLines={1}>{contact}</Text><View style={styles.profileStatus}><View style={styles.statusDot} /><Text maxFontSizeMultiplier={1.3} style={styles.statusText}>{completion === 100 ? "Профиль заполнен" : `Профиль заполнен на ${completion}%`}</Text></View></View>
      <AxIconButton icon="create-outline" label="Редактировать личные данные" tone="neutral" onPress={() => onOpen("personal")} />
    </AxCard></AxReveal>
    <View style={styles.quickGrid}>
      <AxCard style={styles.quickCard}><View style={[styles.quickIcon, { backgroundColor: axColors.greenSoft }]}><MaterialCommunityIcons name="tree-outline" size={22} color={axColors.green} /></View><Text maxFontSizeMultiplier={1.3} style={styles.quickValue}>Ур. {game.level}</Text><Text maxFontSizeMultiplier={1.3} style={styles.quickLabel}>{game.levelTitle}</Text></AxCard>
      <AxCard style={styles.quickCard}><View style={[styles.quickIcon, { backgroundColor: axColors.coralSoft }]}><Ionicons name="flame-outline" size={22} color={axColors.coral} /></View><Text maxFontSizeMultiplier={1.3} style={styles.quickValue}>{game.streakDays}</Text><Text maxFontSizeMultiplier={1.3} style={styles.quickLabel}>дней серии</Text></AxCard>
      <AxCard style={styles.quickCard} onPress={() => onOpen("devices")} accessibilityLabel="Открыть устройства"><View style={[styles.quickIcon, { backgroundColor: axColors.blueSoft }]}><Ionicons name="watch-outline" size={22} color={axColors.blue} /></View><Text maxFontSizeMultiplier={1.3} style={styles.quickValue}>{connectedCount}</Text><Text maxFontSizeMultiplier={1.3} style={styles.quickLabel}>{latestWeight ? `${latestWeight.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг` : "устройств"}</Text></AxCard>
    </View>
  </View>;

  const footer = <View style={styles.footer}>
    <AxButton label="Выйти из аккаунта" icon="log-out-outline" variant="ghost" onPress={() => onOpen("logout")} />
    <Text maxFontSizeMultiplier={1.3} style={styles.version}>AxMed · Версия 1.0.0</Text>
  </View>;

  return <View style={styles.root}>
    <SectionList
      sections={sections}
      keyExtractor={item => item.key}
      renderItem={({ item }) => <ProfileMenuRow item={item} onPress={() => onOpen(item.key)} />}
      renderSectionHeader={({ section }) => <Text maxFontSizeMultiplier={1.3} style={styles.sectionTitle}>{section.title}</Text>}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      initialNumToRender={12}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void onRefresh()} tintColor={axColors.green} />}
    />
    <AxBottomSheet visible={avatarSheet} title={avatarDraft ? "Предпросмотр" : "Фото профиля"} subtitle={avatarDraft ? "Проверьте кадр перед загрузкой" : "Выберите источник фотографии"} onClose={() => avatarStage !== "uploading" && avatarStage !== "processing" && setAvatarSheet(false)}>
      {avatarDraft ? <View>
        <Image source={{ uri: avatarDraft.uri }} style={styles.avatarPreview} />
        {avatarStage === "uploading" || avatarStage === "processing" ? <UploadProgress progress={progress} label={avatarStage === "processing" ? "Подготавливаем фото…" : "Загружаем защищённо…"} /> : null}
        {avatarStage === "success" ? <View style={styles.successRow}><Ionicons name="checkmark-circle" size={21} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.successText}>Фото обновлено</Text></View> : null}
        {avatarError ? <InlineError message={avatarError} /> : null}
        <View style={styles.sheetActions}><AxButton label={avatarStage === "error" ? "Повторить" : "Сохранить фото"} icon="cloud-upload-outline" onPress={() => void uploadAvatar()} loading={avatarStage === "uploading"} disabled={avatarStage === "processing" || avatarStage === "success"} /><AxButton label="Выбрать другое" variant="secondary" onPress={() => setAvatarDraft(undefined)} disabled={avatarStage === "uploading" || avatarStage === "processing"} /></View>
      </View> : <View style={styles.actionList}>
        <AvatarAction icon="images-outline" title="Выбрать из галереи" subtitle="Фото можно обрезать перед загрузкой" onPress={() => void chooseImage("library")} />
        <AvatarAction icon="camera-outline" title="Сделать фото" subtitle="Потребуется разрешение камеры" onPress={() => void chooseImage("camera")} />
        {profile.avatarUrl ? <AvatarAction icon="trash-outline" title="Удалить текущее фото" danger onPress={() => setRemoveConfirm(true)} /> : null}
        {avatarStage === "processing" ? <UploadProgress progress={progress} label="Подготавливаем изображение…" /> : null}
        {avatarError ? <InlineError message={avatarError} /> : null}
        <AxButton label="Отмена" variant="ghost" onPress={() => setAvatarSheet(false)} disabled={avatarStage === "processing"} />
      </View>}
    </AxBottomSheet>
    <AxConfirmSheet visible={removeConfirm} title="Удалить фото профиля?" message="Вместо фотографии снова будут показаны инициалы." confirmLabel="Удалить" danger loading={avatarStage === "uploading"} onClose={() => setRemoveConfirm(false)} onConfirm={() => void removeAvatar()} />
  </View>;
}

const ProfileMenuRow = memo(function ProfileMenuRow({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  return <AxPressable accessibilityLabel={item.title} onPress={onPress} style={styles.menuRow}>
    <View style={[styles.menuIcon, { backgroundColor: item.soft }]}><Ionicons name={item.icon} size={21} color={item.color} /></View>
    <View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.menuTitle}>{item.title}</Text>{item.subtitle ? <Text maxFontSizeMultiplier={1.3} style={styles.menuSubtitle} numberOfLines={2}>{item.subtitle}</Text> : null}</View>
    {item.value ? <Text maxFontSizeMultiplier={1.3} style={styles.menuValue} numberOfLines={1}>{item.value}</Text> : null}<Ionicons name="chevron-forward" size={18} color={axColors.muted} />
  </AxPressable>;
});

export function PersonalDataScreen({ profile, onBack, onSave, onProfileChange }: {
  profile: ProfileData;
  onBack: () => void;
  onSave: (patch: ProfileSaveInput) => Promise<ProfileData>;
  onProfileChange: (profile: ProfileData) => void;
}) {
  const initial = useMemo(() => personalDraft(profile), [profile]);
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const saveRef = useRef(false);
  const reduceMotion = useAxReducedMotion();
  const { width } = useWindowDimensions();
  const stackNameFields = width < 360;
  const errors = useMemo(() => validatePersonal(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const valid = Object.keys(errors).length === 0;

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3600);
    return () => clearTimeout(timer);
  }, [saved]);

  const requestBack = useCallback(() => {
    if (dirty && !saving) setLeaveConfirm(true);
    else onBack();
  }, [dirty, onBack, saving]);

  const save = useCallback(async () => {
    if (!dirty || !valid || saveRef.current) return;
    saveRef.current = true;
    setSaving(true);
    setSaveError(undefined);
    try {
      const bodyMeasurements = objectValue(profile.medicalProfile.bodyMeasurements);
      const next = await onSave({
        firstName: clean(draft.firstName),
        lastName: clean(draft.lastName),
        phone: clean(draft.phone),
        birthDate: displayDateToIso(draft.birthDate),
        gender: draft.gender,
        medicalProfile: { bodyMeasurements: { ...bodyMeasurements, height: clean(draft.height) } },
        appPreferences: { timezone: clean(draft.timezone), units: draft.units }
      });
      onProfileChange(next);
      const nextDraft = personalDraft(next);
      setDraft(nextDraft);
      setBaseline(nextDraft);
      setSaved(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setSaveError(errorMessage(error));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  }, [dirty, draft, onProfileChange, onSave, profile.medicalProfile.bodyMeasurements, valid]);

  const field = (delay: number, children: ReactNode) => <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(delay).duration(220)}>{children}</Animated.View>;
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
    <ScrollView contentContainerStyle={styles.personalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.detailHeader}><AxIconButton icon="arrow-back" label="Назад" tone="neutral" onPress={requestBack} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.detailTitle}>Личные данные</Text><Text maxFontSizeMultiplier={1.3} style={styles.detailSubtitle}>Контакты и параметры для расчётов</Text></View></View>
      <AxCard style={styles.formCard}>
        <View style={[styles.twoColumns, stackNameFields && styles.columnsStack]}><Animated.View entering={reduceMotion ? undefined : FadeIn.duration(220)} style={styles.nameColumn}><ProfileField label="Имя" value={draft.firstName} onChangeText={value => setDraft(current => ({ ...current, firstName: value }))} error={errors.firstName} autoCapitalize="words" maxLength={60} /></Animated.View><Animated.View entering={reduceMotion ? undefined : FadeIn.delay(30).duration(220)} style={styles.nameColumn}><ProfileField label="Фамилия" value={draft.lastName} onChangeText={value => setDraft(current => ({ ...current, lastName: value }))} error={errors.lastName} autoCapitalize="words" maxLength={60} /></Animated.View></View>
        {field(60, <ProfileField label="Дата рождения" value={draft.birthDate} onChangeText={value => setDraft(current => ({ ...current, birthDate: formatBirthDate(value) }))} error={errors.birthDate} placeholder="ДД.ММ.ГГГГ" keyboardType="number-pad" maxLength={10} icon="calendar-outline" />)}
        {field(90, <View><Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>Пол при рождении</Text><View style={styles.genderRow}>{(["male", "female"] as const).map(value => <AxFilterChip key={value} label={value === "male" ? "Мужской" : "Женский"} icon={value === "male" ? "male-outline" : "female-outline"} selected={draft.gender === value} onPress={() => setDraft(current => ({ ...current, gender: value }))} />)}</View></View>)}
        {field(120, <ProfileField label={draft.units === "imperial" ? "Рост, дюймы" : "Рост, см"} value={draft.height} onChangeText={value => setDraft(current => ({ ...current, height: value.replace(/[^\d.,]/g, "") }))} error={errors.height} keyboardType="decimal-pad" icon="resize-outline" />)}
      </AxCard>
      <Text maxFontSizeMultiplier={1.3} style={styles.formSection}>Контакты</Text>
      <AxCard style={styles.formCard}>
        {field(140, <ProfileField label="Телефон" value={draft.phone} onChangeText={value => setDraft(current => ({ ...current, phone: formatPhone(value) }))} error={errors.phone} keyboardType="phone-pad" placeholder="+7 (700) 000-00-00" icon="call-outline" maxLength={18} />)}
        {field(160, <ProfileField label="Email" value={profile.email ?? ""} editable={false} helper="Email меняется через настройки безопасности" icon="mail-outline" />)}
      </AxCard>
      <Text maxFontSizeMultiplier={1.3} style={styles.formSection}>Формат данных</Text>
      <AxCard style={styles.formCard}>
        {field(180, <ProfileField label="Часовой пояс" value={draft.timezone} onChangeText={value => setDraft(current => ({ ...current, timezone: value }))} error={errors.timezone} icon="time-outline" autoCapitalize="none" />)}
        {field(200, <View><Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>Единицы измерения</Text><View style={styles.genderRow}><AxFilterChip label="кг, см" selected={draft.units === "metric"} onPress={() => setDraft(current => ({ ...current, units: "metric" }))} /><AxFilterChip label="lb, in" selected={draft.units === "imperial"} onPress={() => setDraft(current => ({ ...current, units: "imperial" }))} /></View></View>)}
      </AxCard>
      {saveError ? <InlineError message={saveError} /> : null}
      <AxButton label="Сохранить" icon="checkmark" onPress={() => void save()} loading={saving} disabled={!dirty || !valid} style={styles.saveButton} />
      <View style={styles.privacyNote}><Ionicons name="shield-checkmark-outline" size={19} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.privacyText}>Данные используются для вашего профиля и расчётов AxMed.</Text></View>
    </ScrollView>
    <AxConfirmSheet visible={leaveConfirm} title="Есть несохранённые изменения" message="Если выйти сейчас, введённые данные не сохранятся." confirmLabel="Выйти без сохранения" danger onClose={() => setLeaveConfirm(false)} onConfirm={onBack} />
    <AxSnackbar visible={saved} message="Изменения сохранены" tone="success" onDismiss={() => setSaved(false)} />
  </KeyboardAvoidingView>;
}

export function ProfileInfoScreen({ type, onBack }: { type: "help" | "privacy" | "about"; onBack: () => void }) {
  const copy = type === "help" ? {
    title: "Помощь", subtitle: "Короткие ответы о работе AxMed", icon: "help-buoy-outline" as IconName,
    paragraphs: ["Если устройство не синхронизируется, убедитесь, что Bluetooth включён и AxMed получил необходимые разрешения.", "Данные профиля и измерений сохраняются в вашем аккаунте. Ошибку загрузки можно безопасно повторить.", "По вопросам аккаунта обратитесь в службу поддержки через официальный канал AxMed."]
  } : type === "privacy" ? {
    title: "Конфиденциальность", subtitle: "Как AxMed работает с данными", icon: "lock-closed-outline" as IconName,
    paragraphs: ["AxMed использует данные профиля, устройств и измерений для отображения вашей динамики и персональных функций приложения.", "Секретные ключи облачного хранилища находятся только на сервере. Мобильное приложение не получает к ним доступ.", "Вы можете изменить данные профиля или удалить фотографию в любое время. Медицинские показатели не являются медицинским заключением."]
  } : {
    title: "О приложении", subtitle: "AxMed · Версия 1.0.0", icon: "information-circle-outline" as IconName,
    paragraphs: ["AxMed объединяет данные фитнес-браслета, умных весов, целей и привычек в одном спокойном wellness-интерфейсе.", "Приложение помогает наблюдать динамику, но не заменяет консультацию врача.", "© AxMed"]
  };
  return <ScrollView contentContainerStyle={styles.infoContent} showsVerticalScrollIndicator={false}>
    <View style={styles.detailHeader}><AxIconButton icon="arrow-back" label="Назад" tone="neutral" onPress={onBack} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.detailTitle}>{copy.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.detailSubtitle}>{copy.subtitle}</Text></View></View>
    <AxCard style={styles.infoCard}><View style={styles.infoHeroIcon}><Ionicons name={copy.icon} size={32} color={axColors.green} /></View>{copy.paragraphs.map((paragraph, index) => <Text maxFontSizeMultiplier={1.3} key={index} style={styles.infoParagraph}>{paragraph}</Text>)}</AxCard>
  </ScrollView>;
}

function ProfileField({ label, error, helper, icon, ...props }: ComponentProps<typeof TextInput> & { label: string; error?: string; helper?: string; icon?: IconName }) {
  const { dark, colors } = useAxTheme();
  return <View style={styles.field}><Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>{label}</Text><View style={[styles.inputWrap, error && styles.inputError, props.editable === false && styles.inputDisabled]}>{icon ? <Ionicons name={icon} size={19} color={error ? axColors.danger : axColors.muted} /> : null}<TextInput selectionColor={colors.ink} maxFontSizeMultiplier={1.3} {...props} accessibilityLabel={props.accessibilityLabel ?? label} accessibilityHint={error ?? helper} accessibilityState={{ disabled: props.editable === false }} keyboardAppearance={dark ? "dark" : "light"} placeholderTextColor={axColors.muted} style={styles.input} /></View>{error || helper ? <Text maxFontSizeMultiplier={1.3} accessibilityLiveRegion={error ? "polite" : "none"} style={[styles.fieldHelper, error && styles.fieldError]}>{error ?? helper}</Text> : null}</View>;
}

function AvatarAction({ icon, title, subtitle, danger, onPress }: { icon: IconName; title: string; subtitle?: string; danger?: boolean; onPress: () => void }) {
  const color = danger ? axColors.danger : axColors.green;
  const soft = danger ? axColors.dangerSoft : axColors.greenSoft;
  return <AxPressable accessibilityLabel={title} onPress={onPress} style={styles.avatarAction}><View style={[styles.actionIcon, { backgroundColor: soft }]}><Ionicons name={icon} size={22} color={color} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.actionTitle, danger && { color }]}>{title}</Text>{subtitle ? <Text maxFontSizeMultiplier={1.3} style={styles.actionSubtitle}>{subtitle}</Text> : null}</View><Ionicons name="chevron-forward" size={18} color={axColors.muted} /></AxPressable>;
}

function UploadProgress({ progress, label }: { progress: import("react-native-reanimated").SharedValue<number>; label: string }) {
  const style = useAnimatedStyle(() => ({ width: `${Math.max(4, progress.value * 100)}%` }));
  return <View style={styles.uploadBlock}><View style={styles.uploadCopy}><ActivityIndicator size="small" color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.uploadLabel}>{label}</Text></View><View style={styles.uploadTrack}><Animated.View style={[styles.uploadFill, style]} /></View></View>;
}

function InlineError({ message }: { message: string }) { return <View style={styles.inlineError}><Ionicons name="alert-circle-outline" size={19} color={axColors.danger} /><Text maxFontSizeMultiplier={1.3} style={styles.inlineErrorText}>{message}</Text></View>; }
function menu(key: ProfileRoute, icon: IconName, title: string, subtitle: string | undefined, color: string, soft: string, value?: string): MenuItem { return { key, icon, title, subtitle, color, soft, value }; }
function clean(value: string) { return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim() || null; }
function objectValue(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Не удалось выполнить действие. Попробуйте ещё раз."; }
function appendVersion(url: string, version: string) { return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version || String(Date.now()))}`; }
function initials(value: string) { return value.split(/\s+/).map(part => part.replace(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі0-9]/g, "")).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "AX"; }
function themeLabel(value: string) { return value === "dark" ? "Тёмная" : value === "system" ? "Системная" : "Светлая"; }
function formatIsoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

function profileCompletion(profile: ProfileData) {
  const medical = objectValue(profile.medicalProfile.bodyMeasurements);
  const values = [profile.firstName || profile.fullName, profile.lastName, profile.email, profile.phone, profile.birthDate, profile.gender, medical.height, profile.avatarUrl];
  return Math.round(values.filter(Boolean).length / values.length * 100);
}

type PersonalDraft = { firstName: string; lastName: string; phone: string; birthDate: string; gender: "male" | "female"; height: string; timezone: string; units: "metric" | "imperial" };
function personalDraft(profile: ProfileData): PersonalDraft {
  const medical = objectValue(profile.medicalProfile.bodyMeasurements);
  return {
    firstName: profile.firstName ?? splitName(profile.fullName).firstName,
    lastName: profile.lastName ?? splitName(profile.fullName).lastName,
    phone: profile.phone ?? "",
    birthDate: isoDateToDisplay(profile.birthDate),
    gender: profile.gender ?? "female",
    height: typeof medical.height === "string" ? medical.height : "",
    timezone: typeof profile.appPreferences.timezone === "string" ? profile.appPreferences.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Almaty",
    units: profile.appPreferences.units === "imperial" ? "imperial" : "metric"
  };
}
function splitName(value: string | null) { const parts = value?.trim().split(/\s+/).filter(Boolean) ?? []; return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") }; }
function isoDateToDisplay(value: string | null) { if (!value) return ""; const [year, month, day] = value.split("-"); return year && month && day ? `${day}.${month}.${year}` : value; }
function displayDateToIso(value: string) { if (!value) return null; const [day, month, year] = value.split("."); return `${year}-${month}-${day}`; }
function formatBirthDate(value: string) { const digits = value.replace(/\D/g, "").slice(0, 8); return digits.length <= 2 ? digits : digits.length <= 4 ? `${digits.slice(0, 2)}.${digits.slice(2)}` : `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`; }
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^8/, "7").slice(0, 11);
  const normalized = digits.startsWith("7") ? digits : `7${digits}`;
  const rest = normalized.slice(1);
  let result = "+7";
  if (rest.length) result += ` (${rest.slice(0, 3)}`;
  if (rest.length >= 3) result += ")";
  if (rest.length > 3) result += ` ${rest.slice(3, 6)}`;
  if (rest.length > 6) result += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) result += `-${rest.slice(8, 10)}`;
  return result;
}
function validatePersonal(value: PersonalDraft) {
  const errors: Partial<Record<keyof PersonalDraft, string>> = {};
  if (!value.firstName.trim()) errors.firstName = "Укажите имя";
  if (value.firstName.trim().length > 60) errors.firstName = "Не больше 60 символов";
  if (value.lastName.trim().length > 60) errors.lastName = "Не больше 60 символов";
  if (value.phone && value.phone.replace(/\D/g, "").length !== 11) errors.phone = "Введите 11 цифр номера";
  if (value.birthDate) {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.birthDate);
    const date = match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
    if (!match || !date || date.getFullYear() !== Number(match[3]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[1]) || date > new Date()) errors.birthDate = "Проверьте дату рождения";
  }
  if (value.height) {
    const height = Number(value.height.replace(",", "."));
    const [min, max] = value.units === "imperial" ? [31, 98] : [80, 250];
    if (!Number.isFinite(height) || height < min || height > max) errors.height = `Допустимо от ${min} до ${max}`;
  }
  if (!value.timezone.trim() || value.timezone.length > 80) errors.timezone = "Укажите корректный часовой пояс";
  return errors;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: axColors.background }, flex: { flex: 1, minWidth: 0 }, content: { paddingHorizontal: axSpace.x4, paddingTop: axSpace.x3, paddingBottom: 150 },
  profileHero: { marginTop: axSpace.x5, flexDirection: "row", alignItems: "center", gap: axSpace.x3, padding: axSpace.x4 }, avatarButton: { width: 92, height: 92 }, avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: axColors.surfaceMuted }, avatarFallback: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", backgroundColor: axColors.greenSoft }, avatarInitials: { color: axColors.green, fontSize: 25, fontWeight: "800" }, avatarEdit: { position: "absolute", right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: axColors.green, borderWidth: 3, borderColor: axColors.surface }, heroIdentity: { flex: 1, minWidth: 0 }, profileName: { color: axColors.ink, fontSize: 21, lineHeight: 26, fontWeight: "800" }, profileContact: { ...axType.caption, color: axColors.muted, marginTop: 3 }, profileStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: axColors.green }, statusText: { ...axType.caption, color: axColors.green, fontWeight: "700" },
  quickGrid: { flexDirection: "row", gap: axSpace.x2, marginTop: axSpace.x3, marginBottom: axSpace.x7 }, quickCard: { flex: 1, minWidth: 0, padding: axSpace.x3 }, quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, quickValue: { color: axColors.ink, fontSize: 16, fontWeight: "800", marginTop: 8 }, quickLabel: { color: axColors.muted, fontSize: 9, lineHeight: 12, marginTop: 1 }, sectionTitle: { ...axType.section, color: axColors.ink, backgroundColor: axColors.background, paddingTop: axSpace.x3, paddingBottom: axSpace.x2 }, menuRow: { minHeight: 76, borderRadius: axRadius.lg, paddingHorizontal: axSpace.x3, marginBottom: axSpace.x2, flexDirection: "row", alignItems: "center", gap: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line }, menuIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, menuTitle: { ...axType.bodyStrong, color: axColors.ink }, menuSubtitle: { ...axType.caption, color: axColors.muted, marginTop: 2 }, menuValue: { ...axType.caption, color: axColors.muted, maxWidth: 92, fontWeight: "700" }, footer: { paddingTop: axSpace.x4, gap: axSpace.x2 }, version: { ...axType.caption, color: axColors.muted, textAlign: "center" },
  actionList: { gap: axSpace.x2 }, avatarAction: { minHeight: 68, borderRadius: axRadius.lg, padding: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line }, actionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, actionTitle: { ...axType.bodyStrong, color: axColors.ink }, actionSubtitle: { ...axType.caption, color: axColors.muted, marginTop: 2 }, avatarPreview: { alignSelf: "center", width: 180, height: 180, borderRadius: 90, backgroundColor: axColors.surfaceMuted, marginBottom: axSpace.x5 }, sheetActions: { gap: axSpace.x2, marginTop: axSpace.x4 }, uploadBlock: { padding: axSpace.x3, borderRadius: axRadius.md, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line }, uploadCopy: { flexDirection: "row", alignItems: "center", gap: axSpace.x2 }, uploadLabel: { ...axType.caption, color: axColors.text, fontWeight: "700" }, uploadTrack: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: axColors.line, marginTop: axSpace.x3 }, uploadFill: { height: 6, borderRadius: 3, backgroundColor: axColors.green }, successRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: axSpace.x2 }, successText: { ...axType.bodyStrong, color: axColors.green }, inlineError: { minHeight: 50, borderRadius: axRadius.md, padding: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x2, backgroundColor: axColors.dangerSoft }, inlineErrorText: { ...axType.caption, color: axColors.danger, flex: 1 },
  personalContent: { paddingHorizontal: axSpace.x4, paddingTop: axSpace.x3, paddingBottom: axSpace.x8 }, detailHeader: { flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginBottom: axSpace.x5 }, detailTitle: { ...axType.title, color: axColors.ink }, detailSubtitle: { ...axType.body, color: axColors.muted, marginTop: 2 }, formCard: { gap: axSpace.x3, marginBottom: axSpace.x5 }, twoColumns: { flexDirection: "row", gap: axSpace.x2 }, columnsStack: { flexDirection: "column" }, nameColumn: { flex: 1, minWidth: 0 }, field: { flex: 1, minWidth: 0 }, fieldLabel: { ...axType.label, color: axColors.text, marginBottom: 7 }, inputWrap: { minHeight: 52, borderRadius: axRadius.md, paddingHorizontal: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x2, backgroundColor: axColors.surfaceMuted, borderWidth: 1, borderColor: axColors.line }, input: { flex: 1, minWidth: 0, minHeight: 50, color: axColors.ink, fontSize: 14, fontWeight: "600" }, inputError: { borderColor: axColors.danger, backgroundColor: axColors.dangerSoft }, inputDisabled: { opacity: 0.68 }, fieldHelper: { ...axType.caption, color: axColors.muted, marginTop: 5 }, fieldError: { color: axColors.danger }, genderRow: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2 }, formSection: { ...axType.section, color: axColors.ink, marginBottom: axSpace.x3 }, saveButton: { marginTop: axSpace.x2 }, privacyNote: { marginTop: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x2, paddingHorizontal: axSpace.x2 }, privacyText: { ...axType.caption, color: axColors.muted, flex: 1 },
  infoContent: { paddingHorizontal: axSpace.x4, paddingTop: axSpace.x3, paddingBottom: 150 }, infoCard: { padding: axSpace.x5 }, infoHeroIcon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: axColors.greenSoft, marginBottom: axSpace.x5 }, infoParagraph: { ...axType.body, color: axColors.text, fontSize: 14, lineHeight: 22, marginBottom: axSpace.x4 }
});
