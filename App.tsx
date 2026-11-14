import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageSourcePropType,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthFlow } from "./src/features/auth/AuthFlow";
import { ConnectedDevicesScreen } from "./src/features/devices/ConnectedDevicesScreen";
import { ScaleProfileScreen } from "./src/features/devices/ScaleProfileScreen";
import { HealthScreen } from "./src/features/health/HealthScreen";
import { PlanScreen } from "./src/features/plan/PlanScreen";
import { PersonalDataScreen, ProfileInfoScreen, ProfileMainScreen, type ProfileRoute } from "./src/features/profile/ProfileScreens";
import { AppearanceScreen, GeneralSettingsScreen, LogoutScreen, MedicalContextScreen as ProfileMedicalContextScreen, NotificationsScreen, ProfileReportsScreen, SecurityScreen } from "./src/features/profile/ProfileSettingsScreens";
import { FloatingTabBar, type AxTabItem } from "./src/ui/FloatingTabBar";
import { AxThemeProvider, type AxTextSize, type AxThemePreference } from "./src/ui/theme";
import { setAutoSyncEnabled } from "./src/settings/runtimeSettings";
import {
  authenticateWithSocial,
  loginWithEmail,
  loadProfile,
  ProfileData,
  logout,
  registerWithEmail,
  resendVerificationCode,
  restoreSession,
  saveProfile,
  verifyEmail
} from "./src/features/auth/authApi";

const green = "#00a87e";
const ink = "#071225";
const muted = "#758092";
const line = "#e8edf1";

type Tab = "home" | "health" | "plan" | "profile";
const mainTabItems: ReadonlyArray<AxTabItem<Tab>> = [
  { key: "home", label: "Главная", icon: "home-outline" },
  { key: "health", label: "Здоровье", icon: "heart-outline" },
  { key: "plan", label: "План", icon: "checkmark-circle-outline" },
  { key: "profile", label: "Профиль", icon: "person-outline" }
];
type ProfileDetail = ProfileRoute | null;

const homePerson = require("./assets/home-person.png") as ImageSourcePropType;

const metrics = [
  { icon: "scale-bathroom", label: "Вес", sub: "Вес", value: "65.4", unit: "кг", delta: "-0.4 кг", color: green, points: [82, 76, 64, 60, 55, 58, 54, 45, 39] },
  { icon: "water-percent", label: "Процент жира", sub: "Жир", value: "24.5", unit: "%", delta: "-1.2 %", color: "#ff5b21", points: [70, 61, 58, 51, 48, 51, 49, 43, 36] },
  { icon: "dumbbell", label: "Мышечная масса", sub: "Вес", value: "27.1", unit: "кг", delta: "+0.6 кг", color: "#df1d58", points: [32, 38, 48, 52, 50, 55, 65, 67, 82] },
  { icon: "water", label: "Вода в организме", sub: "Вода", value: "54.2", unit: "%", delta: "+1.1 %", color: "#1a86df", points: [35, 42, 52, 61, 63, 62, 68, 72, 84] },
  { icon: "stomach", label: "Индекс висцерального жира", sub: "Баллы", value: "6", unit: "", delta: "-1", color: green, points: [68, 56, 54, 49, 50, 46, 43] },
  { icon: "clipboard-pulse-outline", label: "Метаболический возраст", sub: "Возраст", value: "28", unit: "лет", delta: "-2", color: green, points: [69, 55, 51, 53, 50, 43] }
] as const;

