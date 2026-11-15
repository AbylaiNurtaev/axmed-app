import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, useColorScheme } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthFlow } from "./src/features/auth/AuthFlow";
import { SessionRestoreScreen } from "./src/features/auth/SessionRestoreScreen";
import { HomeScreen } from "./src/features/home/HomeScreen";
import { ConnectedDevicesScreen } from "./src/features/devices/ConnectedDevicesScreen";
import { ScaleProfileScreen } from "./src/features/devices/ScaleProfileScreen";
import { HealthScreen } from "./src/features/health/HealthScreen";
import { PlanScreen } from "./src/features/plan/PlanScreen";
import { PersonalDataScreen, ProfileInfoScreen, ProfileMainScreen, type ProfileRoute } from "./src/features/profile/ProfileScreens";
import { AppearanceScreen, GeneralSettingsScreen, LogoutScreen, MedicalContextScreen as ProfileMedicalContextScreen, NotificationsScreen, ProfileReportsScreen, SecurityScreen } from "./src/features/profile/ProfileSettingsScreens";
import { FloatingTabBar, type AxTabItem } from "./src/ui/FloatingTabBar";
import { SwipeTabs } from "./src/ui/SwipeTabs";
import { AxThemeProvider, type AxTextSize, type AxThemePreference } from "./src/ui/theme";
import { setAutoSyncEnabled } from "./src/settings/runtimeSettings";
import { startDeviceBindings } from "./src/devices/deviceBindings";
import {
  authenticateWithSocial, getSessionUserId, loginWithEmail, loadProfile, type ProfileData,
  logout, registerWithEmail, resendVerificationCode, restoreSession, saveProfile,
  subscribeSession, verifyEmail
} from "./src/features/auth/authApi";

type AuthState = "restoring" | "restoreError" | "signedOut" | "signedIn";

type Tab = "home" | "health" | "plan" | "profile";
const mainTabItems: ReadonlyArray<AxTabItem<Tab>> = [
  { key: "home", label: "Главная", icon: "home-outline" },
  { key: "health", label: "Здоровье", icon: "heart-outline" },
  { key: "plan", label: "План", icon: "checkmark-circle-outline" },
  { key: "profile", label: "Профиль", icon: "person-outline" }
];
type ProfileDetail = ProfileRoute | null;

const metrics = [
  { icon: "scale-bathroom", label: "Вес", sub: "Вес", value: "65.4", unit: "кг", delta: "-0.4 кг", color: "#111111", points: [82, 76, 64, 60, 55, 58, 54, 45, 39] },
  { icon: "water-percent", label: "Процент жира", sub: "Жир", value: "24.5", unit: "%", delta: "-1.2 %", color: "#555555", points: [70, 61, 58, 51, 48, 51, 49, 43, 36] },
  { icon: "dumbbell", label: "Мышечная масса", sub: "Вес", value: "27.1", unit: "кг", delta: "+0.6 кг", color: "#333333", points: [32, 38, 48, 52, 50, 55, 65, 67, 82] },
  { icon: "water", label: "Вода в организме", sub: "Вода", value: "54.2", unit: "%", delta: "+1.1 %", color: "#444444", points: [35, 42, 52, 61, 63, 62, 68, 72, 84] },
  { icon: "stomach", label: "Индекс висцерального жира", sub: "Баллы", value: "6", unit: "", delta: "-1", color: "#111111", points: [68, 56, 54, 49, 50, 46, 43] },
  { icon: "clipboard-pulse-outline", label: "Метаболический возраст", sub: "Возраст", value: "28", unit: "лет", delta: "-2", color: "#111111", points: [69, 55, 51, 53, 50, 43] }
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
    theme: "system",
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
  return <AxThemeProvider preference="system"><AppContent /></AxThemeProvider>;
}

function AppContent() {
  useEffect(startDeviceBindings, []);
  const [authState, setAuthState] = useState<AuthState>("restoring");
  const [restoreError, setRestoreError] = useState<unknown>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const handleLogout = useCallback(async () => {
    await logout();
    setAuthState("signedOut");
  }, []);

  useEffect(() => subscribeSession(() => {
    if (!getSessionUserId()) setAuthState(state => state === "signedIn" ? "signedOut" : state);
  }), []);

  useEffect(() => {
    let active = true;
    restoreSession()
      .then((session) => {
        if (active) setAuthState(session ? "signedIn" : "signedOut");
      })
      .catch(error => {
        if (active) {
          setRestoreError(error);
          setAuthState("restoreError");
        }
      });
    return () => { active = false; };
  }, [restoreAttempt]);

  if (authState === "restoring" || authState === "restoreError") {
    return <SessionRestoreScreen failed={authState === "restoreError"} error={restoreError} onRetry={() => {
      setRestoreError(null);
      setAuthState("restoring");
      setRestoreAttempt(attempt => attempt + 1);
    }} />;
  }

  if (authState === "signedOut") {
    return (
      <AuthFlow
        onComplete={() => setAuthState("signedIn")}
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
    if (tab === "home") return <HomeScreen score={84} status="Хорошо" metrics={metrics.slice(0, 4)}
      onOpenMetrics={() => setTab("health")} />;
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
  const sectionBackground = effectiveDark ? "#111111" : "#F7F7F7";
  const navVisible = !(tab === "profile" && profileDetail);
  return (
    <AxThemeProvider preference={themePreference} textSize={textSize} reduceMotion={profile.appPreferences.reduceMotion === true} highContrast={profile.appPreferences.highContrast === true}>
    <SafeAreaProvider>
    <SafeAreaView edges={navVisible ? ["top", "right", "left"] : ["top", "right", "bottom", "left"]} style={[styles.safe, { backgroundColor: sectionBackground }]}>
      <StatusBar style={effectiveDark ? "light" : "dark"} />
      <SwipeTabs activeIndex={mainTabItems.findIndex(item => item.key === tab)} count={mainTabItems.length}
        enabled={navVisible} onChange={index => { setProfileDetail(null); setTab(mainTabItems[index].key); }}
        style={[styles.app, { backgroundColor: sectionBackground }]}>
        {screen}
        {navVisible ? <TabBar active={tab} onChange={(next) => { setProfileDetail(null); setTab(next); }} /> : null}
      </SwipeTabs>
    </SafeAreaView>
    </SafeAreaProvider>
    </AxThemeProvider>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return <FloatingTabBar items={mainTabItems} active={active} onChange={onChange} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  app: { flex: 1, backgroundColor: "#FFFFFF" }
});
