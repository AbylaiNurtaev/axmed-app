import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageSourcePropType,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { AuthFlow } from "./src/features/auth/AuthFlow";
import { ConnectedDevicesScreen } from "./src/features/devices/ConnectedDevicesScreen";
import { deviceGateway } from "./src/devices/deviceGateway";
import {
  authenticateWithSocial,
  createProfileGoal,
  deleteProfileGoal,
  loginWithEmail,
  loadProfile,
  loadProfileGoals,
  ProfileData,
  ProfileGoal,
  ProfileGoalInput,
  logout,
  registerWithEmail,
  resendVerificationCode,
  restoreSession,
  saveProfile,
  updateProfileGoal,
  uploadProfileAvatar,
  verifyEmail
} from "./src/features/auth/authApi";

const green = "#00a87e";
const ink = "#071225";
const muted = "#758092";
const line = "#e8edf1";

(Text as unknown as { defaultProps?: { allowFontScaling?: boolean } }).defaultProps = {
  ...(Text as unknown as { defaultProps?: object }).defaultProps,
  allowFontScaling: false
};

type Tab = "home" | "metrics" | "avatar" | "knowledge" | "profile";
type ProfileDetail =
  | "personal"
  | "medical"
  | "reports"
  | "security"
  | "devices"
  | "connectDevice"
  | "general"
  | "notifications"
  | "appearance"
  | "logout"
  | null;

const avatarFront = require("./assets/body-front.png") as ImageSourcePropType;
const homePerson = require("./assets/home-person.png") as ImageSourcePropType;
const comparison = require("./assets/comparison.png") as ImageSourcePropType;

const metrics = [
  { icon: "scale-bathroom", label: "Вес", sub: "Вес", value: "65.4", unit: "кг", delta: "-0.4 кг", color: green, points: [82, 76, 64, 60, 55, 58, 54, 45, 39] },
  { icon: "water-percent", label: "Процент жира", sub: "Жир", value: "24.5", unit: "%", delta: "-1.2 %", color: "#ff5b21", points: [70, 61, 58, 51, 48, 51, 49, 43, 36] },
  { icon: "dumbbell", label: "Мышечная масса", sub: "Вес", value: "27.1", unit: "кг", delta: "+0.6 кг", color: "#df1d58", points: [32, 38, 48, 52, 50, 55, 65, 67, 82] },
  { icon: "water", label: "Вода в организме", sub: "Вода", value: "54.2", unit: "%", delta: "+1.1 %", color: "#1a86df", points: [35, 42, 52, 61, 63, 62, 68, 72, 84] },
  { icon: "stomach", label: "Индекс висцерального жира", sub: "Баллы", value: "6", unit: "", delta: "-1", color: green, points: [68, 56, 54, 49, 50, 46, 43] },
  { icon: "clipboard-pulse-outline", label: "Метаболический возраст", sub: "Возраст", value: "28", unit: "лет", delta: "-2", color: green, points: [69, 55, 51, 53, 50, 43] }
] as const;

function notify(title: string) {
  Alert.alert(title, "Раздел готов как кликабельная заглушка. Позже сюда можно подключить реальные данные и API.");
}

const emptyProfile: ProfileData = {
  id: "",
  email: null,
  displayName: null,
  fullName: null,
  phone: null,
  birthDate: null,
  gender: null,
  avatarUrl: null,
  emailVerified: false,
  medicalProfile: {},
  appPreferences: {
    language: "ru",
    units: "metric",
    region: "Казахстан",
    syncEnabled: true,
    dailyReminders: true,
    waterReminders: true,
    measurementReminders: true,
    recommendations: true,
    theme: "light",
    textSize: "standard",
    accentColor: "green",
    animations: true
  },
  updatedAt: ""
};

const labelMaps = {
  gender: { male: "Мужской", female: "Женский" },
  language: { ru: "Русский", kk: "Қазақша", en: "English" },
  units: { metric: "кг, см", imperial: "lb, in" },
  theme: { light: "Светлая", dark: "Тёмная", system: "Как в системе" },
  textSize: { small: "Компактный", standard: "Стандартный", large: "Крупный" },
  accentColor: { green: "Зелёный", blue: "Синий", rose: "Розовый" }
} as const;

const goalTemplates: ProfileGoalInput[] = [
  { templateKey: "weight", icon: "scale-bathroom", title: "Снизить вес", category: "Состав тела", currentValue: 65.4, targetValue: 60, unit: "кг", progress: 70, color: green },
  { templateKey: "fat", icon: "fire", title: "Снизить процент жира", category: "Состав тела", currentValue: 24.5, targetValue: 22, unit: "%", progress: 40, color: "#ff7a33" },
  { templateKey: "steps", icon: "shoe-sneaker", title: "Ежедневная активность", category: "Активность", currentValue: 6540, targetValue: 8000, unit: "шагов", progress: 82, color: green },
  { templateKey: "water", icon: "water", title: "Пить больше воды", category: "Привычки", currentValue: 6, targetValue: 8, unit: "стаканов", progress: 75, color: "#1a86df" },
  { templateKey: "sleep", icon: "sleep", title: "Спать не меньше 8 часов", category: "Восстановление", currentValue: 6.5, targetValue: 8, unit: "ч", progress: 81, color: "#5b7cfa" },
  { templateKey: "pressure", icon: "heart-pulse", title: "Контроль давления", category: "Здоровье", currentValue: 0, targetValue: 1, unit: "план", progress: 0, color: "#df1d58" }
];

type MeasurementRow = {
  id: string;
  date: string;
  time: string;
  score: number;
  items: { key: string; icon: string; label: string; value: string; color: string; delta: string }[];
};

const measurementRows: MeasurementRow[] = [
  {
    id: "2025-05-24",
    date: "24 мая",
    time: "09:15",
    score: 84,
    items: [
      { key: "weight", icon: "scale-bathroom", label: "Вес", value: "65.4 кг", color: green, delta: "-0.4" },
      { key: "fat", icon: "water-percent", label: "Жир", value: "24.5%", color: "#ff5b21", delta: "-0.5" },
      { key: "muscle", icon: "dumbbell", label: "Мышцы", value: "27.1 кг", color: "#df1d58", delta: "+0.3" },
      { key: "water", icon: "water", label: "Вода", value: "54.2%", color: "#1a86df", delta: "+1.1" }
    ]
  },
  {
    id: "2025-05-17",
    date: "17 мая",
    time: "09:11",
    score: 81,
    items: [
      { key: "weight", icon: "scale-bathroom", label: "Вес", value: "65.8 кг", color: green, delta: "-0.3" },
      { key: "fat", icon: "water-percent", label: "Жир", value: "25.0%", color: "#ff5b21", delta: "-0.5" },
      { key: "muscle", icon: "dumbbell", label: "Мышцы", value: "26.8 кг", color: "#df1d58", delta: "+0.4" },
      { key: "water", icon: "water", label: "Вода", value: "53.1%", color: "#1a86df", delta: "+0.9" }
    ]
  },
  {
    id: "2025-05-10",
    date: "10 мая",
    time: "09:12",
    score: 78,
    items: [
      { key: "weight", icon: "scale-bathroom", label: "Вес", value: "66.1 кг", color: green, delta: "-0.2" },
      { key: "fat", icon: "water-percent", label: "Жир", value: "25.5%", color: "#ff5b21", delta: "-0.5" },
      { key: "muscle", icon: "dumbbell", label: "Мышцы", value: "26.4 кг", color: "#df1d58", delta: "+0.3" },
      { key: "water", icon: "water", label: "Вода", value: "52.2%", color: "#1a86df", delta: "+0.7" }
    ]
  }
];

function messageFromError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Произошла неизвестная ошибка. Попробуйте снова.";
}

// react-native-web's Alert.alert(...) is a no-op stub (see node_modules/react-native-web/src/exports/Alert),
// so on web we fall back to window.alert/window.confirm to keep alerts and confirmations actually working.
function alertMessage(title: string, message?: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}


function ageFromBirthDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const birthDate = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 && age <= 150 ? age : null;
  } catch {
    return null;
  }
}