const emptyProfile: ProfileData = {
  id: "",
  email: null,
  displayName: null,
  fullName: null,
  firstName: null,
  lastName: null,
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
    animations: true,
    reduceMotion: false,
    highContrast: false,
    weightUnit: "kg",
    heightUnit: "cm",
    timeFormat: "24",
    firstDayOfWeek: "monday",
    autoSync: true,
    notificationGoals: false,
    notificationTasks: false,
    notificationHabits: false,
    notificationMeasurements: false,
    notificationBracelet: false,
    notificationScale: false,
    notificationWeeklyReport: false,
    notificationMarketing: false,
    notificationTime: "09:00",
    notificationDays: [1, 2, 3, 4, 5, 6, 7]
  },
  updatedAt: ""
};

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
  const systemScheme = useColorScheme();

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

  useEffect(() => {
    setAutoSyncEnabled(profile.appPreferences.autoSync !== false);
  }, [profile.appPreferences.autoSync]);

  const persistProfileInline = useCallback(async (patch: Parameters<typeof saveProfile>[0]) => {
    try {
      const next = await saveProfile(patch);
      setProfile(next);
      return next;
    } catch (error) { throw error; }
  }, []);

  const screen = useMemo(() => {
    if (tab === "home") return <HomeScreen setTab={setTab} open={setSheet} />;
    if (tab === "health") return <HealthScreen />;
    if (tab === "plan") return <PlanScreen />;
    if (profileDetail === "personal") return <PersonalDataScreen profile={profile} onBack={() => setProfileDetail(null)} onSave={persistProfileInline} onProfileChange={setProfile} />;
    if (profileDetail === "medical") return <ProfileMedicalContextScreen profile={profile} onBack={() => setProfileDetail(null)} onSave={persistProfileInline} onProfileChange={setProfile} />;
    if (profileDetail === "reports") return <ProfileReportsScreen onBack={() => setProfileDetail(null)} />;
    if (profileDetail === "devices" || profileDetail === "connectDevice") return <ConnectedDevicesScreen onBack={() => setProfileDetail(null)} startPairing={profileDetail === "connectDevice"} />;
    if (profileDetail === "scale") return <ScaleProfileScreen onBack={() => setProfileDetail(null)} />;
    if (profileDetail === "appearance") return <AppearanceScreen profile={profile} onBack={() => setProfileDetail(null)} onSave={persistProfileInline} onProfileChange={setProfile} />;
    if (profileDetail === "notifications") return <NotificationsScreen profile={profile} onBack={() => setProfileDetail(null)} onSave={persistProfileInline} onProfileChange={setProfile} />;
    if (profileDetail === "general" || profileDetail === "dataSync" || profileDetail === "languageUnits") return <GeneralSettingsScreen profile={profile} onBack={() => setProfileDetail(null)} onSave={persistProfileInline} onProfileChange={setProfile} />;
    if (profileDetail === "security") return <SecurityScreen profile={profile} onBack={() => setProfileDetail(null)} onLogout={onLogout} onLoggedOut={() => void onLogout()} />;
    if (profileDetail === "logout") return <LogoutScreen onBack={() => setProfileDetail(null)} onLogout={onLogout} />;
    if (profileDetail === "help" || profileDetail === "privacy" || profileDetail === "about") return <ProfileInfoScreen type={profileDetail} onBack={() => setProfileDetail(null)} />;
    return <ProfileMainScreen profile={profile} loading={profileLoading} onOpen={setProfileDetail} onProfileChange={setProfile} onRefresh={refreshProfile} />;
  }, [onLogout, persistProfileInline, profile, profileDetail, profileLoading, refreshProfile, tab]);

  const themePreference = (["light", "dark", "system"].includes(String(profile.appPreferences.theme)) ? profile.appPreferences.theme : "system") as AxThemePreference;
  const textSize = (["small", "standard", "large"].includes(String(profile.appPreferences.textSize)) ? profile.appPreferences.textSize : "standard") as AxTextSize;
  const effectiveDark = themePreference === "dark" || themePreference === "system" && systemScheme === "dark";
  const sectionBackground = effectiveDark ? "#101512" : "#F5F6F2";
  return (
    <AxThemeProvider preference={themePreference} textSize={textSize} reduceMotion={profile.appPreferences.reduceMotion === true} highContrast={profile.appPreferences.highContrast === true}>
    <SafeAreaProvider>
    <SafeAreaView edges={["top", "right", "bottom", "left"]} style={[styles.safe, tab !== "home" && styles.systemSafe, tab !== "home" && { backgroundColor: sectionBackground }]}>
      <StatusBar style={tab !== "home" && effectiveDark ? "light" : "dark"} />
      <View style={[styles.app, tab !== "home" && styles.systemSafe, tab !== "home" && { backgroundColor: sectionBackground }]}>
        {screen}
        {tab === "profile" && profileDetail ? null : <TabBar active={tab} onChange={(next) => { setProfileDetail(null); setTab(next); }} />}
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
    </SafeAreaProvider>
    </AxThemeProvider>
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
          <Pressable style={styles.primaryButton} onPress={() => setTab("health")}>
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

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return <FloatingTabBar items={mainTabItems} active={active} onChange={onChange} forceLight={active === "home"} />;
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

const styles = StyleSheet.create({
  authLoading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  profileLoadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#fff" },
  profileLoadingText: { color: muted, fontSize: 14, fontWeight: "600" },
  safe: { flex: 1, backgroundColor: "#fff" },
  app: { flex: 1, backgroundColor: "#fff" },
  systemSafe: { backgroundColor: "#F5F6F2" },
  scroll: { paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 28 : 10, paddingBottom: 102 },
  systemScreen: { flex: 1, backgroundColor: "#F5F6F2" },
  systemScroll: { backgroundColor: "#F5F6F2", paddingBottom: 116 },
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
  tabBar: { position: "absolute", left: 16, right: 16, bottom: Platform.OS === "ios" ? 11 : 14, minHeight: 70, borderRadius: 29, borderWidth: 1, borderColor: "#e4e8e3", backgroundColor: "#fff", flexDirection: "row", alignItems: "center", padding: 6, shadowColor: "#18231d", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  tabButton: { flex: 1, minHeight: 54, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 4 },
  tabButtonActive: { backgroundColor: "#237354" },
  tabButtonPressed: { opacity: 0.78 },
  tabLabel: { color: "#68746e", fontSize: 9.5, fontWeight: "700", textAlign: "center", lineHeight: 11 },
  tabLabelActive: { color: "#fff" },
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
  profileSystemGroup: { padding: 0, overflow: "hidden" },
  planGoalsCard: { padding: 0, overflow: "hidden", marginBottom: 4 },
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
