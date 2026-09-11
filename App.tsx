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
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { AuthFlow } from "./src/features/auth/AuthFlow";
import { DeviceSyncCard } from "./src/features/devices/DeviceSyncCard";
import { ConnectedDevicesScreen } from "./src/features/devices/ConnectedDevicesScreen";
import {
  authenticateWithSocial,
  loginWithEmail,
  logout,
  registerWithEmail,
  resendVerificationCode,
  restoreSession,
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
const profileHead = require("./assets/avatar-head-clean.png") as ImageSourcePropType;
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

  const screen = useMemo(() => {
    if (tab === "home") return <HomeScreen setTab={setTab} open={setSheet} onConnect={() => { setTab("profile"); setProfileDetail("devices"); }} />;
    if (tab === "metrics") return <MetricsScreen />;
    if (tab === "avatar") return <AvatarScreen />;
    if (tab === "knowledge") return <KnowledgeScreen open={setSheet} />;
    if (profileDetail === "medical") return <MedicalContextScreen back={() => setProfileDetail(null)} open={setSheet} />;
    if (profileDetail === "reports") return <ReportsScreen back={() => setProfileDetail(null)} open={setSheet} />;
    if (profileDetail === "devices" || profileDetail === "connectDevice") return <ConnectedDevicesScreen onBack={() => setProfileDetail(null)} startPairing={profileDetail === "connectDevice"} />;
    if (profileDetail) return <ProfileDetailScreen type={profileDetail} back={() => setProfileDetail(null)} open={setSheet} onLogout={onLogout} />;
    return <ProfileScreen open={setSheet} openDetail={setProfileDetail} />;
  }, [onLogout, profileDetail, tab]);

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

function HomeScreen({ setTab, open, onConnect }: { setTab: (tab: Tab) => void; open: (title: string) => void; onConnect: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.heroTitle}>Привет, Айгерим!</Text>
          <Text style={styles.subtitle}>Давайте заботиться о вашем здоровье каждый день</Text>
        </View>
        <Image source={profileHead} style={styles.smallAvatar} />
      </View>
      <DeviceSyncCard onConnect={onConnect} />
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
        <Text style={styles.updated} numberOfLines={1}>24 авг, 20:20</Text>
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

function ProfileScreen({ open, openDetail }: { open: (title: string) => void; openDetail: (detail: ProfileDetail) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.heroTitle}>Профиль</Text>
          <Text style={styles.subtitle}>Управляйте своими данными и настройками</Text>
        </View>
        <View>
          <Image source={profileHead} style={styles.profileAvatar} />
          <View style={styles.editBadge}><Ionicons name="pencil" size={14} color="#fff" /></View>
        </View>
      </View>
      <Pressable style={styles.personCard} onPress={() => openDetail("personal")}>
        <IconTile name="account-outline" color={green} large />
        <View style={styles.trendInfo}>
          <Text style={styles.trendTitle}>Александра Петрова</Text>
          <Text style={styles.trendSub}>34 года  ·  Женский</Text>
          <Text style={styles.trendSub}>alexandra.petrova@gmail.com</Text>
          <Text style={styles.trendSub}>+7 777 123 45 67</Text>
        </View>
        <Ionicons name="chevron-forward" size={26} color="#354253" />
      </Pressable>
      <SettingsGroup title="Здоровье" items={["Медицинский контекст", "Показатели и отчёты", "Согласия и безопасность"]} open={open} openDetail={openDetail} />
      <SettingsGroup title="Устройства" items={["Подключённые устройства", "Подключить устройство"]} open={open} openDetail={openDetail} />
      <SettingsGroup title="Настройки" items={["Общие настройки", "Уведомления", "Внешний вид"]} open={() => undefined} openDetail={openDetail} />
      <Pressable style={styles.logout} onPress={() => openDetail("logout")}>
        <Ionicons name="log-out-outline" size={24} color="#f12f35" />
        <Text style={styles.logoutText}>Выйти из аккаунта</Text>
      </Pressable>
      <Text style={styles.version}>AxMed  ·  Версия 1.0.0</Text>
    </ScrollView>
  );
}

function ProfileDetailScreen({
  type,
  back,
  open,
  onLogout
}: {
  type: Exclude<ProfileDetail, "medical" | "reports" | "devices" | null>;
  back: () => void;
  open: (title: string) => void;
  onLogout: () => Promise<void>;
}) {
  const config = {
    personal: {
      title: "Личные данные",
      subtitle: "Основная информация, контакты и параметры профиля",
      rows: [
        ["account-outline", "ФИО", "Александра Петрова", ""],
        ["calendar-account", "Возраст", "34 года", ""],
        ["gender-female", "Пол", "Женский", ""],
        ["email-outline", "Email", "alexandra.petrova@gmail.com", ""],
        ["phone-outline", "Телефон", "+7 777 123 45 67", ""]
      ],
      banner: "Данные профиля используются для персональных рекомендаций и расчётов."
    },
    security: {
      title: "Согласия и безопасность",
      subtitle: "Ваши данные, разрешения и параметры защиты аккаунта",
      rows: [
        ["shield-check-outline", "Согласие на обработку данных", "Активно", "Вкл."],
        ["lock-outline", "Пароль и вход", "Последнее изменение 12 мая", ""],
        ["fingerprint", "Биометрия", "Face ID для быстрого входа", "Вкл."],
        ["file-document-outline", "Экспорт согласий", "Скачать документы", ""]
      ],
      banner: "Медицинские данные хранятся отдельно и доступны только владельцу аккаунта."
    },
    connectDevice: {
      title: "Подключить устройство",
      subtitle: "Добавьте весы, часы, браслет или приложение здоровья",
      rows: [
        ["scale-bathroom", "Умные весы", "BIA, InBody, AxMed", ""],
        ["watch", "Смарт-часы", "Apple Watch, Garmin, Samsung", ""],
        ["bluetooth", "Bluetooth-устройство", "Поиск устройств рядом", ""],
        ["heart", "Приложение здоровья", "Apple Health, Google Fit", ""]
      ],
      banner: "Включите Bluetooth и держите устройство рядом с телефоном."
    },
    general: {
      title: "Общие настройки",
      subtitle: "Язык, единицы измерения, регион и параметры приложения",
      rows: [
        ["translate", "Язык", "Русский", ""],
        ["weight-kilogram", "Единицы измерения", "кг, см, %", ""],
        ["map-marker-outline", "Регион", "Казахстан", ""],
        ["database-sync-outline", "Синхронизация", "Автоматически", "Вкл."]
      ],
      banner: "Эти настройки влияют на отображение данных во всех разделах."
    },
    notifications: {
      title: "Уведомления",
      subtitle: "Напоминания, рекомендации и обновления по здоровью",
      rows: [
        ["bell-outline", "Ежедневные напоминания", "09:00 каждый день", "Вкл."],
        ["cup-water", "Вода", "6 напоминаний в день", "Вкл."],
        ["calendar-check-outline", "Измерения", "Раз в неделю", "Вкл."],
        ["lightbulb-outline", "Рекомендации", "Персональные советы", "Вкл."]
      ],
      banner: "Уведомления можно отключить или настроить по расписанию."
    },
    appearance: {
      title: "Внешний вид",
      subtitle: "Тема, размер текста и визуальные параметры приложения",
      rows: [
        ["white-balance-sunny", "Тема", "Светлая", ""],
        ["format-size", "Размер текста", "Стандартный", ""],
        ["palette-outline", "Акцентный цвет", "Зелёный", ""],
        ["motion-play-outline", "Анимации", "Умеренные", "Вкл."]
      ],
      banner: "Интерфейс адаптирован под светлую тему и медицинский стиль AxMed."
    },
    logout: {
      title: "Выход из аккаунта",
      subtitle: "Завершение текущей сессии на этом устройстве",
      rows: [
        ["account-arrow-right-outline", "Текущий аккаунт", "alexandra.petrova@gmail.com", ""],
        ["cloud-check-outline", "Данные синхронизированы", "Сегодня, 08:25", ""],
        ["logout", "Выйти на этом устройстве", "Потребуется повторный вход", ""]
      ],
      banner: "После выхода локальные данные останутся защищены до повторной авторизации."
    }
  }[type];

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <DetailHeader title={config.title} subtitle={config.subtitle} back={back} />
      <View style={styles.listCard}>
        {config.rows.map(([icon, title, sub, badge], index) => (
          <Pressable
            key={title}
            style={[styles.settingLine, index === config.rows.length - 1 && styles.noBorder]}
            onPress={() => type === "logout" && title.includes("Выйти") ? void onLogout() : open(title)}
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
      <Pressable style={styles.infoBanner} onPress={() => open(config.title)}>
        <IconTile name="information-outline" color={green} compact />
        <View style={styles.trendInfo}>
          <Text style={styles.settingTitle}>Важно</Text>
          <Text style={styles.trendSub}>{config.banner}</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

function MedicalContextScreen({ back, open }: { back: () => void; open: (title: string) => void }) {
  const goals = [
    { icon: "scale-bathroom", title: "Снизить вес до 60 кг", value: "65.4 / 60 кг", progress: 70, color: green },
    { icon: "fire", title: "Процент жира < 22%", value: "24.5 / 22 %", progress: 40, color: "#ff7a33" },
    { icon: "shoe-sneaker", title: "Ежедневная активность", value: "6 540 / 8 000 шагов", progress: 82, color: green },
    { icon: "water", title: "Пить больше воды", value: "6 / 8 стаканов", progress: 75, color: "#1a86df" }
  ];
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <DetailHeader title="Медицинский контекст" subtitle="Ваши цели, привычки и важная информация для персональных рекомендаций" back={back} />
      <View style={styles.blockHeaderRow}>
        <Text style={styles.panelTitle}>Мои цели</Text>
        <Pressable style={styles.squareAction} onPress={() => open("Добавить цель")}>
          <Ionicons name="add" size={24} color={green} />
        </Pressable>
      </View>
      <View style={styles.listCard}>
        {goals.map((goal, index) => (
          <Pressable key={goal.title} style={[styles.goalRow, index === goals.length - 1 && styles.noBorder]} onPress={() => open(goal.title)}>
            <IconTile name={goal.icon} color={goal.color} />
            <View style={styles.goalContent}>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              <Text style={styles.goalValue}>{goal.value}</Text>
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
  );
}

function ReportsScreen({ back, open }: { back: () => void; open: (title: string) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <DetailHeader title="Показатели и отчёты" subtitle="История измерений, динамика показателей и персональные отчёты" back={back} />
      <Segmented values={["Неделя", "Месяц", "3 месяца", "Год"]} value="Месяц" onChange={() => undefined} />
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
          <Pressable style={styles.smallPill}><Text style={styles.smallPillText}>По дням</Text></Pressable>
        </View>
        <BigLineChart />
      </View>
      <MeasurementsTable open={open} />
    </ScrollView>
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

function SettingsGroup({ title, items, open, openDetail }: { title: string; items: string[]; open: (title: string) => void; openDetail?: (detail: ProfileDetail) => void }) {
  const handlePress = (item: string) => {
    if (item === "Медицинский контекст") return openDetail?.("medical");
    if (item === "Показатели и отчёты") return openDetail?.("reports");
    if (item === "Согласия и безопасность") return openDetail?.("security");
    if (item === "Подключённые устройства") return openDetail?.("devices");
    if (item === "Подключить устройство") return openDetail?.("connectDevice");
    if (item === "Общие настройки") return openDetail?.("general");
    if (item === "Уведомления") return openDetail?.("notifications");
    if (item === "Внешний вид") return openDetail?.("appearance");
    return open(item);
  };

  return (
    <>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.listCard}>
        {items.map((item, index) => (
          <Pressable key={item} style={[styles.settingLine, index === items.length - 1 && styles.noBorder]} onPress={() => handlePress(item)}>
            <IconTile name={index === 0 ? "heart-pulse" : index === 1 ? "clipboard-text-outline" : "shield-check-outline"} color={green} />
            <View style={styles.trendInfo}>
              <Text style={styles.settingTitle}>{item}</Text>
              <Text style={styles.trendSub}>{index === 0 ? "Цели, состояние, ограничения" : "История, доступы и уведомления"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#354253" />
          </Pressable>
        ))}
      </View>
    </>
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

function MeasurementsTable({ open }: { open: (title: string) => void }) {
  const rows = [
    ["24 мая 2025", "65.4 кг", "24.5%", "27.1 кг", "54.2%"],
    ["17 мая 2025", "65.8 кг", "25.0%", "26.8 кг", "53.1%"],
    ["10 мая 2025", "66.1 кг", "25.5%", "26.4 кг", "52.2%"],
    ["3 мая 2025", "66.3 кг", "26.0%", "26.1 кг", "51.5%"]
  ];
  return (
    <View style={styles.tableCard}>
      <View style={styles.cardTopRow}>
        <Text style={styles.panelTitle}>История измерений</Text>
        <Pressable onPress={() => open("История измерений")}><Text style={styles.linkText}>См. все</Text></Pressable>
      </View>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeadText, styles.tableDate]}>Дата</Text>
        <Text style={styles.tableHeadText}>Вес</Text>
        <Text style={styles.tableHeadText}>Жир</Text>
        <Text style={styles.tableHeadText}>Вода</Text>
      </View>
      {rows.map((row, index) => (
        <Pressable key={row[0]} style={[styles.tableRow, index === rows.length - 1 && styles.noBorder]} onPress={() => open(row[0])}>
          <View style={styles.tableDate}><Text style={styles.tableMain}>{row[0]}</Text><Text style={styles.tableSub}>09:{index === 0 ? "15" : "1" + index}</Text></View>
          <Text style={styles.tableCell}>{row[1]}</Text>
          <Text style={styles.tableCell}>{row[2]}</Text>
          <Text style={styles.tableCell}>{row[4]}</Text>
          <Ionicons name="chevron-forward" size={16} color={muted} />
        </Pressable>
      ))}
    </View>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "home", label: "Главная", icon: "home-outline" },
    { key: "metrics", label: "Показатели", icon: "bar-chart-outline" },
    { key: "avatar", label: "Аватар", icon: "person" },
    { key: "knowledge", label: "База знаний", icon: "book-outline" },
    { key: "profile", label: "Профиль", icon: "person-outline" }
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((item) => {
        const isActive = active === item.key;
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
  safe: { flex: 1, backgroundColor: "#fff" },
  app: { flex: 1, backgroundColor: "#fff" },
  scroll: { paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 28 : 10, paddingBottom: 102 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 14 },
  headerText: { flex: 1, paddingRight: 8 },
  heroTitle: { color: ink, fontSize: 24, fontWeight: "800", lineHeight: 30 },
  subtitle: { color: muted, fontSize: 14, lineHeight: 21, marginTop: 4, maxWidth: 245 },
  smallAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#edf4f1" },
  profileAvatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#edf4f1" },
  editBadge: { position: "absolute", right: -2, bottom: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: green, alignItems: "center", justifyContent: "center" },
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
  updated: { color: muted, fontSize: 12, textAlign: "right", maxWidth: 148 },
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
  screenHeader: { marginBottom: 16 },
  screenTitle: { color: ink, fontSize: 19, fontWeight: "900", lineHeight: 24 },
  screenSubtitle: { color: muted, fontSize: 12.5, lineHeight: 18, marginTop: 4, maxWidth: 310 },
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 22 },
  detailHeaderText: { flex: 1 },
  headerIconButton: { width: 28, height: 32, alignItems: "flex-start", justifyContent: "center", marginTop: 1 },
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
  goalTitle: { color: ink, fontSize: 13.5, lineHeight: 17, fontWeight: "900" },
  goalValue: { color: muted, fontSize: 12.5, fontWeight: "700", marginTop: 6, marginBottom: 7 },
  goalPercent: { width: 34, textAlign: "right", fontSize: 13.5, fontWeight: "900" },
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
  modalText: { color: muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 }
});