function mimeTypeFromAsset(fileName: string): "image/jpeg" | "image/png" | "image/webp" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export default function App() {
  const [authComplete, setAuthComplete] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const handleLogout = useCallback(async () => {
    await logout();
    setAuthComplete(false);
  }, []);

  useEffect(() => {
    let active = true;
    restoreSession()
      .then((session) => {
        if (active) setAuthComplete(Boolean(session));
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => { active = false; };
  }, []);

  if (!authReady) {
    return (
      <View style={styles.authLoading}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={green} />
      </View>
    );
  }

  if (!authComplete) {
    return (
      <AuthFlow
        onComplete={() => setAuthComplete(true)}
        onEmailRegister={({ email, password }) => registerWithEmail(email, password)}
        onEmailSignIn={({ email, password }) => loginWithEmail(email, password)}
        onLogout={logout}
        onResendVerification={resendVerificationCode}
        onSaveProfile={saveProfile}
        onSocialAuthenticated={authenticateWithSocial}
        onVerifyEmail={({ email, code }) => verifyEmail(email, code)}
      />
    );
  }

  return <MainApp onLogout={handleLogout} />;
}

function MainApp({ onLogout }: { onLogout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<string | null>(null);
  const [profileDetail, setProfileDetail] = useState<ProfileDetail>(null);
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      setProfile(await loadProfile());
    } catch (error) {
      alertMessage("Профиль", messageFromError(error));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const persistProfile = useCallback(async (patch: Parameters<typeof saveProfile>[0]) => {
    setProfileSaving(true);
    try {
      const next = await saveProfile(patch);
      setProfile(next);
      return next;
    } catch (error) {
      alertMessage("Не удалось сохранить", messageFromError(error));
      throw error;
    } finally {
      setProfileSaving(false);
    }
  }, []);

  const pickAvatar = useCallback(async () => {
    if (avatarUploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alertMessage("Фото профиля", "Разрешите доступ к фото, чтобы обновить аватар.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
      mediaTypes: ["images"],
      quality: 0.85
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const fileName = asset.fileName ?? `profile-${Date.now()}.jpg`;
    setAvatarUploading(true);
    try {
      const dataBase64 = asset.base64 ?? await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64
      });
      const next = await uploadProfileAvatar({
        fileName,
        mimeType: mimeTypeFromAsset(fileName),
        dataBase64
      });
      setProfile(next);
    } catch (error) {
      alertMessage("Не удалось обновить фото", messageFromError(error));
    } finally {
      setAvatarUploading(false);
    }
  }, [avatarUploading]);

  const screen = useMemo(() => {
    if (tab === "home") return <HomeScreen setTab={setTab} open={setSheet} />;
    if (tab === "metrics") return <MetricsScreen />;
    if (tab === "avatar") return <AvatarScreen />;
    if (tab === "knowledge") return <KnowledgeScreen open={setSheet} />;
    if (profileDetail === "medical") return <MedicalContextScreen back={() => setProfileDetail(null)} />;
    if (profileDetail === "reports") return <ReportsScreen back={() => setProfileDetail(null)} open={setSheet} />;
    if (profileDetail === "devices" || profileDetail === "connectDevice") return <ConnectedDevicesScreen onBack={() => setProfileDetail(null)} startPairing={profileDetail === "connectDevice"} />;
    if (profileDetail) return <ProfileDetailScreen type={profileDetail} profile={profile} back={() => setProfileDetail(null)} save={persistProfile} saving={profileSaving} onLogout={onLogout} />;
    return <ProfileScreen profile={profile} loading={profileLoading} saving={profileSaving} avatarUploading={avatarUploading} openDetail={setProfileDetail} onAvatarPress={pickAvatar} refresh={refreshProfile} onLogout={onLogout} />;
  }, [avatarUploading, onLogout, persistProfile, pickAvatar, profile, profileDetail, profileLoading, profileSaving, refreshProfile, tab]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        {screen}
        <TabBar active={tab} onChange={(next) => { setProfileDetail(null); setTab(next); }} />
      </View>
      <Modal visible={!!sheet} animationType="slide" transparent onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.modalShade} onPress={() => setSheet(null)}>
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>{sheet}</Text>
            <Text style={styles.modalText}>Экран-заглушка подключен. Навигация уже работает, данные пока моковые.</Text>
            <Pressable style={styles.primaryButton} onPress={() => setSheet(null)}>
              <Text style={styles.primaryButtonText}>Понятно</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function HomeScreen({ setTab, open }: { setTab: (tab: Tab) => void; open: (title: string) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.heroTitle}>Привет, Айгерим!</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть профиль"
          style={({ pressed }) => [styles.smallAvatar, pressed && styles.avatarPressed]}
          onPress={() => setTab("profile")}
        >
          <Ionicons name="person-outline" size={25} color={green} />
        </Pressable>
      </View>
      <View style={styles.healthCard}>
        <View style={styles.healthCopy}>
          <Text style={styles.cardTitle}>Ваше состояние</Text>
          <Text style={styles.score}><Text>84</Text><Text style={styles.scoreSuffix}> /100</Text></Text>
          <Text style={styles.good}>Хорошо</Text>
          <Pressable style={styles.primaryButton} onPress={() => setTab("metrics")}>
            <Text style={styles.primaryButtonText}>Подробнее</Text>
          </Pressable>
        </View>
        <Gauge value={84} />
        <Image source={homePerson} style={styles.homePerson} resizeMode="contain" />
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} numberOfLines={1}>Ключевые показатели</Text>
      </View>
      <View style={styles.listCard}>
        {metrics.slice(0, 4).map((item, index) => (
          <Pressable key={item.label} style={[styles.metricLine, index === 3 && styles.noBorder]} onPress={() => open(item.label)}>
            <IconTile name={item.icon} color={item.color} />
            <Text style={styles.metricName}>{item.label}</Text>
            <Text style={styles.metricValue}>{item.value} <Text style={styles.metricUnit}>{item.unit}</Text></Text>
            <Text style={[styles.delta, { color: item.delta.startsWith("+") ? green : green }]}>{item.delta}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function MetricsScreen() {
  const [range, setRange] = useState("Месяц");
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Показатели и отчёты" subtitle="История измерений, динамика и персональные отчёты" />
      <Segmented values={["Неделя", "Месяц", "3 месяца", "Год"]} value={range} onChange={setRange} />
      <View style={styles.dateNav}>
        <Ionicons name="chevron-back" size={20} color={muted} />
        <Text style={styles.dateNavText}>1 - 31 мая 2025</Text>
        <Ionicons name="chevron-forward" size={20} color={muted} />
      </View>
      <View style={styles.kpiGrid}>
        {metrics.slice(0, 4).map((item) => (
          <Pressable key={item.label} style={styles.kpiCard} onPress={() => notify(item.label)}>
            <IconTile name={item.icon} color={item.color} compact />
            <Text style={styles.kpiLabel} numberOfLines={3}>{item.label}</Text>
            <Text style={styles.kpiValue}>{item.value} <Text style={styles.kpiUnit}>{item.unit}</Text></Text>
            <Text style={[styles.kpiDelta, { color: item.color }]}>{item.delta}</Text>
            <MiniSparkline points={[...item.points]} color={item.color} />
          </Pressable>
        ))}
      </View>
      <View style={styles.chartCard}>
        <View style={styles.cardTopRow}>
          <View>
            <Text style={styles.panelTitle}>Динамика веса</Text>
            <Text style={styles.legendText}>●  Вес (кг)</Text>
          </View>
          <Pressable style={styles.smallPill} onPress={() => notify("Группировка")}>
            <Text style={styles.smallPillText}>По дням</Text>
            <Ionicons name="chevron-down" size={14} color={muted} />
          </Pressable>
        </View>
        <BigLineChart />
      </View>
      <View style={styles.tableCard}>
        <View style={styles.cardTopRow}>
          <Text style={styles.panelTitle}>История измерений</Text>
          <Pressable onPress={() => notify("История измерений")}>
            <Text style={styles.linkText}>См. все</Text>
          </Pressable>
        </View>
        {[
          ["24 мая 2025", "65.4", "24.5", "27.1", "54.2"],
          ["17 мая 2025", "65.8", "25.0", "26.8", "53.1"],
          ["10 мая 2025", "66.1", "25.5", "26.4", "52.2"]
        ].map((row, index) => (
          <Pressable key={row[0]} style={[styles.tableRow, index === 2 && styles.noBorder]} onPress={() => notify(row[0])}>
            <View style={styles.tableDate}><Text style={styles.tableMain}>{row[0]}</Text><Text style={styles.tableSub}>09:{index === 0 ? "15" : "1" + index}</Text></View>
            <Text style={styles.tableCell}>{row[1]} кг</Text>
            <Text style={styles.tableCell}>{row[2]}%</Text>
            <Text style={styles.tableCell}>{row[3]} кг</Text>
            <Ionicons name="chevron-forward" size={18} color={muted} />
          </Pressable>
        ))}
      </View>
      <View style={styles.listCard}>
        {["Еженедельный отчёт", "Месячный отчёт", "Экспорт данных"].map((item, index) => (
          <Pressable key={item} style={[styles.settingLine, index === 2 && styles.noBorder]} onPress={() => notify(item)}>
            <IconTile name={index === 0 ? "calendar-check" : index === 1 ? "chart-bar" : "download"} color={green} compact />
            <View style={styles.trendInfo}>
              <Text style={styles.settingTitle}>{item}</Text>
              <Text style={styles.trendSub}>{index === 2 ? "Скачать данные в PDF или CSV" : "Краткий обзор изменений"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={muted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function AvatarScreen() {
  const [mode, setMode] = useState<"avatar" | "compare">("avatar");
  const [view, setView] = useState("Вид спереди");
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <TwoTab left="Аватар" right="Сравнение" active={mode === "avatar" ? "left" : "right"} onLeft={() => setMode("avatar")} onRight={() => setMode("compare")} />
      {mode === "avatar" ? (
        <>
          <View style={styles.avatarStage}>
            <View style={styles.avatarStats}>
              {metrics.slice(0, 4).map((item) => (
                <Pressable key={item.label} style={styles.avatarStat} onPress={() => notify(item.label)}>
                  <Text style={styles.avatarStatValue}>{item.value} <Text style={styles.metricUnit}>{item.unit}</Text></Text>
                  <Text style={styles.avatarStatLabel}>{item.label.replace("Процент ", "")}</Text>
                </Pressable>
              ))}
            </View>
            <Image source={avatarFront} style={styles.avatarImage} resizeMode="contain" />
            <View style={styles.avatarTools}>
              {["happy-outline", "body-outline", "shirt-outline"].map((icon, index) => (
                <Pressable key={icon} style={[styles.toolButton, index === 1 && styles.toolButtonActive]} onPress={() => notify("Настройка аватара")}>
                  <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={28} color={index === 1 ? "#fff" : "#2d3848"} />
                </Pressable>
              ))}
            </View>
          </View>
          <Segmented values={["Вид спереди", "Вид сзади"]} value={view} onChange={setView} />
        </>
      ) : (
        <>
          <Segmented values={["Визуально", "Показатели"]} value="Визуально" onChange={() => undefined} />
          <Image source={comparison} style={styles.compareImage} resizeMode="contain" />
          <View style={styles.listCard}>
            <Text style={styles.cardTitle}>Вы стали лучше!</Text>
            {["Вес -3.3 кг", "Жир -2.1%", "Мышцы +1.2 кг"].map((label, index) => (
              <Text key={label} style={[styles.compareLine, index === 2 && styles.noBorder]}>{label}</Text>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function KnowledgeScreen({ open }: { open: (title: string) => void }) {
  const items = ["Питание и баланс", "Сон и восстановление", "Тренировки", "Профилактика", "Вопросы врачу"];
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.heroTitle}>База знаний</Text>
      <Text style={styles.subtitle}>Короткие материалы и рекомендации под ваши цели</Text>
      {items.map((item, index) => (
        <Pressable key={item} style={styles.articleCard} onPress={() => open(item)}>
          <IconTile name={index % 2 ? "book-open-page-variant" : "heart-pulse"} color={index % 2 ? "#1a86df" : green} />
          <View style={styles.trendInfo}>
            <Text style={styles.trendTitle}>{item}</Text>
            <Text style={styles.trendSub}>5 мин чтения</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ProfileScreen({
  profile,
  loading,
  saving,
  avatarUploading,
  openDetail,
  onAvatarPress,
  refresh,
  onLogout
}: {
  profile: ProfileData;
  loading: boolean;
  saving: boolean;
  avatarUploading: boolean;
  openDetail: (detail: ProfileDetail) => void;
  onAvatarPress: () => void;
  refresh: () => void;
  onLogout: () => Promise<void>;
}) {
  const displayName = profile.fullName || profile.displayName || "Не указано";
  const age = ageFromBirthDate(profile.birthDate);
  const gender = profile.gender ? labelMaps.gender[profile.gender] : null;
  const metaLine = [age ? `${age} ${pluralizeYears(age)}` : null, gender].filter(Boolean).join("  •  ") || "Заполните личные данные";
  const themeLabel = labelMaps.theme[(profile.appPreferences.theme as keyof typeof labelMaps.theme) ?? "light"];

  const bracelet = deviceGateway.forKind("fitness-band");
  const connection = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const connectedDeviceCount = connection.phase === "connected" ? 1 : 0;

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  };

  if (loading && !profile.id) {
    return (
      <View style={styles.profileLoadingScreen}>
        <ActivityIndicator size="large" color={green} />
        <Text style={styles.profileLoadingText}>Загружаем профиль...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={green} colors={[green]} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.heroTitle}>Профиль</Text>
          <Text style={styles.subtitle}>Управляйте своими данными{"\n"}и настройками</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Изменить фото профиля"
          onPress={onAvatarPress}
          disabled={avatarUploading}
          style={({ pressed }) => [styles.profileAvatarWrap, pressed && styles.avatarPressed]}
        >
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.profileAvatarImage} />
          ) : (
            <View style={styles.profileAvatar}>
              <Ionicons name="person-outline" size={40} color={green} />
            </View>
          )}
          {avatarUploading ? (
            <View style={styles.avatarUploadOverlay}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          ) : (
            <View style={styles.editBadge}>
              <Ionicons name="pencil" size={14} color="#fff" />
            </View>
          )}
        </Pressable>
      </View>

      {/* User card -> opens personal data editing */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Редактировать личные данные"
        style={({ pressed }) => [styles.userCard, pressed && styles.userCardPressed]}
        onPress={() => openDetail("personal")}
      >
        <View style={styles.userCardIcon}>
          <Ionicons name="person-outline" size={30} color={green} />
        </View>
        <View style={styles.userCardInfo}>
          <View style={styles.userCardNameRow}>
            <Text style={styles.userCardName} numberOfLines={1}>{displayName}</Text>
            {saving && <ActivityIndicator color={green} size="small" style={styles.userCardSyncSpinner} />}
          </View>
          <Text style={styles.userCardMeta}>{metaLine}</Text>
          <Text style={styles.userCardContact} numberOfLines={1}>{profile.email ?? "Email не указан"}</Text>
          <Text style={styles.userCardContact} numberOfLines={1}>{profile.phone ?? "Телефон не указан"}</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={muted} />
      </Pressable>

      {/* Здоровье */}
      <Text style={styles.sectionLabel}>Здоровье</Text>
      <ProfileSection>
        <ProfileMenuItem
          icon="heart-outline"
          title="Медицинский контекст"
          subtitle="Цели, состояние, ограничения, лекарства"
          onPress={() => openDetail("medical")}
          showDivider
        />
        <ProfileMenuItem
          icon="clipboard-outline"
          title="Показатели и отчёты"
          subtitle="История измерений и экспорт данных"
          onPress={() => openDetail("reports")}
          showDivider
        />
        <ProfileMenuItem
          icon="shield-checkmark-outline"
          title="Согласия и безопасность"
          subtitle="Ваши данные и разрешения"
          onPress={() => openDetail("security")}
        />
      </ProfileSection>

      {/* Устройства */}
      <Text style={styles.sectionLabel}>Устройства</Text>
      <ProfileSection>
        <ProfileMenuItem
          icon="watch-outline"
          title="Подключённые устройства"
          subtitle="Весы, часы, браслеты и приложения"
          rightContent={connectedDeviceCount > 0 ? <View style={styles.deviceBadge}><Text style={styles.deviceBadgeText}>{connectedDeviceCount}</Text></View> : null}
          onPress={() => openDetail("devices")}
          showDivider
        />
        <ProfileMenuItem
          icon="wifi"
          title="Подключить устройство"
          subtitle="Добавить новое устройство"
          onPress={() => openDetail("connectDevice")}
        />
      </ProfileSection>

      {/* Настройки */}
      <Text style={styles.sectionLabel}>Настройки</Text>
      <ProfileSection>
        <ProfileMenuItem
          icon="settings-outline"
          title="Общие настройки"
          subtitle="Язык, единицы измерения, уведомления"
          onPress={() => openDetail("general")}
          showDivider
        />
        <ProfileMenuItem
          icon="notifications-outline"
          title="Уведомления"
          subtitle="Напоминания, рекомендации, обновления"
          onPress={() => openDetail("notifications")}
          showDivider
        />
        <ProfileMenuItem
          icon="moon-outline"
          title="Внешний вид"
          subtitle="Тема, размер текста"
          rightContent={<Text style={styles.menuRightLabel}>{themeLabel}</Text>}
          onPress={() => openDetail("appearance")}
        />
      </ProfileSection>

      {/* Logout Button */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.logoutCardButton, pressed && styles.logoutCardButtonPressed]}
        onPress={() => setLogoutConfirmOpen(true)}
      >
        <Ionicons name="log-out-outline" size={20} color="#f12f35" />
        <Text style={styles.logoutCardButtonText}>Выйти из аккаунта</Text>
      </Pressable>

      {/* Footer */}
      <Text style={styles.footerVersion}>AxMed  •  Версия {Constants.expoConfig?.version ?? "1.0.0"}</Text>

      <Modal visible={logoutConfirmOpen} animationType="fade" transparent onRequestClose={() => setLogoutConfirmOpen(false)}>
        <View style={styles.confirmShade}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="log-out-outline" size={26} color="#f12f35" />
            </View>
            <Text style={styles.confirmTitle}>Выйти из аккаунта?</Text>
            <Text style={styles.confirmText}>Вы уверены, что хотите выйти из аккаунта?</Text>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                disabled={loggingOut}
                style={({ pressed }) => [styles.confirmCancelButton, pressed && styles.confirmCancelButtonPressed]}
                onPress={() => setLogoutConfirmOpen(false)}
              >
                <Text style={styles.confirmCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={loggingOut}
                style={({ pressed }) => [styles.confirmDangerButton, pressed && styles.confirmDangerButtonPressed]}
                onPress={() => void confirmLogout()}
              >
                {loggingOut ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmDangerText}>Выйти</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function pluralizeYears(age: number) {
  const mod10 = age % 10;
  const mod100 = age % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "года";
  return "лет";
}

function ProfileSection({ children }: { children: ReactNode }) {
  return <View style={styles.menuGroupCard}>{children}</View>;
}

function ProfileMenuItem({
  icon,
  title,
  subtitle,
  rightContent,
  onPress,
  showDivider = false,
  danger = false,
  disabled = false,
  loading = false
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  rightContent?: ReactNode;
  onPress: () => void;
  showDivider?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || loading}
        style={({ pressed }) => [styles.menuRow, pressed && !disabled && styles.menuRowPressed, disabled && styles.menuRowDisabled]}
        onPress={onPress}
      >
        <View style={[styles.menuRowIcon, danger && styles.menuRowIconDanger]}>
          <Ionicons name={icon} size={22} color={danger ? "#f12f35" : green} />
        </View>
        <View style={styles.menuRowContent}>
          <Text style={[styles.menuRowTitle, danger && styles.menuRowTitleDanger]}>{title}</Text>
          {!!subtitle && <Text style={styles.menuRowSubtitle} numberOfLines={2}>{subtitle}</Text>}
        </View>
        {loading ? <ActivityIndicator color={muted} size="small" /> : rightContent}
        <Ionicons name="chevron-forward" size={20} color={muted} />
      </Pressable>
      {showDivider && <View style={styles.menuRowDivider} />}
    </>
  );
}

function ProfileDetailScreen({
  type,
  profile,
  back,
  save,
  saving,
  onLogout
}: {
  type: Exclude<ProfileDetail, "medical" | "reports" | "devices" | null>;
  profile: ProfileData;
  back: () => void;
  save: (patch: Parameters<typeof saveProfile>[0]) => Promise<ProfileData>;
  saving: boolean;
  onLogout: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    fullName: profile.fullName ?? profile.displayName ?? "",
    phone: profile.phone ?? "",
    birthDate: profile.birthDate ?? "",
    gender: profile.gender ?? "female" as "male" | "female"
  });
  const preferences = profile.appPreferences;

  if (type === "personal") {
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <DetailHeader title="Личные данные" subtitle="Основная информация, контакты и параметры профиля" back={back} />
        <View style={styles.formCard}>
          <ProfileInput
            label="Полное имя"
            icon="account-outline"
            value={draft.fullName}
            placeholder="Иван Иванов"
            onChange={(fullName) => setDraft((current) => ({ ...current, fullName }))}
          />
          <ProfileInput
            label="Номер телефона"
            icon="phone-outline"
            value={draft.phone}
            keyboardType="phone-pad"
            placeholder="+7 (999) 999-99-99"
            onChange={(phone) => setDraft((current) => ({ ...current, phone }))}
          />
          <ProfileInput
            label="Дата рождения"
            icon="calendar-outline"
            value={draft.birthDate}
            placeholder="YYYY-MM-DD"
            onChange={(birthDate) => setDraft((current) => ({ ...current, birthDate }))}
          />
          <Text style={styles.inputLabel}>Пол при рождении</Text>
          <View style={styles.choiceRow}>
            {(["male", "female"] as const).map((gender) => (
              <Pressable
                key={gender}
                style={[styles.choiceButton, draft.gender === gender && styles.choiceButtonActive]}
                onPress={() => setDraft((current) => ({ ...current, gender }))}
              >
                <MaterialCommunityIcons
                  name={gender === "female" ? "gender-female" : "gender-male"}
                  size={22}
                  color={draft.gender === gender ? "#fff" : green}
                />
                <Text style={[styles.choiceText, draft.gender === gender && styles.choiceTextActive]}>
                  {labelMaps.gender[gender]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable
          disabled={saving}
          style={[styles.primaryButton, styles.saveButton, saving && styles.buttonDisabled]}
          onPress={() => void save({ ...draft, birthDate: draft.birthDate || null })}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Сохранить</Text>
          )}
        </Pressable>
        <Pressable style={styles.infoBanner} onPress={() => undefined}>
          <IconTile name="shield-check-outline" color={green} compact />
          <View style={styles.trendInfo}>
            <Text style={styles.settingTitle}>Конфиденциальность</Text>
            <Text style={styles.trendSub}>Ваши данные защищены и используются только для персональных рекомендаций.</Text>
          </View>
        </Pressable>
      </ScrollView>
    );
  }

  if (type === "general" || type === "notifications" || type === "appearance") {
    const config = settingsPageCopy(type);
    const language = preferenceString(preferences.language, "ru");
    const units = preferenceString(preferences.units, "metric");
    const region = preferenceString(preferences.region, "Казахстан");
    const theme = preferenceString(preferences.theme, "light");
    const textSize = preferenceString(preferences.textSize, "standard");
    const accentColor = preferenceString(preferences.accentColor, "green");
    const accent = accentColorValue(accentColor);
    const previewIsDark = theme === "dark";
    const previewFontSize = textSize === "large" ? 18 : textSize === "small" ? 13 : 15;
    const updatePreference = (key: string, value: string | boolean) => {
      void save({ appPreferences: { [key]: value } });
    };

    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <DetailHeader title={config.title} subtitle={config.subtitle} back={back} />
        {type === "general" && (
          <View style={styles.settingsCard}>
            <SettingsChoiceGroup
              title="Язык приложения"
              subtitle="Тексты интерфейса будут открываться на выбранном языке"
              value={language}
              accent={green}
              disabled={saving}
              options={[
                { value: "ru", label: labelMaps.language.ru },
                { value: "kk", label: labelMaps.language.kk },
                { value: "en", label: labelMaps.language.en }
              ]}
              onChange={(value) => updatePreference("language", value)}
            />
            <SettingsChoiceGroup
              title="Единицы измерения"
              subtitle="Вес, рост и окружности в привычном формате"
              value={units}
              accent={green}
              disabled={saving}
              options={[
                { value: "metric", label: labelMaps.units.metric },
                { value: "imperial", label: labelMaps.units.imperial }
              ]}
              onChange={(value) => updatePreference("units", value)}
            />
            <SettingsChoiceGroup
              title="Регион"
              subtitle="Нужен для локальных форматов и рекомендаций"
              value={region}
              accent={green}
              disabled={saving}
              options={[
                { value: "Казахстан", label: "Казахстан" },
                { value: "СНГ", label: "СНГ" },
                { value: "Другое", label: "Другое" }
              ]}
              onChange={(value) => updatePreference("region", value)}
            />
            <SettingsSwitchRow
              title="Синхронизация профиля"
              subtitle="Сохранять изменения аккаунта и настроек на сервере"
              value={preferences.syncEnabled !== false}
              disabled={saving}
              onChange={(value) => updatePreference("syncEnabled", value)}
            />
          </View>
        )}
        {type === "notifications" && (
          <View style={styles.settingsCard}>
            <SettingsSwitchRow
              title="Ежедневные напоминания"
              subtitle="Мягкое напоминание открыть AxMed и сверить состояние"
              value={preferences.dailyReminders !== false}
              disabled={saving}
              onChange={(value) => updatePreference("dailyReminders", value)}
            />
            <SettingsSwitchRow
              title="Напоминания о воде"
              subtitle="Подсказки по питьевому режиму в течение дня"
              value={preferences.waterReminders !== false}
              disabled={saving}
              onChange={(value) => updatePreference("waterReminders", value)}
            />
            <SettingsSwitchRow
              title="Измерения"
              subtitle="Напоминать о весах, браслете и плановых замерах"
              value={preferences.measurementReminders !== false}
              disabled={saving}
              onChange={(value) => updatePreference("measurementReminders", value)}
            />
            <SettingsSwitchRow
              title="Рекомендации"
              subtitle="Показывать персональные советы по профилю здоровья"
              value={preferences.recommendations !== false}
              disabled={saving}
              onChange={(value) => updatePreference("recommendations", value)}
              last
            />
          </View>
        )}
        {type === "appearance" && (
          <>
            <View style={[styles.appearancePreview, previewIsDark && styles.appearancePreviewDark]}>
              <View style={[styles.appearancePreviewIcon, { backgroundColor: `${accent}1f` }]}>
                <Ionicons name="color-palette-outline" size={24} color={accent} />
              </View>
              <View style={styles.trendInfo}>
                <Text style={[styles.appearancePreviewTitle, previewIsDark && styles.appearancePreviewTitleDark, { fontSize: previewFontSize + 2 }]}>
                  {labelMaps.theme[theme as keyof typeof labelMaps.theme] ?? "Светлая"} тема
                </Text>
                <Text style={[styles.appearancePreviewText, previewIsDark && styles.appearancePreviewTextDark, { fontSize: previewFontSize }]}>
                  Акцент, размер текста и анимации применяются к профилю и сохраняются в аккаунте.
                </Text>
              </View>
              <View style={[styles.appearanceAccentDot, { backgroundColor: accent }]} />
            </View>
            <View style={styles.settingsCard}>
              <SettingsChoiceGroup
                title="Тема"
                subtitle="Внешний вид раздела профиля"
                value={theme}
                accent={accent}
                disabled={saving}
                options={[
                  { value: "light", label: labelMaps.theme.light },
                  { value: "dark", label: labelMaps.theme.dark },
                  { value: "system", label: labelMaps.theme.system }
                ]}
                onChange={(value) => updatePreference("theme", value)}
              />
              <SettingsChoiceGroup
                title="Размер текста"
                subtitle="Подберите комфортную плотность интерфейса"
                value={textSize}
                accent={accent}
                disabled={saving}
                options={[
                  { value: "small", label: labelMaps.textSize.small },
                  { value: "standard", label: labelMaps.textSize.standard },
                  { value: "large", label: labelMaps.textSize.large }
                ]}
                onChange={(value) => updatePreference("textSize", value)}
              />
              <SettingsChoiceGroup
                title="Цвет акцента"
                subtitle="Цвет активных переключателей и preview"
                value={accentColor}
                accent={accent}
                disabled={saving}
                options={[
                  { value: "green", label: labelMaps.accentColor.green },
                  { value: "blue", label: labelMaps.accentColor.blue },
                  { value: "rose", label: labelMaps.accentColor.rose }
                ]}
                onChange={(value) => updatePreference("accentColor", value)}
              />
              <SettingsSwitchRow
                title="Плавные анимации"
                subtitle="Микроанимации на кнопках и переключателях профиля"
                value={preferences.animations !== false}
                disabled={saving}
                onChange={(value) => updatePreference("animations", value)}
                last
              />
            </View>
          </>
        )}
        {saving && (
          <View style={styles.inlineSaving}>
            <ActivityIndicator color={green} size="small" />
            <Text style={styles.inlineSavingText}>Сохраняем изменения...</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  const config = profileStaticConfig(type, profile);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <DetailHeader title={config.title} subtitle={config.subtitle} back={back} />
      <View style={styles.listCard}>
        {config.rows.map(([icon, title, sub, badge], index) => (
          <Pressable
            key={title}
            style={[styles.settingLine, index === config.rows.length - 1 && styles.noBorder]}
            onPress={() => type === "logout" && title.includes("Выйти") ? void onLogout() : undefined}
          >
            <IconTile name={icon} color={title.includes("Выйти") ? "#f12f35" : green} compact />
            <View style={styles.trendInfo}>
              <Text style={styles.settingTitle}>{title}</Text>
              <Text style={styles.trendSub} numberOfLines={2}>{sub}</Text>
            </View>
            {!!badge && <Text style={styles.countBadge}>{badge}</Text>}
            <Ionicons name="chevron-forward" size={18} color={muted} />
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.infoBanner} onPress={() => notify(config.title)}>
        <IconTile name="information-outline" color={green} compact />
        <View style={styles.trendInfo}>
          <Text style={styles.settingTitle}>Важно</Text>
          <Text style={styles.trendSub}>{config.banner}</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

function settingsPageCopy(type: "general" | "notifications" | "appearance") {
  if (type === "general") {
    return { title: "Общие настройки", subtitle: "Язык, единицы измерения, регион и синхронизация" };
  }
  if (type === "notifications") {
    return { title: "Уведомления", subtitle: "Напоминания, рекомендации и плановые измерения" };
  }
  return { title: "Внешний вид", subtitle: "Тема, размер текста, цвет акцента и анимации" };
}

function preferenceString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function accentColorValue(value: string) {
  if (value === "blue") return "#1a86df";
  if (value === "rose") return "#df1d58";
  return green;
}

function profileStaticConfig(type: string, profile: ProfileData) {
  if (type === "security") {
    return {
      title: "Согласия и безопасность",
      subtitle: "Ваши данные и разрешения",
      rows: [
        ["shield-check-outline", "Двухфакторная аутентификация", "Не включена", ""],
        ["lock-outline", "История входов", "Последний вход: сегодня", ""],
        ["file-document-outline", "Условия и согласия", "Приняты при регистрации", ""],
      ],
      banner: "Ваша учётная запись защищена. Используйте надёжный пароль и двухфакторную аутентификацию."
    };
  }
  if (type === "logout") {
    return {
      title: "Выход",
      subtitle: "Завершить сеанс",
      rows: [
        ["log-out-outline", "Выйти из аккаунта", "Вход требуется на всех устройствах", ""],
      ],
      banner: "Вы выйдете из приложения на всех устройствах."
    };
  }
  return {
    title: type,
    subtitle: "",
    rows: [],
    banner: ""
  };
}

function SettingsChoiceGroup({
  title,
  subtitle,
  value,
  options,
  accent,
  disabled,
  onChange
}: {
  title: string;
  subtitle: string;
  value: string;
  options: { value: string; label: string }[];
  accent: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.settingsControlBlock}>
      <View style={styles.settingsControlHeader}>
        <Text style={styles.settingsControlTitle}>{title}</Text>
        <Text style={styles.settingsControlSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.settingsSegmented}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              disabled={disabled}
              style={[
                styles.settingsSegment,
                active && { backgroundColor: accent, borderColor: accent },
                disabled && styles.settingsControlDisabled
              ]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.settingsSegmentText, active && styles.settingsSegmentTextActive]} numberOfLines={2}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SettingsSwitchRow({
  title,
  subtitle,
  value,
  disabled,
  onChange,
  last = false
}: {
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.settingsSwitchRow, last && styles.noBorder]}>
      <View style={styles.trendInfo}>
        <Text style={styles.settingsControlTitle}>{title}</Text>
        <Text style={styles.settingsControlSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: "#d5dbe3", true: "#9ee7d1" }}
        thumbColor={value ? green : "#fff"}
        ios_backgroundColor="#d5dbe3"
      />
    </View>
  );
}

function MedicalContextScreen({ back }: { back: () => void }) {
  const open = (title: string) => {
    Alert.alert(title, "Раздел готов как кликабельная заглушка. Позже сюда можно подключить реальные данные и API.");
  };
  const [goals, setGoals] = useState<ProfileGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<ProfileGoal | null>(null);
  const [draft, setDraft] = useState(goalDraftFromInput({ title: "", targetValue: 1, currentValue: 0, unit: "", progress: 0 }));
  const [customGoalMode, setCustomGoalMode] = useState(false);

  const refreshGoals = useCallback(async () => {
    setLoading(true);
    try {
      setGoals(await loadProfileGoals());
    } catch (error) {
      alertMessage("Цели", messageFromError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGoals();
  }, [refreshGoals]);

  const openCreate = (template?: ProfileGoalInput) => {
    setEditingGoal(null);
    setDraft(goalDraftFromInput(template ?? {
      title: "",
      category: "Здоровье",
      icon: "flag-checkered",
      color: green,
      currentValue: 0,
      targetValue: 1,
      unit: "",
      progress: 0
    }));
    setCustomGoalMode(Boolean(template));
    setEditorOpen(true);
  };

  const openEdit = (goal: ProfileGoal) => {
    setEditingGoal(goal);
    setDraft(goalDraftFromInput(goal));
    setCustomGoalMode(true);
    setEditorOpen(true);
  };

  const saveGoal = async () => {
    const input = goalInputFromDraft(draft);
    if (!input.title.trim()) {
      alertMessage("Цель", "Напишите название цели.");
      return;
    }
    setSaving(true);
    try {
      if (editingGoal) {
        const updated = await updateProfileGoal(editingGoal.id, input);
        setGoals((current) => current.map((goal) => goal.id === updated.id ? updated : goal));
      } else {
        const created = await createProfileGoal(input);
        setGoals((current) => [created, ...current]);
      }
      setEditorOpen(false);
    } catch (error) {
      alertMessage("Не удалось сохранить цель", messageFromError(error));
    } finally {
      setSaving(false);
    }
  };

  const removeGoal = async () => {
    if (!editingGoal) return;
    setSaving(true);
    try {
      await deleteProfileGoal(editingGoal.id);
      setGoals((current) => current.filter((goal) => goal.id !== editingGoal.id));
      setEditorOpen(false);
    } catch (error) {
      alertMessage("Не удалось удалить цель", messageFromError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <DetailHeader title="Медицинский контекст" subtitle="Ваши цели, привычки и важная информация для персональных рекомендаций" back={back} />
        <View style={styles.blockHeaderRow}>
          <Text style={styles.panelTitle}>Мои цели</Text>
          <Pressable style={styles.squareAction} onPress={() => openCreate()}>
            <Ionicons name="add" size={24} color={green} />
          </Pressable>
        </View>
        <View style={styles.listCard}>
          {loading ? (
            <View style={styles.goalEmptyState}>
              <ActivityIndicator color={green} />
              <Text style={styles.trendSub}>Загружаем цели...</Text>
            </View>
          ) : goals.length === 0 ? (
            <View style={styles.goalEmptyState}>
              <IconTile name="target" color={green} />
              <Text style={styles.goalEmptyTitle}>Пока нет целей</Text>
              <Text style={styles.goalEmptyText}>Создайте первую цель: из шаблона или вручную.</Text>
              <Pressable style={styles.goalInlineButton} onPress={() => openCreate()}>
                <Text style={styles.goalInlineButtonText}>Создать цель</Text>
              </Pressable>
            </View>
          ) : goals.map((goal, index) => (
            <Pressable key={goal.id} style={[styles.goalRow, index === goals.length - 1 && styles.noBorder]} onPress={() => openEdit(goal)}>
              <IconTile name={goal.icon} color={goal.color} />
              <View style={styles.goalContent}>
                <View style={styles.goalTitleRow}>
                  <Text style={styles.goalTitle} numberOfLines={2}>{goal.title}</Text>
                  {goal.status === "completed" && <Text style={styles.goalDoneBadge}>Готово</Text>}
                </View>
                <Text style={styles.goalValue}>{formatGoalValue(goal)}</Text>
                <ProgressBar progress={goal.progress} color={goal.color} />
              </View>
              <Text style={[styles.goalPercent, { color: goal.color }]}>{goal.progress}%</Text>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </Pressable>
          ))}
        </View>
        <Text style={styles.groupTitle}>Дополнительно</Text>
        <View style={styles.listCard}>
          {[
            ["heart-pulse", "Хронические заболевания", "Добавить или просмотреть", "0"],
            ["pill", "Регулярные лекарства", "1 препарат", "1"],
            ["flower-outline", "Аллергии и непереносимости", "Не указано", "0"],
            ["clipboard-text-outline", "Последний медицинский чек-ап", "12 мая 2025", ""]
          ].map(([icon, title, sub, count], index) => (
            <Pressable key={title} style={[styles.settingLine, index === 3 && styles.noBorder]} onPress={() => open(title)}>
              <IconTile name={icon} color={green} compact />
              <View style={styles.trendInfo}>
                <Text style={styles.settingTitle}>{title}</Text>
                <Text style={styles.trendSub}>{sub}</Text>
              </View>
              {!!count && <Text style={styles.countBadge}>{count}</Text>}
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.infoBanner} onPress={() => open("Конфиденциальность")}>
          <IconTile name="shield-lock-outline" color={green} compact />
          <View style={styles.trendInfo}>
            <Text style={styles.settingTitle}>Конфиденциальность</Text>
            <Text style={styles.trendSub}>Ваши данные защищены и используются только для персонализации.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={muted} />
        </Pressable>
      </ScrollView>
      <Modal visible={editorOpen} animationType="slide" transparent onRequestClose={() => setEditorOpen(false)}>
        <Pressable style={styles.modalShade} onPress={() => !saving && setEditorOpen(false)}>
          <Pressable style={styles.goalEditorCard}>
            <ScrollView contentContainerStyle={styles.goalEditorScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.cardTopRow}>
                <Text style={styles.modalTitle}>{editingGoal ? "Редактировать цель" : "Создать цель"}</Text>
                <Pressable style={styles.squareAction} disabled={saving} onPress={() => setEditorOpen(false)}>
                  <Ionicons name="close" size={22} color={muted} />
                </Pressable>
              </View>
              {!editingGoal && (
                <>
                  <Text style={styles.goalCreateLead}>Выберите готовую цель или настройте свою.</Text>
                  <View style={styles.goalTemplateGrid}>
                    {goalTemplates.map((template) => {
                      const active = draft.templateKey === template.templateKey && !customGoalMode;
                      return (
                        <Pressable
                          key={template.templateKey}
                          style={[styles.goalTemplateCard, active && styles.goalTemplateCardActive]}
                          onPress={() => {
                            setCustomGoalMode(false);
                            setDraft(goalDraftFromInput(template));
                          }}
                        >
                          <IconTile name={template.icon ?? "flag-checkered"} color={template.color ?? green} compact />
                          <View style={styles.trendInfo}>
                            <Text style={styles.goalTemplateTitle} numberOfLines={2}>{template.title}</Text>
                            <Text style={styles.goalTemplateSub}>{template.targetValue} {template.unit}</Text>
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={20} color={green} />}
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    style={[styles.customGoalButton, customGoalMode && styles.customGoalButtonActive]}
                    onPress={() => {
                      setCustomGoalMode(true);
                      setDraft(goalDraftFromInput({
                        title: "",
                        category: "Здоровье",
                        icon: "flag-checkered",
                        color: green,
                        currentValue: 0,
                        targetValue: 1,
                        unit: "",
                        progress: 0
                      }));
                    }}
                  >
                    <IconTile name="pencil-outline" color={customGoalMode ? green : muted} compact />
                    <View style={styles.trendInfo}>
                      <Text style={styles.settingTitle}>Своя цель</Text>
                      <Text style={styles.trendSub}>Название, единицы и прогресс вручную</Text>
                    </View>
                    <Ionicons name={customGoalMode ? "checkmark-circle" : "chevron-forward"} size={20} color={customGoalMode ? green : muted} />
                  </Pressable>
                </>
              )}
              <GoalEditorInput label="Название" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} />
              <View style={styles.goalEditorRow}>
                <GoalEditorInput rowItem label="Сейчас" value={draft.currentValue} keyboardType="decimal-pad" onChange={(currentValue) => setDraft((current) => ({ ...current, currentValue }))} />
                <GoalEditorInput rowItem label="Цель" value={draft.targetValue} keyboardType="decimal-pad" onChange={(targetValue) => setDraft((current) => ({ ...current, targetValue }))} />
              </View>
              <View style={styles.goalEditorRow}>
                <GoalEditorInput rowItem label="Единица" value={draft.unit} onChange={(unit) => setDraft((current) => ({ ...current, unit }))} />
                <GoalEditorInput rowItem label="Прогресс %" value={draft.progress} keyboardType="number-pad" onChange={(progress) => setDraft((current) => ({ ...current, progress }))} />
              </View>
              <Text style={styles.inputLabel}>Статус</Text>
              <View style={styles.choiceRow}>
                {[
                  ["active", "Активна"],
                  ["paused", "Пауза"],
                  ["completed", "Готово"]
                ].map(([status, label]) => (
                  <Pressable
                    key={status}
                    style={[styles.choiceButton, draft.status === status && styles.choiceButtonActive]}
                    onPress={() => setDraft((current) => ({ ...current, status: status as ProfileGoal["status"] }))}
                  >
                    <Text style={[styles.choiceText, draft.status === status && styles.choiceTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable disabled={saving} style={[styles.primaryButton, styles.saveButton, saving && styles.buttonDisabled]} onPress={() => void saveGoal()}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryButtonText}>Сохранить</Text>}
              </Pressable>
              {editingGoal && (
                <Pressable disabled={saving} style={[styles.goalDeleteButton, saving && styles.buttonDisabled]} onPress={() => void removeGoal()}>
                  <Ionicons name="trash-outline" size={18} color="#f12f35" />
                  <Text style={styles.goalDeleteText}>Удалить цель</Text>
                </Pressable>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function GoalEditorInput({
  label,
  value,
  keyboardType,
  rowItem,
  onChange
}: {
  label: string;
  value: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  rowItem?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={[styles.goalEditorInputWrap, rowItem && styles.goalEditorInputWrapRow]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        keyboardType={keyboardType ?? "default"}
        onChangeText={onChange}
        placeholderTextColor="#a5adba"
        style={styles.goalEditorInput}
      />
    </View>
  );
}

function goalDraftFromInput(goal: ProfileGoalInput | ProfileGoal) {
  return {
    templateKey: "templateKey" in goal ? goal.templateKey : null,
    title: goal.title ?? "",
    category: goal.category ?? "Здоровье",
    icon: goal.icon ?? "flag-checkered",
    color: goal.color ?? green,
    currentValue: String(goal.currentValue ?? 0),
    targetValue: String(goal.targetValue ?? 1),
    unit: goal.unit ?? "",
    progress: String(goal.progress ?? 0),
    status: goal.status ?? "active" as ProfileGoal["status"],
    dueDate: goal.dueDate ?? null
  };
}

function goalInputFromDraft(draft: ReturnType<typeof goalDraftFromInput>): ProfileGoalInput {
  return {
    templateKey: draft.templateKey,
    title: draft.title,
    category: draft.category,
    icon: draft.icon,
    color: draft.color,
    currentValue: parseGoalNumber(draft.currentValue),
    targetValue: parseGoalNumber(draft.targetValue),
    unit: draft.unit,
    progress: Math.max(0, Math.min(100, Math.round(parseGoalNumber(draft.progress)))),
    status: draft.status,
    dueDate: draft.dueDate
  };
}

function parseGoalNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatGoalValue(goal: ProfileGoal) {
  const unit = goal.unit ? ` ${goal.unit}` : "";
  return `${formatCompactNumber(goal.currentValue)} / ${formatCompactNumber(goal.targetValue)}${unit}`;
}

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ReportsScreen({ back, open }: { back: () => void; open: (title: string) => void }) {
  const [range, setRange] = useState("Месяц");
  const [selectedMeasurement, setSelectedMeasurement] = useState<MeasurementRow | null>(null);
  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <DetailHeader title="Показатели и отчёты" subtitle="История измерений, динамика показателей и персональные отчёты" back={back} />
        <Segmented values={["Неделя", "Месяц", "3 месяца", "Год"]} value={range} onChange={setRange} />
        <View style={styles.dateNav}>
          <Ionicons name="chevron-back" size={20} color={muted} />
          <Text style={styles.dateNavText}>1 - 31 мая 2025</Text>
          <Ionicons name="chevron-forward" size={20} color={muted} />
        </View>
        <View style={styles.kpiGrid}>
          {metrics.slice(0, 4).map((item) => (
            <Pressable key={item.label} style={styles.kpiCard} onPress={() => open(item.label)}>
              <IconTile name={item.icon} color={item.color} compact />
              <Text style={styles.kpiLabel} numberOfLines={3}>{item.label}</Text>
              <Text style={styles.kpiValue}>{item.value} <Text style={styles.kpiUnit}>{item.unit}</Text></Text>
              <MiniSparkline points={[...item.points]} color={item.color} />
            </Pressable>
          ))}
        </View>
        <View style={styles.chartCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.panelTitle}>Динамика веса</Text>
            <Pressable style={styles.smallPill} onPress={() => open("Группировка")}><Text style={styles.smallPillText}>По дням</Text></Pressable>
          </View>
          <BigLineChart />
        </View>
        <MeasurementHistory onSelect={setSelectedMeasurement} />
        <ReportActions open={open} />
      </ScrollView>
      <MeasurementDetail measurement={selectedMeasurement} onClose={() => setSelectedMeasurement(null)} />
    </>
  );
}

function DevicesScreen({ back, open }: { back: () => void; open: (title: string) => void }) {
  const devices = [
    ["scale-bathroom", "AxMed BIA Весы", "Сегодня, 08:25", "87%"],
    ["watch", "Apple Watch Series 9", "Сегодня, 08:10", "100%"],
    ["bluetooth", "Xiaomi Smart Band 8", "Вчера, 22:30", "73%"],
    ["heart", "Apple Health", "Активность · Сон · Вес", "✓"]
  ];
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <DetailHeader title="Подключённые устройства" subtitle="Синхронизируйте устройства и сервисы, чтобы собирать данные автоматически" back={back} />
      <View style={styles.deviceStats}>
        {[
          ["watch", "3", "Устройства", "Подключено"],
          ["cellphone", "1", "Приложение", "Подключено"],
          ["sync", "Сегодня", "Синхронизация", "08:25"],
          ["bluetooth", "Вкл.", "Bluetooth", "Активен"]
        ].map(([icon, value, label, sub]) => (
          <View key={label} style={styles.deviceStatCard}>
            <IconTile name={icon} color={green} compact />
            <Text style={styles.deviceStatValue}>{value}</Text>
            <Text style={styles.deviceStatLabel}>{label}</Text>
            <Text style={styles.deviceStatSub}>{sub}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.panelTitle}>Подключённые устройства</Text>
      <View style={styles.deviceList}>
        {devices.map(([icon, title, sub, charge]) => (
          <Pressable key={title} style={styles.deviceRow} onPress={() => open(title)}>
            <IconTile name={icon} color={icon === "heart" ? "#ff3765" : green} large />
            <View style={styles.trendInfo}>
              <Text style={styles.deviceTitle}>{title}</Text>
              <Text style={styles.trendSub}>Последняя синхронизация</Text>
              <Text style={styles.deviceSub}>{sub}</Text>
            </View>
            <Text style={styles.chargeText}>{charge}</Text>
            <Ionicons name="chevron-forward" size={20} color={muted} />
          </Pressable>
        ))}
        <Pressable style={styles.deviceRow} onPress={() => open("Подключить устройство")}>
          <IconTile name="plus" color={green} compact />
          <View style={styles.trendInfo}>
            <Text style={styles.deviceTitle}>Подключить устройство</Text>
            <Text style={styles.trendSub}>Добавьте новое устройство или сервис</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={muted} />
        </Pressable>
      </View>
      <View style={styles.blockHeaderRow}>
        <Text style={styles.panelTitle}>Доступные устройства</Text>
        <Text style={styles.linkText}>Обновить</Text>
      </View>
      <Pressable style={styles.deviceRow} onPress={() => open("InBody H20N")}>
        <IconTile name="scale-bathroom" color="#333" large />
        <View style={styles.trendInfo}>
          <Text style={styles.deviceTitle}>InBody H20N</Text>
          <Text style={styles.trendSub}>Умные весы</Text>
        </View>
        <Text style={styles.connectButtonText}>Подключить</Text>
      </Pressable>
      <Pressable style={styles.infoBanner} onPress={() => open("Как подключить устройство?")}>
        <IconTile name="help-circle-outline" color={green} compact />
        <View style={styles.trendInfo}>
          <Text style={styles.settingTitle}>Как подключить устройство?</Text>
          <Text style={styles.trendSub}>Убедитесь, что устройство включено и находится рядом.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={muted} />
      </Pressable>
    </ScrollView>
  );
}


function ProfileInput({
  label,
  icon,
  value,
  placeholder,
  keyboardType,
  onChange
}: {
  label: string;
  icon: string;
  value: string;
  placeholder?: string;
  keyboardType?: any;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name={icon as any} size={18} color={muted} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#a0aab8"
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenSubtitle}>{subtitle}</Text>
    </View>
  );
}

function DetailHeader({ title, subtitle, back }: { title: string; subtitle: string; back: () => void }) {
  return (
    <View style={styles.detailHeader}>
      <Pressable style={styles.headerIconButton} onPress={back}>
        <Ionicons name="chevron-back" size={24} color={green} />
      </Pressable>
      <View style={styles.detailHeaderText}>
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenSubtitle}>{subtitle}</Text>
      </View>
      <Pressable style={styles.infoButton} onPress={() => notify(title)}>
        <Ionicons name="information-circle-outline" size={24} color={green} />
      </Pressable>
    </View>
  );
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: color }]} />
    </View>
  );
}

function MeasurementHistory({ onSelect }: { onSelect: (measurement: MeasurementRow) => void }) {
  return (
    <View style={styles.measurementPanel}>
      <View style={styles.cardTopRow}>
        <Text style={styles.panelTitle}>История измерений</Text>
        <View style={styles.measurementHint}>
          <Ionicons name="scan-outline" size={14} color={green} />
          <Text style={styles.measurementHintText}>{measurementRows.length}</Text>
        </View>
      </View>
      {measurementRows.map((measurement) => (
        <Pressable key={measurement.id} style={styles.measurementCard} onPress={() => onSelect(measurement)}>
          <View style={styles.measurementTop}>
            <View style={styles.measurementDatePill}>
              <Text style={styles.measurementDate}>{measurement.date}</Text>
              <Text style={styles.measurementTime}>{measurement.time}</Text>
            </View>
            <View style={styles.measurementScore}>
              <Text style={styles.measurementScoreValue}>{measurement.score}</Text>
              <Text style={styles.measurementScoreLabel}>балл</Text>
            </View>
          </View>
          <View style={styles.measurementMetricGrid}>
            {measurement.items.map((item) => (
              <View key={item.key} style={styles.measurementMetric}>
                <IconTile name={item.icon} color={item.color} compact />
                <View style={styles.measurementMetricText}>
                  <Text style={styles.measurementMetricLabel}>{item.label}</Text>
                  <Text style={styles.measurementMetricValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.measurementFooter}>
            <Text style={styles.measurementFooterText}>Открыть замер</Text>
            <Ionicons name="chevron-forward" size={18} color={green} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function MeasurementDetail({ measurement, onClose }: { measurement: MeasurementRow | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(measurement)} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalShade} onPress={onClose}>
        <Pressable style={styles.measurementDetailCard}>
          <View style={styles.cardTopRow}>
            <View>
              <Text style={styles.modalTitle}>Замер</Text>
              <Text style={styles.trendSub}>{measurement?.date} · {measurement?.time}</Text>
            </View>
            <Pressable style={styles.squareAction} onPress={onClose}>
              <Ionicons name="close" size={22} color={muted} />
            </Pressable>
          </View>
          <View style={styles.measurementDetailScore}>
            <Text style={styles.measurementDetailScoreValue}>{measurement?.score}</Text>
            <Text style={styles.measurementDetailScoreLabel}>из 100</Text>
          </View>
          <View style={styles.measurementDetailGrid}>
            {measurement?.items.map((item) => (
              <View key={item.key} style={styles.measurementDetailMetric}>
                <IconTile name={item.icon} color={item.color} compact />
                <Text style={styles.measurementDetailLabel}>{item.label}</Text>
                <Text style={styles.measurementDetailValue}>{item.value}</Text>
                <Text style={[styles.measurementDelta, { color: item.delta.startsWith("+") ? green : item.color }]}>{item.delta}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={onClose}>
            <Text style={styles.primaryButtonText}>Готово</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReportActions({ open }: { open: (title: string) => void }) {
  return (
    <View style={styles.reportActionGrid}>
      {[
        ["calendar-check", "Неделя", "Короткий итог"],
        ["chart-bar", "Месяц", "Динамика"],
        ["download", "Экспорт", "PDF / CSV"]
      ].map(([icon, title, sub]) => (
        <Pressable key={title} style={styles.reportActionCard} onPress={() => open(title)}>
          <IconTile name={icon} color={green} compact />
          <Text style={styles.reportActionTitle}>{title}</Text>
          <Text style={styles.reportActionSub}>{sub}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; raised?: boolean }[] = [
    { key: "home", label: "Главная", icon: "home-outline" },
    { key: "metrics", label: "Показатели", icon: "bar-chart-outline" },
    { key: "avatar", label: "Аватар", icon: "person", raised: true },
    { key: "knowledge", label: "База знаний", icon: "book-outline" },
    { key: "profile", label: "Профиль", icon: "person-outline" }
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((item) => {
        const isActive = active === item.key;
        if (item.raised) {
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={styles.tabButtonRaisedWrap}
              onPress={() => onChange(item.key)}
            >
              <View style={[styles.tabButtonRaised, isActive && styles.tabButtonRaisedActive]}>
                <Ionicons name={item.icon} size={26} color="#fff" />
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable key={item.key} style={styles.tabButton} onPress={() => onChange(item.key)}>
            <Ionicons name={item.icon} size={24} color={isActive ? green : "#687484"} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TwoTab({ left, right, active, onLeft, onRight }: { left: string; right: string; active: "left" | "right"; onLeft: () => void; onRight: () => void }) {
  return (
    <View style={styles.twoTabs}>
      <Pressable style={styles.twoTab} onPress={onLeft}><Text style={[styles.twoTabText, active === "left" && styles.activeText]}>{left}</Text></Pressable>
      <Pressable style={styles.twoTab} onPress={onRight}><Text style={[styles.twoTabText, active === "right" && styles.activeText]}>{right}</Text></Pressable>
      <View style={[styles.activeUnderline, active === "right" && styles.activeUnderlineRight]} />
    </View>
  );
}

function Segmented({ values, value, onChange }: { values: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.segmented}>
      {values.map((item) => (
        <Pressable key={item} style={[styles.segment, value === item && styles.segmentActive]} onPress={() => onChange(item)}>
          <Text style={[styles.segmentText, value === item && styles.segmentTextActive]}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function IconTile({ name, color, large, compact }: { name: string; color: string; large?: boolean; compact?: boolean }) {
  return (
    <View style={[styles.iconTile, compact && styles.iconTileCompact, large && styles.iconTileLarge, { backgroundColor: `${color}17` }]}>
      <MaterialCommunityIcons name={name as keyof typeof MaterialCommunityIcons.glyphMap} size={large ? 30 : compact ? 20 : 24} color={color} />
    </View>
  );
}

function Gauge({ value }: { value: number }) {
  return (
    <View style={styles.gauge}>
      <Svg width="150" height="120" viewBox="0 0 150 120">
        <Defs>
          <LinearGradient id="gauge" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#00b69a" />
            <Stop offset="1" stopColor="#7bd94d" />
          </LinearGradient>
        </Defs>
        <Path d="M25 95 A55 55 0 0 1 125 95" stroke="#e7efed" strokeWidth="16" fill="none" strokeLinecap="round" />
        <Path d="M25 95 A55 55 0 0 1 119 65" stroke="url(#gauge)" strokeWidth="16" fill="none" strokeLinecap="round" />
      </Svg>
      <Text style={styles.gaugeValue}>{value}</Text>
      <Text style={styles.gaugeCaption}>из 100</Text>
    </View>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * 16} ${88 - p}`).join(" ");
  const fillId = `fill-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg width="135" height="72" viewBox="0 0 135 72">
      <Defs>
        <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.28" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={`${path} L 128 72 L 0 72 Z`} fill={`url(#${fillId})`} />
      <Path d={path} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * 8} ${42 - p * 0.36}`).join(" ");
  return (
    <Svg width="68" height="34" viewBox="0 0 68 34">
      <Path d={path} stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function BigLineChart() {
  const points = [67, 66, 66.6, 65.9, 65.1, 65.5, 64.9, 65.2, 64.8, 65.1, 64.3, 64.8, 64.0, 63.2];
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${28 + i * 22} ${155 - (p - 60) * 13}`).join(" ");
  return (
    <Svg width="100%" height="190" viewBox="0 0 340 190">
      <Path d="M28 38 H322 M28 78 H322 M28 118 H322 M28 158 H322" stroke="#eef2f5" strokeWidth="1" />
      <Path d={`${path} L 322 170 L 28 170 Z`} fill={green} opacity="0.10" />
      <Path d={path} stroke={green} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {points.map((p, i) => (
        <Path key={`${p}-${i}`} d={`M ${28 + i * 22} ${155 - (p - 60) * 13} m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`} fill={green} />
      ))}
      <Path d="M248 40 V166" stroke={green} strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  authLoading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  profileLoadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#fff" },
  profileLoadingText: { color: muted, fontSize: 14, fontWeight: "600" },
  safe: { flex: 1, backgroundColor: "#fff" },
  app: { flex: 1, backgroundColor: "#fff" },
  scroll: { paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 28 : 10, paddingBottom: 102 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 14 },
  headerText: { flex: 1, paddingRight: 8 },
  heroTitle: { color: ink, fontSize: 24, fontWeight: "800", lineHeight: 30 },
  subtitle: { color: muted, fontSize: 14, lineHeight: 21, marginTop: 4, maxWidth: 245 },
  smallAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#edf4f1", alignItems: "center", justifyContent: "center" },
  profileAvatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: "#edf4f1", alignItems: "center", justifyContent: "center" },
  profileAvatarWrap: { position: "relative" },
  profileAvatarImage: { width: 92, height: 92, borderRadius: 46, backgroundColor: "#edf4f1" },
  avatarUploadOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 46, backgroundColor: "rgba(7,18,37,0.45)", alignItems: "center", justifyContent: "center" },
  sectionLabel: { color: "#4b5566", fontSize: 15, fontWeight: "700", marginTop: 22, marginBottom: 10 },
  avatarPressed: { opacity: 0.7 },
  editBadge: { position: "absolute", right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: green, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  healthCard: { marginTop: 22, minHeight: 190, borderRadius: 18, borderWidth: 1, borderColor: "#b9f0df", backgroundColor: "#effdfa", overflow: "hidden", flexDirection: "row", alignItems: "center", padding: 16 },
  healthCopy: { width: "40%", zIndex: 2 },
  cardTitle: { color: ink, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  score: { color: ink, fontSize: 40, fontWeight: "900" },
  scoreSuffix: { color: "#5c6275", fontSize: 18, fontWeight: "500" },
  good: { color: green, fontSize: 20, fontWeight: "700", marginBottom: 16 },
  primaryButton: { minHeight: 40, borderRadius: 12, backgroundColor: green, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  gauge: { position: "absolute", left: "37%", top: 74, alignItems: "center", justifyContent: "center", transform: [{ scale: 0.7 }] },
  gaugeValue: { position: "absolute", top: 50, color: ink, fontSize: 29, fontWeight: "900" },
  gaugeCaption: { position: "absolute", top: 84, color: "#71788a", fontSize: 13, fontWeight: "600" },
  homePerson: { position: "absolute", right: -8, bottom: -2, width: 118, height: 190 },
  sectionHeader: { marginTop: 22, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sectionTitle: { color: ink, fontSize: 17, fontWeight: "900", flex: 1 },
  listCard: { borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 10, shadowColor: "#14213d", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  metricLine: { minHeight: 58, borderBottomWidth: 1, borderBottomColor: line, flexDirection: "row", alignItems: "center", gap: 10 },
  noBorder: { borderBottomWidth: 0 },
  iconTile: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  iconTileCompact: { width: 34, height: 34, borderRadius: 10 },
  iconTileLarge: { width: 58, height: 58, borderRadius: 15 },
  metricName: { flex: 1, color: "#263041", fontSize: 15 },
  metricValue: { color: ink, fontSize: 16, fontWeight: "900", minWidth: 68, textAlign: "right" },
  metricUnit: { color: "#263041", fontSize: 13, fontWeight: "700" },
  delta: { minWidth: 54, textAlign: "right", fontSize: 15, fontWeight: "800" },
  twoTabs: { height: 56, borderBottomWidth: 1, borderBottomColor: line, flexDirection: "row", marginBottom: 18 },
  twoTab: { flex: 1, alignItems: "center", justifyContent: "center" },
  twoTabText: { color: "#596272", fontSize: 18, fontWeight: "800" },
  activeText: { color: green },
  activeUnderline: { position: "absolute", left: 0, bottom: -2, width: "50%", height: 4, borderRadius: 2, backgroundColor: green },
  activeUnderlineRight: { left: "50%" },
  segmented: { flexDirection: "row", gap: 10, marginBottom: 22 },
  segment: { flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: line, backgroundColor: "#f7f8fa", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  segmentActive: { backgroundColor: green, borderColor: green },
  segmentText: { color: "#4c5667", fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 14 },
  segmentTextActive: { color: "#fff" },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, marginBottom: 24 },
  month: { color: "#4c5667", fontSize: 17, fontWeight: "800" },
  trendCard: { minHeight: 82, borderRadius: 15, borderWidth: 1, borderColor: line, backgroundColor: "#fff", marginBottom: 10, padding: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  trendInfo: { flex: 1 },
  trendTitle: { color: ink, fontSize: 16, fontWeight: "900" },
  trendSub: { color: muted, fontSize: 13, marginTop: 4 },
  trendValueBox: { alignItems: "flex-end", minWidth: 72 },
  trendValue: { color: ink, fontSize: 18, fontWeight: "900" },
  trendDelta: { fontSize: 15, fontWeight: "800", marginTop: 7 },
  avatarStage: { minHeight: 650, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  avatarStats: { position: "absolute", left: 0, top: 52, gap: 14, zIndex: 2 },
  avatarStat: { width: 100, height: 86, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: "#fff", justifyContent: "center", paddingHorizontal: 12, shadowColor: "#14213d", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  avatarStatValue: { color: ink, fontSize: 22, fontWeight: "900" },
  avatarStatLabel: { color: muted, fontSize: 14, marginTop: 6 },
  avatarImage: { width: 230, height: 610 },
  avatarTools: { position: "absolute", right: 0, top: 82, gap: 36 },
  toolButton: { width: 70, height: 70, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  toolButtonActive: { backgroundColor: green, borderColor: green },
  compareImage: { width: "100%", height: 460 },
  compareLine: { borderBottomWidth: 1, borderBottomColor: line, color: green, fontSize: 20, fontWeight: "900", paddingVertical: 11 },
  articleCard: { minHeight: 76, borderRadius: 15, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 12, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  personCard: { marginTop: 22, borderRadius: 17, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  groupTitle: { color: muted, fontSize: 15, fontWeight: "800", marginTop: 20, marginBottom: 8 },
  settingLine: { minHeight: 60, borderBottomWidth: 1, borderBottomColor: line, flexDirection: "row", alignItems: "center", gap: 10 },
  settingTitle: { color: ink, fontSize: 14, fontWeight: "900" },
  logout: { marginTop: 22, minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: "#ffd0d0", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  logoutText: { color: "#f12f35", fontSize: 16, fontWeight: "900" },
  version: { color: muted, textAlign: "center", marginTop: 18, fontSize: 14 },
  tabBar: { position: "absolute", left: 18, right: 18, bottom: Platform.OS === "ios" ? 12 : 16, minHeight: 66, borderRadius: 20, borderWidth: 1, borderColor: line, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", paddingHorizontal: 4, shadowColor: "#14213d", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  tabButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 5 },
  tabLabel: { color: "#687484", fontSize: 10, fontWeight: "700", textAlign: "center", lineHeight: 12 },
  tabLabelActive: { color: green },
  tabButtonRaisedWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabButtonRaised: { width: 56, height: 56, borderRadius: 28, backgroundColor: green, alignItems: "center", justifyContent: "center", marginBottom: 26, shadowColor: green, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  tabButtonRaisedActive: { backgroundColor: "#008f70" },
  screenHeader: { marginBottom: 16 },
  screenTitle: { color: ink, fontSize: 19, fontWeight: "900", lineHeight: 24 },
  screenSubtitle: { color: muted, fontSize: 12.5, lineHeight: 18, marginTop: 4, maxWidth: 310 },
  infoButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginTop: 1 },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -4, marginBottom: 18, paddingHorizontal: 8 },
  dateNavText: { color: "#586274", fontSize: 14, fontWeight: "800" },
  kpiGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 16 },
  kpiCard: { flex: 1, minHeight: 132, borderRadius: 14, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 8, justifyContent: "space-between", shadowColor: "#14213d", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  kpiLabel: { color: "#263041", fontSize: 9.5, lineHeight: 12, fontWeight: "800", minHeight: 36, marginTop: 5 },
  kpiValue: { color: ink, fontSize: 16, fontWeight: "900", marginTop: 1 },
  kpiUnit: { color: "#263041", fontSize: 11, fontWeight: "700" },
  kpiDelta: { fontSize: 11, fontWeight: "800", marginTop: 1 },
  chartCard: { borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 14, marginBottom: 14, shadowColor: "#14213d", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  panelTitle: { color: ink, fontSize: 16, fontWeight: "900" },
  linkText: { color: green, fontSize: 13, fontWeight: "900" },
  legendText: { color: green, fontSize: 13, fontWeight: "700", marginTop: 6 },
  smallPill: { minHeight: 32, borderRadius: 11, borderWidth: 1, borderColor: line, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff" },
  smallPillText: { color: "#596274", fontSize: 13, fontWeight: "700" },
  measurementPanel: { marginBottom: 14 },
  measurementHint: { minHeight: 30, borderRadius: 10, backgroundColor: "#e9f8f3", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 },
  measurementHintText: { color: green, fontSize: 13, fontWeight: "900" },
  measurementCard: { borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 14, marginBottom: 10, shadowColor: "#14213d", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  measurementTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  measurementDatePill: { minHeight: 44, borderRadius: 13, backgroundColor: "#f4f7f8", paddingHorizontal: 12, justifyContent: "center" },
  measurementDate: { color: ink, fontSize: 14, fontWeight: "900" },
  measurementTime: { color: muted, fontSize: 12, fontWeight: "800", marginTop: 2 },
  measurementScore: { minWidth: 60, height: 44, borderRadius: 13, backgroundColor: "#e9f8f3", alignItems: "center", justifyContent: "center" },
  measurementScoreValue: { color: green, fontSize: 18, fontWeight: "900", lineHeight: 20 },
  measurementScoreLabel: { color: green, fontSize: 10, fontWeight: "800" },
  measurementMetricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  measurementMetric: { width: "48%", minHeight: 56, borderRadius: 14, backgroundColor: "#f8fafb", padding: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  measurementMetricText: { flex: 1 },
  measurementMetricLabel: { color: muted, fontSize: 11, fontWeight: "800" },
  measurementMetricValue: { color: ink, fontSize: 14, fontWeight: "900", marginTop: 2 },
  measurementFooter: { borderTopWidth: 1, borderTopColor: "#eef2f5", marginTop: 12, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  measurementFooterText: { color: green, fontSize: 13, fontWeight: "900" },
  measurementDetailCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  measurementDetailScore: { alignSelf: "flex-start", minWidth: 92, minHeight: 78, borderRadius: 18, backgroundColor: "#e9f8f3", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  measurementDetailScoreValue: { color: green, fontSize: 34, fontWeight: "900", lineHeight: 38 },
  measurementDetailScoreLabel: { color: green, fontSize: 12, fontWeight: "900" },
  measurementDetailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  measurementDetailMetric: { width: "48%", minHeight: 118, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 12 },
  measurementDetailLabel: { color: muted, fontSize: 12, fontWeight: "800", marginTop: 8 },
  measurementDetailValue: { color: ink, fontSize: 18, fontWeight: "900", marginTop: 3 },
  measurementDelta: { fontSize: 12, fontWeight: "900", marginTop: 3 },
  reportActionGrid: { flexDirection: "row", gap: 10, marginBottom: 14 },
  reportActionCard: { flex: 1, minHeight: 104, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 10, justifyContent: "space-between", shadowColor: "#14213d", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  reportActionTitle: { color: ink, fontSize: 13, fontWeight: "900", marginTop: 6 },
  reportActionSub: { color: muted, fontSize: 11, fontWeight: "800", marginTop: 2 },
  tableCard: { borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 14, marginBottom: 14, shadowColor: "#14213d", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  tableHeader: { flexDirection: "row", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#f0f3f6" },
  tableHeadText: { flex: 1, color: muted, fontSize: 12, fontWeight: "800" },
  tableRow: { minHeight: 54, borderBottomWidth: 1, borderBottomColor: "#f0f3f6", flexDirection: "row", alignItems: "center", gap: 7 },
  tableDate: { width: 102, flexGrow: 0, flexShrink: 0 },
  tableMain: { color: ink, fontSize: 13, fontWeight: "800" },
  tableSub: { color: muted, fontSize: 12, marginTop: 3 },
  tableCell: { flex: 1, color: ink, fontSize: 13, fontWeight: "800" },
  blockHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  squareAction: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, borderColor: line, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  goalRow: { minHeight: 82, borderBottomWidth: 1, borderBottomColor: "#f0f3f6", flexDirection: "row", alignItems: "center", gap: 10 },
  goalContent: { flex: 1 },
  goalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalTitle: { color: ink, fontSize: 13.5, lineHeight: 17, fontWeight: "900" },
  goalValue: { color: muted, fontSize: 12.5, fontWeight: "700", marginTop: 6, marginBottom: 7 },
  goalPercent: { width: 34, textAlign: "right", fontSize: 13.5, fontWeight: "900" },
  goalDoneBadge: { color: green, backgroundColor: "#e9f8f3", borderRadius: 8, overflow: "hidden", paddingHorizontal: 7, paddingVertical: 3, fontSize: 10.5, fontWeight: "900" },
  goalEmptyState: { minHeight: 190, alignItems: "center", justifyContent: "center", padding: 18 },
  goalEmptyTitle: { color: ink, fontSize: 17, fontWeight: "900", marginTop: 10 },
  goalEmptyText: { color: muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6, maxWidth: 260 },
  goalInlineButton: { minHeight: 42, borderRadius: 13, backgroundColor: green, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", marginTop: 14 },
  goalInlineButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  goalCreateLead: { color: muted, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: -2, marginBottom: 12 },
  goalTemplateGrid: { gap: 8, marginBottom: 10 },
  goalTemplateCard: { minHeight: 58, borderRadius: 15, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  goalTemplateCardActive: { borderColor: green, backgroundColor: "#f0fbf8" },
  goalTemplateTitle: { color: ink, fontSize: 13, lineHeight: 16, fontWeight: "900" },
  goalTemplateSub: { color: muted, fontSize: 12, fontWeight: "800", marginTop: 2 },
  customGoalButton: { minHeight: 64, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: "#f8fafb", padding: 10, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  customGoalButtonActive: { borderColor: green, backgroundColor: "#f0fbf8" },
  goalEditorCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: "92%" },
  goalEditorScroll: { paddingBottom: 2 },
  goalEditorRow: { flexDirection: "row", gap: 10 },
  goalEditorInputWrap: { marginBottom: 14 },
  goalEditorInputWrapRow: { flex: 1 },
  goalEditorInput: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: line, paddingHorizontal: 12, color: ink, fontSize: 15, fontWeight: "700", backgroundColor: "#fff" },
  goalDeleteButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#ffd0d0", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  goalDeleteText: { color: "#f12f35", fontSize: 15, fontWeight: "900" },
  progressTrack: { height: 6, borderRadius: 4, backgroundColor: "#edf0f2", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  countBadge: { minWidth: 26, height: 26, borderRadius: 9, backgroundColor: "#e9f8f3", color: green, textAlign: "center", lineHeight: 26, fontSize: 13, fontWeight: "900" },
  infoBanner: { minHeight: 80, borderRadius: 17, backgroundColor: "#edf9f5", padding: 13, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  deviceStats: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 24 },
  deviceStatCard: { flex: 1, minHeight: 126, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 10, alignItems: "center", justifyContent: "center", shadowColor: "#14213d", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  deviceStatValue: { color: ink, fontSize: 17, fontWeight: "900", marginTop: 8, textAlign: "center" },
  deviceStatLabel: { color: muted, fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 5 },
  deviceStatSub: { color: green, fontSize: 11, fontWeight: "900", textAlign: "center", marginTop: 4 },
  deviceList: { marginTop: 12, marginBottom: 18 },
  deviceRow: { minHeight: 82, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 12, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#14213d", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  deviceTitle: { color: ink, fontSize: 16, fontWeight: "900" },
  deviceSub: { color: green, fontSize: 13, fontWeight: "800", marginTop: 3 },
  chargeText: { color: ink, fontSize: 14, fontWeight: "800" },
  connectButtonText: { color: green, fontSize: 14, fontWeight: "900", backgroundColor: "#e9f8f3", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  modalShade: { flex: 1, backgroundColor: "rgba(7,18,37,0.24)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle: { color: ink, fontSize: 22, fontWeight: "900" },
  modalText: { color: muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  formCard: { marginBottom: 16 },
  inputWrapper: { marginBottom: 16 },
  inputLabel: { color: ink, fontSize: 14, fontWeight: "800", marginBottom: 8 },
  inputContainer: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: line, borderRadius: 12, paddingHorizontal: 12, height: 48, backgroundColor: "#fff", gap: 10 },
  input: { flex: 1, color: ink, fontSize: 15, fontWeight: "600" },
  choiceRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  choiceButton: { flex: 1, height: 56, borderWidth: 1.5, borderColor: line, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#fff" },
  choiceButtonActive: { backgroundColor: green, borderColor: green },
  choiceText: { color: "#576478", fontSize: 14, fontWeight: "700" },
  choiceTextActive: { color: "#fff" },
  saveButton: { minHeight: 54, borderRadius: 16, marginTop: 8, shadowColor: green, shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  buttonDisabled: { opacity: 0.6 },
  settingsCard: { borderRadius: 20, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 16, gap: 16, shadowColor: "#14213d", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  settingsControlBlock: { gap: 10 },
  settingsControlHeader: { gap: 4 },
  settingsControlTitle: { color: ink, fontSize: 15, fontWeight: "900" },
  settingsControlSubtitle: { color: muted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  settingsSegmented: { flexDirection: "row", gap: 8 },
  settingsSegment: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: line, backgroundColor: "#f7f8fa", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  settingsSegmentText: { color: "#4c5667", fontSize: 12.5, lineHeight: 15, fontWeight: "800", textAlign: "center" },
  settingsSegmentTextActive: { color: "#fff" },
  settingsControlDisabled: { opacity: 0.64 },
  settingsSwitchRow: { minHeight: 68, borderBottomWidth: 1, borderBottomColor: "#edf0f2", flexDirection: "row", alignItems: "center", gap: 16, paddingBottom: 16 },
  inlineSaving: { marginTop: 14, minHeight: 42, borderRadius: 14, backgroundColor: "#edf9f5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  inlineSavingText: { color: green, fontSize: 13, fontWeight: "800" },
  appearancePreview: { minHeight: 104, borderRadius: 20, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 16, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#14213d", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  appearancePreviewDark: { backgroundColor: "#111827", borderColor: "#263244" },
  appearancePreviewIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  appearancePreviewTitle: { color: ink, fontWeight: "900", lineHeight: 24 },
  appearancePreviewTitleDark: { color: "#f8fafc" },
  appearancePreviewText: { color: muted, lineHeight: 20, marginTop: 4 },
  appearancePreviewTextDark: { color: "#c7d2e0" },
  appearanceAccentDot: { width: 18, height: 18, borderRadius: 9 },
  refreshProfile: { marginTop: 20, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: line, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, shadowColor: "#14213d", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  refreshProfileText: { color: green, fontSize: 15, fontWeight: "800" },
  detailHeaderText: { flex: 1 },
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20 },
  headerIconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: "#edf4f1", borderRadius: 10 },
  profileHeaderContainer: { marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: line },
  userCard: { marginTop: 18, borderRadius: 24, borderWidth: 1, borderColor: line, backgroundColor: "#fff", padding: 18, flexDirection: "row", alignItems: "flex-start", gap: 14, shadowColor: "#14213d", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  userCardPressed: { backgroundColor: "#fafbfc" },
  userCardIcon: { width: 64, height: 64, borderRadius: 18, backgroundColor: "rgba(0, 168, 126, 0.1)", alignItems: "center", justifyContent: "center" },
  userCardInfo: { flex: 1, minWidth: 0, gap: 3 },
  userCardNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  userCardName: { flex: 1, color: ink, fontSize: 18, fontWeight: "800" },
  userCardSyncSpinner: { marginLeft: 4 },
  userCardMeta: { color: muted, fontSize: 14, fontWeight: "500", marginBottom: 4 },
  userCardContact: { color: muted, fontSize: 13.5, fontWeight: "500" },
  profileHeaderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  profileHeaderTitle: { color: ink, fontSize: 28, fontWeight: "900", lineHeight: 34 },
  profileHeaderStatus: { color: muted, fontSize: 13, marginTop: 4, fontWeight: "600" },
  syncButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#edf9f5", alignItems: "center", justifyContent: "center" },
  syncButtonPressed: { opacity: 0.7 },
  profilePrimaryCard: { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: line, padding: 20, marginBottom: 20, shadowColor: "#14213d", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  avatarSection: { flexDirection: "row", gap: 16, marginBottom: 20, alignItems: "center" },
  nameSection: { flex: 1 },
  verificationBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, backgroundColor: "rgba(0, 168, 126, 0.08)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: "flex-start" },
  verificationText: { color: green, fontSize: 12, fontWeight: "600" },
  menuGroupCard: { backgroundColor: "#fff", borderRadius: 24, borderWidth: 1, borderColor: line, paddingHorizontal: 18, shadowColor: "#14213d", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2, overflow: "hidden" },
  menuRow: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  menuRowPressed: { backgroundColor: "#fafbfc" },
  menuRowDisabled: { opacity: 0.5 },
  menuRowIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(0, 168, 126, 0.1)", alignItems: "center", justifyContent: "center" },
  menuRowIconDanger: { backgroundColor: "rgba(241, 47, 53, 0.1)" },
  menuRowContent: { flex: 1, minWidth: 0 },
  menuRowTitle: { color: ink, fontSize: 15.5, fontWeight: "700" },
  menuRowTitleDanger: { color: "#f12f35" },
  menuRowSubtitle: { color: muted, fontSize: 13, marginTop: 3, fontWeight: "500" },
  menuRowDivider: { height: 1, backgroundColor: "#edf0f2" },
  menuRightLabel: { color: muted, fontSize: 14, fontWeight: "600" },
  deviceBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0, 168, 126, 0.12)", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  deviceBadgeText: { color: green, fontSize: 13, fontWeight: "800" },
  logoutCardButton: { backgroundColor: "rgba(241, 47, 53, 0.06)", borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(241, 47, 53, 0.3)", padding: 16, marginTop: 24, marginBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  logoutCardButtonPressed: { backgroundColor: "rgba(241, 47, 53, 0.12)" },
  logoutCardButtonText: { color: "#f12f35", fontSize: 16, fontWeight: "700" },
  footerVersion: { color: muted, fontSize: 13, fontWeight: "600", textAlign: "center", marginBottom: 12 },
  confirmShade: { flex: 1, backgroundColor: "rgba(7,18,37,0.4)", alignItems: "center", justifyContent: "center", padding: 24 },
  confirmCard: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: 24, padding: 24, alignItems: "center" },
  confirmIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(241, 47, 53, 0.1)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  confirmTitle: { color: ink, fontSize: 18, fontWeight: "800", textAlign: "center" },
  confirmText: { color: muted, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8, marginBottom: 22 },
  confirmActions: { flexDirection: "row", gap: 12, width: "100%" },
  confirmCancelButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: line, alignItems: "center", justifyContent: "center" },
  confirmCancelButtonPressed: { backgroundColor: "#f8f9fa" },
  confirmCancelText: { color: ink, fontSize: 15, fontWeight: "700" },
  confirmDangerButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: "#f12f35", alignItems: "center", justifyContent: "center" },
  confirmDangerButtonPressed: { backgroundColor: "#d81f25" },
  confirmDangerText: { color: "#fff", fontSize: 15, fontWeight: "700" }
});
