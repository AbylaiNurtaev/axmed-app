import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated";
import { deviceGateway } from "../../devices/deviceGateway";
import { deviceSync } from "../../devices/deviceSync";
import { deviceErrorMessage } from "../../devices/errorMessages";
import { readingSummary, syncErrorMessage, syncWarningMessage } from "../../devices/readingSummary";
import { scaleSync } from "../../devices/scaleSync";
import type { DeviceReading, Metric } from "../../devices/types";
import { ConnectedDevicesScreen } from "../devices/ConnectedDevicesScreen";
import { ScaleProfileScreen } from "../devices/ScaleProfileScreen";
import {
  defaultHealthHistoryFilters,
  HealthDynamicsScreen,
  type HealthHistoryFilters,
  HealthHistoryScreen,
  HealthMeasurementScreen,
  HealthReportsScreen
} from "./HealthInsightsScreens";
import { AxCollapsible, AxReveal } from "../../ui/motion";
import { AxAnimatedNumber, AxButton, AxFilterChip, AxPressable, AxSegmentedControl, AxSkeleton } from "../../ui/primitives";
import { useAxReducedMotion } from "../../ui/theme";
import { axColors, axMotion } from "../../ui/tokens";

const palette = axColors;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

type IconName = ComponentProps<typeof Ionicons>["name"];
type Period = "7 дней" | "Месяц" | "3 месяца" | "Год";
type HealthRoute =
  | { name: "overview" }
  | { name: "metric"; metric: Metric }
  | { name: "history"; metric?: Metric }
  | { name: "measurement"; id: string }
  | { name: "analysis" }
  | { name: "bracelet" }
  | { name: "scale" }
  | { name: "devices" }
  | { name: "reports" };

type MetricInfo = {
  metric: Metric;
  label: string;
  shortLabel: string;
  unit: string;
  digits: number;
  icon: IconName;
  color: string;
  soft: string;
  source: "bracelet" | "scale";
  description: string;
};

const metricCatalog: MetricInfo[] = [
  { metric: "steps", label: "Шаги", shortLabel: "Шаги", unit: "", digits: 0, icon: "footsteps-outline", color: palette.green, soft: palette.greenSoft, source: "bracelet", description: "Количество шагов помогает оценить ежедневную двигательную активность." },
  { metric: "heartRate", label: "Пульс", shortLabel: "Пульс", unit: "уд/мин", digits: 0, icon: "heart-outline", color: palette.coral, soft: palette.coralSoft, source: "bracelet", description: "Пульс меняется из-за нагрузки, восстановления, сна и эмоционального состояния." },
  { metric: "sleepDuration", label: "Продолжительность сна", shortLabel: "Сон", unit: "ч", digits: 1, icon: "moon-outline", color: palette.purple, soft: palette.purpleSoft, source: "bracelet", description: "Регулярный сон поддерживает восстановление и устойчивость к нагрузке." },
  { metric: "oxygenSaturation", label: "Кислород SpO₂", shortLabel: "SpO₂", unit: "%", digits: 0, icon: "water-outline", color: palette.blue, soft: palette.blueSoft, source: "bracelet", description: "Оценка насыщения крови кислородом, полученная с браслета." },
  { metric: "hrv", label: "Вариабельность пульса", shortLabel: "HRV", unit: "мс", digits: 0, icon: "pulse-outline", color: palette.green, soft: palette.greenSoft, source: "bracelet", description: "HRV используется как один из ориентиров восстановления и реакции на нагрузку." },
  { metric: "stress", label: "Уровень стресса", shortLabel: "Стресс", unit: "/ 100", digits: 0, icon: "flash-outline", color: palette.amber, soft: palette.amberSoft, source: "bracelet", description: "Оценочный индекс браслета, отражающий нагрузку на организм." },
  { metric: "bodyTemperature", label: "Температура", shortLabel: "Температура", unit: "°C", digits: 1, icon: "thermometer-outline", color: palette.coral, soft: palette.coralSoft, source: "bracelet", description: "Температурный показатель браслета полезнее оценивать в динамике." },
  { metric: "activeCalories", label: "Активные калории", shortLabel: "Калории", unit: "ккал", digits: 0, icon: "flame-outline", color: palette.amber, soft: palette.amberSoft, source: "bracelet", description: "Оценка энергии, потраченной на активность в течение дня." },
  { metric: "distance", label: "Пройденное расстояние", shortLabel: "Расстояние", unit: "км", digits: 2, icon: "navigate-outline", color: palette.blue, soft: palette.blueSoft, source: "bracelet", description: "Расстояние рассчитывается по данным активности браслета." },
  { metric: "bloodPressureSystolic", label: "Систолическое давление", shortLabel: "Давление", unit: "мм рт. ст.", digits: 0, icon: "speedometer-outline", color: palette.coral, soft: palette.coralSoft, source: "bracelet", description: "Оценка давления браслетом. Показатель предназначен для наблюдения за динамикой и не заменяет тонометр." },
  { metric: "bloodPressureDiastolic", label: "Диастолическое давление", shortLabel: "Нижнее давление", unit: "мм рт. ст.", digits: 0, icon: "speedometer-outline", color: palette.purple, soft: palette.purpleSoft, source: "bracelet", description: "Парное значение оценки давления браслетом, полученное из одной записи устройства." },
  { metric: "met", label: "Интенсивность активности", shortLabel: "MET", unit: "MET", digits: 1, icon: "flash-outline", color: palette.amber, soft: palette.amberSoft, source: "bracelet", description: "Оценка интенсивности нагрузки относительно состояния покоя." },
  { metric: "sleepDeep", label: "Глубокий сон", shortLabel: "Глубокий", unit: "мин", digits: 0, icon: "moon-outline", color: palette.purple, soft: palette.purpleSoft, source: "bracelet", description: "Оценочная длительность глубоких стадий сна по данным браслета." },
  { metric: "sleepLight", label: "Лёгкий сон", shortLabel: "Лёгкий", unit: "мин", digits: 0, icon: "cloudy-night-outline", color: palette.blue, soft: palette.blueSoft, source: "bracelet", description: "Оценочная длительность лёгких стадий сна." },
  { metric: "sleepRem", label: "REM-сон", shortLabel: "REM", unit: "мин", digits: 0, icon: "sparkles-outline", color: palette.green, soft: palette.greenSoft, source: "bracelet", description: "Оценочная длительность REM-стадий сна, если канал доступен на устройстве." },
  { metric: "sleepAwake", label: "Пробуждения", shortLabel: "Пробуждения", unit: "мин", digits: 0, icon: "eye-outline", color: palette.coral, soft: palette.coralSoft, source: "bracelet", description: "Суммарное время бодрствования внутри периода сна." },
  { metric: "weight", label: "Вес", shortLabel: "Вес", unit: "кг", digits: 2, icon: "scale-outline", color: palette.green, soft: palette.greenSoft, source: "scale", description: "Устойчивый вес, непосредственно считанный с умных весов AxMed." },
  { metric: "bodyFatPercentage", label: "Процент жира", shortLabel: "Жир", unit: "%", digits: 1, icon: "flame-outline", color: palette.coral, soft: palette.coralSoft, source: "scale", description: "Оценочная доля жировой ткани. Пока доступ LEFU ожидает одобрения, значение демонстрационное." },
  { metric: "muscleMass", label: "Мышечная масса", shortLabel: "Мышцы", unit: "кг", digits: 1, icon: "barbell-outline", color: palette.blue, soft: palette.blueSoft, source: "scale", description: "Оценка общей мышечной массы по данным биоимпеданса." },
  { metric: "bodyWaterPercentage", label: "Вода в организме", shortLabel: "Вода", unit: "%", digits: 1, icon: "water-outline", color: palette.blue, soft: palette.blueSoft, source: "scale", description: "Оценочная доля воды в организме." },
  { metric: "proteinPercentage", label: "Белок", shortLabel: "Белок", unit: "%", digits: 1, icon: "nutrition-outline", color: palette.amber, soft: palette.amberSoft, source: "scale", description: "Расчётная доля белка в составе тела." },
  { metric: "visceralFatLevel", label: "Висцеральный жир", shortLabel: "Висц. жир", unit: "ур.", digits: 0, icon: "body-outline", color: palette.coral, soft: palette.coralSoft, source: "scale", description: "Расчётный уровень жира вокруг внутренних органов." },
  { metric: "boneMass", label: "Костная масса", shortLabel: "Кости", unit: "кг", digits: 1, icon: "fitness-outline", color: palette.purple, soft: palette.purpleSoft, source: "scale", description: "Расчётная масса минеральной составляющей костной ткани." },
  { metric: "basalMetabolicRate", label: "Базовый обмен", shortLabel: "BMR", unit: "ккал", digits: 0, icon: "flash-outline", color: palette.amber, soft: palette.amberSoft, source: "scale", description: "Оценка энергии, которую организм расходует в состоянии покоя." },
  { metric: "metabolicAge", label: "Метаболический возраст", shortLabel: "Возраст тела", unit: "лет", digits: 0, icon: "time-outline", color: palette.green, soft: palette.greenSoft, source: "scale", description: "Сравнительный расчётный показатель состава тела и обмена веществ." },
  { metric: "bodyScore", label: "Оценка тела", shortLabel: "Оценка", unit: "/ 100", digits: 0, icon: "sparkles-outline", color: palette.purple, soft: palette.purpleSoft, source: "scale", description: "Сводная оценка, рассчитанная из показателей состава тела." }
];

const metricByName = new Map(metricCatalog.map(item => [item.metric, item]));
const periods: Period[] = ["7 дней", "Месяц", "3 месяца", "Год"];
const bracelet = deviceGateway.forKind("fitness-band");
const scale = deviceGateway.forKind("scale");

type MeasurementGroup = {
  id: string;
  source: "bracelet" | "scale";
  recordedAt: string;
  samples: DeviceReading[];
  saved: boolean;
};

function valueLabel(value: number | undefined, digits = 0) {
  if (value === undefined) return "—";
  return value.toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? 1 : 0 });
}

function sleepHours(minutes: number | undefined) {
  return minutes === undefined ? undefined : minutes / 60;
}

function dateTimeLabel(value: string, timeZone?: string) {
  return new Date(value).toLocaleString("ru-RU", {
    ...(timeZone ? { timeZone } : {}),
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function currentDateLabel() {
  const value = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function latestMap(samples: readonly DeviceReading[]) {
  const map = new Map<Metric, DeviceReading>();
  const sorted = [...samples].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  for (const sample of sorted) if (!map.has(sample.metric)) map.set(sample.metric, sample);
  return map;
}

function periodStart(period: Period) {
  const date = new Date();
  const days = period === "7 дней" ? 7 : period === "Месяц" ? 31 : period === "3 месяца" ? 92 : 366;
  date.setDate(date.getDate() - days);
  return date.getTime();
}

function filterByPeriod(samples: readonly DeviceReading[], period: Period) {
  const start = periodStart(period);
  return samples.filter(sample => Date.parse(sample.recordedAt) >= start);
}

function groupMeasurements(scaleSamples: readonly DeviceReading[], braceletSamples: readonly DeviceReading[], scaleSaved: boolean, braceletSaved: boolean): MeasurementGroup[] {
  const result = new Map<string, MeasurementGroup>();
  for (const sample of scaleSamples) {
    const id = `scale:${sample.sourceRecordId}:${sample.recordedAt}`;
    const group = result.get(id) ?? { id, source: "scale" as const, recordedAt: sample.recordedAt, samples: [], saved: true };
    group.samples.push(sample);
    result.set(id, group);
  }
  const braceletByDay = new Map<string, DeviceReading[]>();
  for (const sample of braceletSamples) {
    const list = braceletByDay.get(sample.localDate) ?? [];
    list.push(sample);
    braceletByDay.set(sample.localDate, list);
  }
  for (const [day, samples] of braceletByDay) {
    const recordedAt = samples.reduce((latest, sample) => sample.recordedAt > latest ? sample.recordedAt : latest, samples[0]?.recordedAt ?? "");
    result.set(`bracelet:${day}`, { id: `bracelet:${day}`, source: "bracelet", recordedAt, samples, saved: true });
  }
  const sorted = [...result.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const latestScale = sorted.find(item => item.source === "scale");
  const latestBracelet = sorted.find(item => item.source === "bracelet");
  return sorted.map(item => item.id === latestScale?.id ? { ...item, saved: scaleSaved } : item.id === latestBracelet?.id ? { ...item, saved: braceletSaved } : item);
}

export function HealthScreen() {
  const [route, setRoute] = useState<HealthRoute>({ name: "overview" });
  const [historyFilters, setHistoryFilters] = useState<HealthHistoryFilters>(defaultHealthHistoryFilters);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const braceletConnection = useSyncExternalStore(bracelet.subscribe, bracelet.getSnapshot, bracelet.getSnapshot);
  const scaleConnection = useSyncExternalStore(scale.subscribe, scale.getSnapshot, scale.getSnapshot);
  const braceletState = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getSnapshot);
  const scaleState = useSyncExternalStore(scaleSync.subscribe, scaleSync.getSnapshot, scaleSync.getSnapshot);
  const braceletBatch = braceletState.batch;
  const scaleBatch = scaleState.batch;
  const braceletSummary = useMemo(() => braceletBatch ? readingSummary(braceletBatch) : undefined, [braceletBatch]);
  const braceletLatest = useMemo(() => latestMap(braceletBatch?.samples ?? []), [braceletBatch]);
  const scaleLatest = useMemo(() => latestMap(scaleBatch?.samples ?? []), [scaleBatch]);
  const measurements = useMemo(() => groupMeasurements(scaleBatch?.samples ?? [], braceletBatch?.samples ?? [], scaleState.saved, braceletState.saved), [scaleBatch, braceletBatch, scaleState.saved, braceletState.saved]);
  const allSamples = useMemo(() => [...(braceletBatch?.samples ?? []), ...(scaleBatch?.samples ?? [])], [braceletBatch, scaleBatch]);
  const refreshHealthData = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([deviceSync.refresh(), scaleSync.refresh()]); }
    finally { setRefreshing(false); }
  }, []);
  const historyError = braceletState.phase === "error" ? syncErrorMessage(braceletState.error) : scaleState.phase === "error" ? syncErrorMessage(scaleState.error) : undefined;

  const goBack = useCallback(() => setRoute({ name: "overview" }), []);
  if (route.name === "scale") return <ScaleProfileScreen onBack={goBack} />;
  if (route.name === "devices") return <ConnectedDevicesScreen onBack={goBack} />;
  if (route.name === "bracelet") {
    return <BraceletScreen
      connection={braceletConnection}
      sync={braceletState}
      latest={braceletLatest}
      summary={braceletSummary}
      samples={braceletBatch?.samples ?? []}
      onBack={goBack}
      onConnect={() => setRoute({ name: "devices" })}
      onMetric={(metric) => setRoute({ name: "metric", metric })}
    />;
  }
  if (route.name === "metric") {
    return <HealthDynamicsScreen metric={route.metric} samples={allSamples} onBack={goBack} onMetric={(metric) => setRoute({ name: "metric", metric })} onHistory={() => { setHistoryFilters(value => ({ ...value, metric: route.metric })); setRoute({ name: "history", metric: route.metric }); }} />;
  }
  if (route.name === "history") {
    return <HealthHistoryScreen measurements={measurements} filters={historyFilters} onFiltersChange={setHistoryFilters} scrollOffset={historyOffset} onScrollOffset={setHistoryOffset} loading={measurements.length === 0 && (braceletState.phase === "reading" || scaleState.phase === "reading")} refreshing={refreshing} error={historyError} onRefresh={() => void refreshHealthData()} onBack={goBack} onOpen={(id) => setRoute({ name: "measurement", id })} />;
  }
  if (route.name === "measurement") {
    const measurement = measurements.find(item => item.id === route.id);
    const previous = measurement ? measurements.find(item => item.source === measurement.source && item.recordedAt < measurement.recordedAt) : undefined;
    const retrying = measurement?.source === "scale" ? scaleState.phase === "saving" : braceletState.phase === "saving";
    return <HealthMeasurementScreen measurement={measurement} previous={previous} retrying={retrying} onRetrySave={() => void (measurement?.source === "scale" ? scaleSync.retrySave() : deviceSync.retrySave())} onBack={() => setRoute({ name: "history" })} onMetric={(metric) => setRoute({ name: "metric", metric })} />;
  }
  if (route.name === "reports") {
    return <HealthReportsScreen samples={allSamples} measurements={measurements} refreshing={refreshing} error={historyError} onRefresh={() => void refreshHealthData()} onBack={goBack} />;
  }
  if (route.name === "analysis") {
    return <AnalysisScreen braceletSummary={braceletSummary} scaleLatest={scaleLatest} onBack={goBack} />;
  }

  return <HealthOverview
    braceletConnected={braceletConnection.phase === "connected"}
    scaleConnected={scaleConnection.phase === "connected"}
    braceletState={braceletState}
    scaleState={scaleState}
    braceletSummary={braceletSummary}
    braceletLatest={braceletLatest}
    scaleLatest={scaleLatest}
    scaleIsDemo={Boolean(scaleBatch?.warnings?.includes("mockBodyComposition"))}
    allSamples={allSamples}
    onRoute={setRoute}
  />;
}

function BraceletScreen({ connection, sync, latest, summary, samples, onBack, onConnect, onMetric }: {
  connection: ReturnType<typeof bracelet.getSnapshot>;
  sync: ReturnType<typeof deviceSync.getSnapshot>;
  latest: Map<Metric, DeviceReading>;
  summary?: ReturnType<typeof readingSummary>;
  samples: DeviceReading[];
  onBack: () => void;
  onConnect: () => void;
  onMetric: (metric: Metric) => void;
}) {
  const connected = connection.phase === "connected";
  const busy = sync.phase === "reading" || sync.phase === "saving";
  const unsaved = Boolean(sync.batch && !sync.saved);
  const run = () => {
    if (busy) void deviceSync.cancel();
    else if (unsaved) void deviceSync.retrySave();
    else if (connected) void deviceSync.sync();
    else onConnect();
  };
  const values = new Map<Metric, number | undefined>([
    ["steps", summary?.steps],
    ["heartRate", summary?.heartRate?.value],
    ["sleepDuration", sleepHours(summary?.sleepMinutes)],
    ["oxygenSaturation", latest.get("oxygenSaturation")?.value],
    ["hrv", latest.get("hrv")?.value],
    ["stress", latest.get("stress")?.value],
    ["bodyTemperature", latest.get("bodyTemperature")?.value],
    ["activeCalories", latest.get("activeCalories")?.value],
    ["distance", latest.get("distance")?.value]
  ]);
  const visibleMetrics = ["steps", "heartRate", "sleepDuration", "oxygenSaturation", "hrv", "stress", "bodyTemperature", "activeCalories", "distance", "met"] as Metric[];
  const selectedDevice = connection.devices.find(device => device.id === connection.selectedDeviceId);
  const availableChannels = visibleMetrics.filter(metric => values.get(metric) !== undefined || latest.has(metric)).length + (summary?.bloodPressure ? 1 : 0);
  const quality = Math.max(0, Math.min(100, Math.round((availableChannels / 11) * 100) - (sync.batch?.warnings?.length ?? 0) * 3));
  const battery = sync.batch?.battery;
  const batteryLabel = battery ? `${battery.value}${battery.unit === "percent" ? "%" : "/4"}` : "—";
  return <HealthPage title="Браслет" subtitle="Активность, восстановление и жизненные показатели" onBack={onBack}>
    <View style={styles.deviceHero}>
      <View style={styles.deviceHeroTop}>
        <View style={[styles.deviceHeroIcon, { backgroundColor: connected ? palette.greenSoft : "#EFF1EE" }]}><Ionicons name="watch-outline" size={26} color={connected ? palette.green : palette.muted} /></View>
        <View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.deviceHeroTitle}>{selectedDevice?.name ?? sync.batch?.device.name ?? "Фитнес-браслет AxMed"}</Text><Text maxFontSizeMultiplier={1.3} style={styles.cardSubtitle}>{connected ? "Подключён и готов к синхронизации" : sync.batch ? "Показаны последние сохранённые данные" : connection.phase === "scanning" ? "Ищем устройство рядом" : "Устройство не подключено"}</Text></View>
        <View style={[styles.connectionBadge, connected && styles.connectionBadgeOnline]}><View style={[styles.statusDot, { backgroundColor: connected ? palette.green : palette.muted }]} /><Text maxFontSizeMultiplier={1.3} style={[styles.connectionBadgeText, connected && styles.connectionBadgeTextOnline]}>{connected ? "Онлайн" : "Оффлайн"}</Text></View>
      </View>
      <View style={styles.deviceFacts}>
        <DeviceFact icon="battery-half-outline" label="Заряд" value={batteryLabel} tone={battery?.low ? palette.coral : palette.green} />
        <DeviceFact icon="layers-outline" label="Полнота" value={`${quality}%`} tone={quality >= 70 ? palette.green : palette.amber} />
        <DeviceFact icon="calendar-outline" label="История" value={sync.batch ? `${sync.batch.historyDays} дн.` : "—"} tone={palette.blue} />
      </View>
      {sync.batch ? <Text maxFontSizeMultiplier={1.3} style={styles.deviceUpdated}>Последняя синхронизация · {dateTimeLabel(sync.batch.readAt, sync.batch.timeZone)}</Text> : null}
    </View>

    <SyncStageProgress sync={sync} />

    <SectionHeader title="Показатели" subtitle="Последние реальные данные устройства" />
    <View style={styles.metricGrid}>{visibleMetrics.map((metric, index) => {
      const info = metricByName.get(metric)!;
      const reading = latest.get(metric);
      return <AxReveal key={metric} delay={index * 35} style={styles.metricReveal}><MetricCard
        info={info}
        value={values.get(metric) ?? reading?.value}
        unit={info.unit}
        digits={info.digits}
        delta={metricChange(samples, metric)}
        updatedAt={reading?.recordedAt}
        onPress={() => onMetric(metric)}
      /></AxReveal>;
    })}</View>
    <AxPressable accessibilityLabel="Давление" onPress={() => onMetric("bloodPressureSystolic")} style={styles.pressureCard}>
      <View style={[styles.metricIcon, { backgroundColor: palette.coralSoft }]}><Ionicons name="speedometer-outline" size={20} color={palette.coral} /></View>
      <View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.metricCardLabel}>Давление · оценка браслета</Text><Text maxFontSizeMultiplier={1.3} style={styles.pressureValue}>{summary?.bloodPressure ? `${valueLabel(summary.bloodPressure.high.value)}/${valueLabel(summary.bloodPressure.low.value)}` : "—"} <Text maxFontSizeMultiplier={1.3} style={styles.metricCardUnit}>{summary?.bloodPressure ? "мм рт. ст." : ""}</Text></Text><Text maxFontSizeMultiplier={1.3} style={styles.metricCardDelta}>{summary?.bloodPressure ? dateTimeLabel(summary.bloodPressure.high.recordedAt) : "Нет парной записи"}</Text></View><Ionicons name="chevron-forward" size={18} color={palette.muted} />
    </AxPressable>

    <AxButton style={styles.actionSpacing} label={busy ? `${sync.progress}% · Отменить` : unsaved ? "Повторить сохранение" : connected ? "Синхронизировать" : "Подключить браслет"} icon={busy ? "close" : unsaved ? "cloud-upload-outline" : connected ? "sync-outline" : "bluetooth-outline"} onPress={run} />
    <AxButton style={styles.actionSpacing} label={connected ? "Переподключить устройство" : "Открыть устройства"} icon="settings-outline" variant="ghost" onPress={onConnect} />
    {connection.phase === "error" ? <InlineError text={deviceErrorMessage(connection.errorCode)} onRetry={onConnect} action="Открыть устройства" /> : null}
    {sync.phase === "error" ? <InlineError text={syncErrorMessage(sync.error)} onRetry={unsaved ? () => void deviceSync.retrySave() : run} /> : null}
    {sync.batch?.warnings?.length ? <View style={styles.warningList}>{sync.batch.warnings.map(code => <View key={code} style={styles.warningRow}><Ionicons name="information-circle-outline" size={17} color={palette.amber} /><Text maxFontSizeMultiplier={1.3} style={styles.warningText}>{syncWarningMessage(code)}</Text></View>)}</View> : null}
    <View style={styles.disclaimer}><Ionicons name="shield-checkmark-outline" size={19} color={palette.green} /><Text maxFontSizeMultiplier={1.3} style={styles.disclaimerText}>Данные сохраняются в аккаунте после успешной синхронизации и доступны в общей истории.</Text></View>
  </HealthPage>;
}

function DeviceFact({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone: string }) {
  return <View style={styles.deviceFact}><Ionicons name={icon} size={16} color={tone} /><View><Text maxFontSizeMultiplier={1.3} style={styles.deviceFactValue}>{value}</Text><Text maxFontSizeMultiplier={1.3} style={styles.deviceFactLabel}>{label}</Text></View></View>;
}

const syncStageLabels = [
  { key: "battery", label: "Заряд", detail: "Проверяем состояние устройства" },
  { key: "history", label: "История", detail: "Читаем основную историю" },
  { key: "oxygen", label: "SpO₂", detail: "Получаем кислород" },
  { key: "hrv", label: "HRV", detail: "Получаем восстановление" },
  { key: "temperature", label: "Температура", detail: "Читаем температурный канал" },
  { key: "manual", label: "Ручные", detail: "Сопоставляем ручные измерения" },
  { key: "activity", label: "Активность", detail: "Собираем шаги и нагрузку" },
  { key: "complete", label: "Готово", detail: "Чтение завершено" }
] as const;

function SyncStageProgress({ sync }: { sync: ReturnType<typeof deviceSync.getSnapshot> }) {
  const progress = useSharedValue(sync.progress);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => { progress.value = withTiming(sync.progress, { duration: reduceMotion ? 0 : axMotion.standard }); }, [progress, reduceMotion, sync.progress]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${Math.max(2, progress.value)}%` }));
  const visible = sync.phase !== "idle";
  const stage = syncStageLabels.find(item => item.key === sync.stage) ?? (sync.phase === "saving" ? { key: "complete", label: "Сохранение", detail: "Сохраняем данные в аккаунте" } : syncStageLabels[0]);
  const complete = sync.phase === "complete";
  const error = sync.phase === "error";
  return <AxCollapsible visible={visible} style={[styles.syncStageCard, complete && styles.syncStageComplete, error && styles.syncStageError]}>
    <View style={styles.syncStageHeader}><View style={[styles.syncStageIcon, { backgroundColor: error ? palette.dangerSoft : palette.greenSoft }]}><Ionicons name={complete ? "checkmark" : error ? "alert" : "pulse-outline"} size={20} color={error ? palette.danger : palette.green} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.syncStageTitle}>{complete ? "Синхронизация завершена" : error ? "Синхронизация остановлена" : stage.label}</Text><Text maxFontSizeMultiplier={1.3} style={styles.syncStageDetail}>{error ? syncErrorMessage(sync.error) : complete ? "Все доступные каналы прочитаны и сохранены" : stage.detail}</Text></View><Text maxFontSizeMultiplier={1.3} style={[styles.syncStagePercent, error && { color: palette.danger }]}>{complete ? "100%" : `${Math.round(sync.progress)}%`}</Text></View>
    {!error ? <View style={styles.syncStageTrack}><Animated.View style={[styles.syncStageFill, progressStyle]} /></View> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.syncStageChips}>{syncStageLabels.map(item => {
      const itemIndex = syncStageLabels.findIndex(candidate => candidate.key === item.key);
      const currentIndex = syncStageLabels.findIndex(candidate => candidate.key === sync.stage);
      const done = complete || (currentIndex >= 0 && itemIndex < currentIndex);
      const active = item.key === sync.stage;
      return <View key={item.key} style={[styles.syncStageChip, active && styles.syncStageChipActive]}><Ionicons name={done ? "checkmark-circle" : active ? "radio-button-on" : "ellipse-outline"} size={13} color={done || active ? palette.green : palette.muted} /><Text maxFontSizeMultiplier={1.3} style={[styles.syncStageChipText, (done || active) && { color: palette.green }]}>{item.label}</Text></View>;
    })}</ScrollView>
  </AxCollapsible>;
}

function calculateHealthFactors(summary: ReturnType<typeof readingSummary> | undefined, scaleLatest: Map<Metric, DeviceReading>) {
  const activity = summary?.steps === undefined ? 0 : Math.min(100, Math.round((summary.steps / 8000) * 100));
  const sleepHoursValue = sleepHours(summary?.sleepMinutes);
  const recovery = sleepHoursValue === undefined ? 0 : Math.min(100, Math.round((sleepHoursValue / 8) * 100));
  const bodyReading = scaleLatest.get("bodyScore")?.value;
  const composition = bodyReading === undefined ? (scaleLatest.has("weight") ? 80 : 0) : Math.max(0, Math.min(100, Math.round(bodyReading)));
  const available = [activity, recovery, composition].filter(value => value > 0);
  const score = available.length ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length) : 0;
  const status = score >= 80 ? "Хорошее состояние" : score >= 60 ? "Стабильное состояние" : score > 0 ? "Есть точки роста" : "Нужны свежие данные";
  return { activity, recovery, composition, score, status };
}

function metricChange(samples: readonly DeviceReading[], metric: Metric) {
  const readings = samples.filter(sample => sample.metric === metric).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  if (readings.length < 2) return undefined;
  return readings[0].value - readings[1].value;
}

function SyncAction({ phase, progress, onPress }: { phase: ReturnType<typeof deviceSync.getSnapshot>["phase"]; progress: number; onPress: () => void }) {
  const rotation = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  const busy = phase === "reading" || phase === "saving";
  useEffect(() => {
    if (busy && !reduceMotion) rotation.value = withRepeat(withTiming(360, { duration: 950, easing: Easing.linear }), -1, false);
    else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: reduceMotion ? 0 : axMotion.quick });
    }
  }, [busy, reduceMotion, rotation]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const icon = phase === "complete" ? "checkmark" : phase === "error" ? "alert-circle-outline" : "sync-outline";
  const color = phase === "error" ? palette.coral : palette.green;
  return <AxPressable accessibilityLabel={busy ? `Синхронизация ${Math.round(progress)} процентов. Отменить` : "Синхронизировать данные"} accessibilityState={{ busy }} haptic onPress={onPress} style={styles.syncButton}>
    <Animated.View style={iconStyle}><Ionicons name={icon} size={22} color={color} /></Animated.View>
    {busy ? <Text maxFontSizeMultiplier={1.3} style={styles.syncProgress}>{Math.round(progress)}%</Text> : null}
  </AxPressable>;
}

function MeasurementProgress({ phase, progress }: { phase: ReturnType<typeof scaleSync.getSnapshot>["phase"]; progress: number }) {
  const reduceMotion = useAxReducedMotion();
  if (phase === "idle") return null;
  const labels = phase === "reading"
    ? progress < 20 ? ["Ищем весы", "Подойдите к весам и включите их"]
      : progress < 55 ? ["Весы подключены", "Встаньте босиком и стойте спокойно"]
        : progress < 90 ? ["Фиксируем результат", "Ожидаем устойчивое значение"]
          : ["Получаем состав тела", "Ещё несколько секунд"]
    : phase === "saving" ? ["Сохраняем измерение", "Результат привязывается к вашему аккаунту"]
      : phase === "complete" ? ["Измерение сохранено", "Новые данные уже доступны в истории"]
        : ["Не удалось завершить", "Проверьте подключение и попробуйте снова"];
  return <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(axMotion.standard)} exiting={reduceMotion ? undefined : FadeOut.duration(axMotion.quick)} style={[styles.measurementProgress, phase === "complete" && styles.measurementProgressSuccess, phase === "error" && styles.measurementProgressError]}>
    <View style={styles.measurementProgressTop}><Ionicons name={phase === "complete" ? "checkmark-circle" : phase === "error" ? "alert-circle" : "radio-outline"} size={18} color={phase === "error" ? palette.coral : palette.green} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.measurementProgressTitle}>{labels[0]}</Text><Text maxFontSizeMultiplier={1.3} style={styles.measurementProgressText}>{labels[1]}</Text></View>{phase === "reading" || phase === "saving" ? <Text maxFontSizeMultiplier={1.3} style={styles.measurementProgressValue}>{Math.round(progress)}%</Text> : null}</View>
    {phase === "reading" || phase === "saving" ? <View style={styles.measurementTrack}><Animated.View style={[styles.measurementFill, { width: `${Math.max(4, progress)}%` }]} /></View> : null}
  </Animated.View>;
}

function HealthOverview({
  braceletConnected,
  scaleConnected,
  braceletState,
  scaleState,
  braceletSummary,
  braceletLatest,
  scaleLatest,
  scaleIsDemo,
  allSamples,
  onRoute
}: {
  braceletConnected: boolean;
  scaleConnected: boolean;
  braceletState: ReturnType<typeof deviceSync.getSnapshot>;
  scaleState: ReturnType<typeof scaleSync.getSnapshot>;
  braceletSummary?: ReturnType<typeof readingSummary>;
  braceletLatest: Map<Metric, DeviceReading>;
  scaleLatest: Map<Metric, DeviceReading>;
  scaleIsDemo: boolean;
  allSamples: DeviceReading[];
  onRoute: (route: HealthRoute) => void;
}) {
  const [period, setPeriod] = useState<Period>("Месяц");
  const [trendMetric, setTrendMetric] = useState<Metric>("weight");
  const [initializing, setInitializing] = useState(!braceletState.batch && !scaleState.batch);
  useEffect(() => {
    const timer = setTimeout(() => setInitializing(false), 650);
    return () => clearTimeout(timer);
  }, []);
  const syncing = braceletState.phase === "reading" || braceletState.phase === "saving";
  const measuring = scaleState.phase === "reading" || scaleState.phase === "saving";
  const syncBracelet = () => syncing ? void deviceSync.cancel() : braceletState.batch && !braceletState.saved ? void deviceSync.retrySave() : braceletConnected ? void deviceSync.sync() : onRoute({ name: "devices" });
  const measureWeight = () => scaleConnected ? void scaleSync.sync() : onRoute({ name: "scale" });
  const factors = calculateHealthFactors(braceletSummary, scaleLatest);
  const trendInfo = metricByName.get(trendMetric) ?? metricByName.get("weight")!;
  const trendReadings = filterByPeriod(allSamples.filter(sample => sample.metric === trendMetric), period)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const latestTrend = trendReadings.at(-1)?.value;
  const firstTrend = trendReadings[0]?.value;
  const delta = latestTrend !== undefined && firstTrend !== undefined ? latestTrend - firstTrend : undefined;
  const scaleValues = ["weight", "bodyFatPercentage", "muscleMass", "bodyWaterPercentage"] as Metric[];

  const braceletCards = [
    { metric: "steps" as Metric, value: braceletSummary?.steps, unit: "", digits: 0 },
    { metric: "heartRate" as Metric, value: braceletSummary?.heartRate?.value, unit: "уд/мин", digits: 0 },
    { metric: "sleepDuration" as Metric, value: sleepHours(braceletSummary?.sleepMinutes), unit: "ч", digits: 1 },
    { metric: "oxygenSaturation" as Metric, value: braceletLatest.get("oxygenSaturation")?.value, unit: "%", digits: 0 }
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.overviewScroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={syncBracelet} tintColor={palette.green} colors={[palette.green]} progressBackgroundColor={palette.surface} />}
      >
        <View style={styles.header}>
          <View>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.pageTitle}>Здоровье</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.pageDate}>{currentDateLabel()}</Text>
          </View>
          <SyncAction phase={braceletState.phase} progress={braceletState.progress} onPress={syncBracelet} />
        </View>

        <View style={styles.deviceStatusRow}>
          <DeviceStatus label="Браслет" icon="watch-outline" connected={braceletConnected} hasData={Boolean(braceletState.batch)} onPress={() => onRoute({ name: "bracelet" })} />
          <DeviceStatus label="Весы" icon="scale-outline" connected={scaleConnected} hasData={Boolean(scaleState.batch)} onPress={() => onRoute({ name: "scale" })} />
        </View>

        {initializing ? <View style={styles.stateSkeleton}><AxSkeleton width="48%" height={11} /><AxSkeleton width="72%" height={27} /><View style={styles.skeletonFactors}><AxSkeleton height={31} /><AxSkeleton height={31} /><AxSkeleton height={31} /></View></View> : <AxReveal delay={40}>
          <AxPressable accessibilityLabel="Подробный анализ состояния" onPress={() => onRoute({ name: "analysis" })} style={styles.stateCard} scale={0.985}>
            <View style={styles.stateCopy}>
              <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>СОСТОЯНИЕ СЕГОДНЯ</Text>
              <Text maxFontSizeMultiplier={1.3} style={styles.stateTitle}>{factors.status}</Text>
              <View style={styles.factorRow}>
                <Factor label="Активность" value={factors.activity} color={palette.green} delay={80} />
                <Factor label="Восстановление" value={factors.recovery} color={palette.purple} delay={140} />
                <Factor label="Состав тела" value={factors.composition} color={palette.blue} delay={200} />
              </View>
            </View>
            <ScoreRing score={factors.score} />
            <Ionicons name="chevron-forward" size={18} color={palette.muted} style={styles.stateChevron} />
          </AxPressable>
        </AxReveal>}

        <SectionHeader title="Браслет" subtitle="Активность и восстановление" action="Все данные" onPress={() => onRoute({ name: "bracelet" })} />
        <View style={styles.metricGrid}>
          {braceletCards.map((item, index) => {
            const info = metricByName.get(item.metric)!;
            return <AxReveal key={item.metric} delay={70 + index * 45} style={styles.metricReveal}><MetricCard info={info} value={item.value} unit={item.unit} digits={item.digits} delta={metricChange(allSamples, item.metric)} onPress={() => onRoute({ name: "metric", metric: item.metric })} /></AxReveal>;
          })}
        </View>
        <AxButton style={styles.actionSpacing} label={syncing ? `${braceletState.progress}% · Отменить` : braceletState.batch && !braceletState.saved ? "Повторить сохранение" : braceletConnected ? "Синхронизировать браслет" : "Подключить браслет"} icon={syncing ? "close" : braceletState.batch && !braceletState.saved ? "cloud-upload-outline" : "sync-outline"} variant="outline" onPress={syncBracelet} />
        {braceletState.phase === "error" ? <InlineError text={syncErrorMessage(braceletState.error)} onRetry={syncBracelet} /> : null}

        <SectionHeader title="Умные весы" subtitle="Вес и состав тела" action="Подробнее" onPress={() => onRoute({ name: "scale" })} badge={scaleIsDemo ? "ДЕМО" : undefined} />
        <AxPressable accessibilityLabel="Открыть умные весы" onPress={() => onRoute({ name: "scale" })} style={styles.scaleCard}>
          <View style={styles.scaleLead}>
            <View style={styles.scaleIcon}><Ionicons name="scale-outline" size={24} color={palette.green} /></View>
            <View style={styles.flex}>
              <Text maxFontSizeMultiplier={1.3} style={styles.scaleLabel}>Последний вес</Text>
              {scaleLatest.get("weight") ? <View style={styles.numberRow}><AxAnimatedNumber value={scaleLatest.get("weight")!.value} format={(value) => valueLabel(value, 2)} style={styles.scaleWeight} /><Text maxFontSizeMultiplier={1.3} style={styles.scaleWeightUnit}>кг</Text></View> : <Text maxFontSizeMultiplier={1.3} style={styles.scaleWeight}>—</Text>}
              <Text maxFontSizeMultiplier={1.3} style={styles.caption}>{scaleState.batch ? dateTimeLabel(scaleState.batch.readAt, scaleState.batch.timeZone) : "Выполните первое измерение"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={palette.muted} />
          </View>
          <View style={styles.scaleMetrics}>
            {scaleValues.slice(1).map(metric => {
              const info = metricByName.get(metric)!;
              const reading = scaleLatest.get(metric);
              return <AxPressable key={metric} accessibilityLabel={info.label} onPress={() => onRoute({ name: "metric", metric })} style={styles.scaleMetric}>
                <View style={[styles.smallIcon, { backgroundColor: info.soft }]}><Ionicons name={info.icon} size={15} color={info.color} /></View>
                <Text maxFontSizeMultiplier={1.3} style={styles.scaleMetricValue}>{valueLabel(reading?.value, info.digits)}{reading ? ` ${info.unit}` : ""}</Text>
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.scaleMetricLabel}>{info.shortLabel}</Text>
                {reading?.origin === "mock" ? <Text maxFontSizeMultiplier={1.3} style={styles.scaleDemoText}>Демо</Text> : null}
              </AxPressable>;
            })}
          </View>
        </AxPressable>
        <AxButton style={styles.actionSpacing} label={measuring ? `${scaleState.progress}% · Отменить` : scaleConnected ? "Измерить" : "Подключить весы"} icon={measuring ? "close" : scaleConnected ? "scan-outline" : "bluetooth-outline"} onPress={measuring ? () => void scaleSync.cancel() : measureWeight} />
        <MeasurementProgress phase={scaleState.phase} progress={scaleState.progress} />
        {scaleState.phase === "error" ? <InlineError text={syncErrorMessage(scaleState.error)} onRetry={measureWeight} /> : null}

        <SectionHeader title="Динамика" action="История" onPress={() => onRoute({ name: "history" })} />
        <View style={styles.trendCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricChips}>
            {(["weight", "heartRate", "steps", "bodyFatPercentage"] as Metric[]).map(metric => {
              const info = metricByName.get(metric)!;
              const active = metric === trendMetric;
              return <AxFilterChip key={metric} label={info.shortLabel} selected={active} onPress={() => setTrendMetric(metric)} icon={info.icon} />;
            })}
          </ScrollView>
          <PeriodTabs value={period} onChange={setPeriod} />
          <Pressable accessibilityRole="button" onPress={() => onRoute({ name: "metric", metric: trendMetric })} style={styles.trendSummary}>
            <View>
              <Text maxFontSizeMultiplier={1.3} style={styles.trendLabel}>{trendInfo.label}</Text>
              {latestTrend !== undefined ? <View style={styles.numberRow}><AxAnimatedNumber value={latestTrend} format={(value) => valueLabel(value, trendInfo.digits)} style={styles.trendValue} /><Text maxFontSizeMultiplier={1.3} style={styles.trendUnit}>{trendInfo.unit}</Text></View> : <Text maxFontSizeMultiplier={1.3} style={styles.trendValue}>—</Text>}
            </View>
            <View style={[styles.deltaBadge, delta !== undefined && delta > 0 ? styles.deltaWarm : styles.deltaGood]}>
              <Ionicons name={delta !== undefined && delta > 0 ? "arrow-up" : "arrow-down"} size={12} color={delta !== undefined && delta > 0 ? palette.coral : palette.green} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.deltaText, delta !== undefined && delta > 0 ? styles.deltaTextWarm : styles.deltaTextGood]}>{delta === undefined ? "—" : valueLabel(Math.abs(delta), trendInfo.digits)}</Text>
            </View>
          </Pressable>
          <MetricChart readings={trendReadings} color={trendInfo.color} />
          <StatRow readings={trendReadings} info={trendInfo} />
        </View>

        <Pressable accessibilityRole="button" onPress={() => onRoute({ name: "reports" })} style={({ pressed }) => [styles.reportBanner, pressed && styles.cardPressed]}>
          <View style={styles.reportIcon}><Ionicons name="document-text-outline" size={22} color={palette.green} /></View>
          <View style={styles.flex}>
            <Text maxFontSizeMultiplier={1.3} style={styles.reportTitle}>Отчёты и экспорт</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.reportSubtitle}>Итоги недели, месяца и CSV</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={palette.muted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function HealthPage({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
    <AxReveal distance={6}><BackHeader title={title} subtitle={subtitle} onBack={onBack} />
      {children}
    </AxReveal>
  </ScrollView></View>;
}

function AnalysisScreen({ braceletSummary, scaleLatest, onBack }: { braceletSummary?: ReturnType<typeof readingSummary>; scaleLatest: Map<Metric, DeviceReading>; onBack: () => void }) {
  const health = calculateHealthFactors(braceletSummary, scaleLatest);
  const factors = [
    { title: "Активность", score: health.activity, icon: "footsteps-outline" as IconName, color: palette.green, text: braceletSummary?.steps ? `${Math.round(braceletSummary.steps).toLocaleString("ru-RU")} шагов сегодня` : "Синхронизируйте браслет" },
    { title: "Восстановление", score: health.recovery, icon: "moon-outline" as IconName, color: palette.purple, text: braceletSummary?.sleepMinutes ? `${valueLabel(sleepHours(braceletSummary.sleepMinutes), 1)} ч сна` : "Данных сна пока нет" },
    { title: "Состав тела", score: health.composition, icon: "body-outline" as IconName, color: palette.blue, text: scaleLatest.has("weight") ? `${valueLabel(scaleLatest.get("weight")?.value, 2)} кг · последнее измерение` : "Выполните измерение" }
  ];
  return <HealthPage title="Состояние сегодня" subtitle="Как складывается общий результат" onBack={onBack}>
    <View style={styles.analysisHero}><ScoreRing score={health.score} large /><Text maxFontSizeMultiplier={1.3} style={styles.analysisTitle}>{health.status}</Text><Text maxFontSizeMultiplier={1.3} style={styles.analysisText}>Сводный балл помогает быстро увидеть общую картину, но не заменяет консультацию специалиста.</Text></View>
    <View style={styles.factorCards}>{factors.map(factor => <View key={factor.title} style={styles.factorCard}><View style={[styles.factorCardIcon, { backgroundColor: `${factor.color}18` }]}><Ionicons name={factor.icon} size={21} color={factor.color} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.factorCardTitle}>{factor.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.cardSubtitle}>{factor.text}</Text><View style={styles.factorTrack}><View style={[styles.factorFill, { width: `${factor.score}%`, backgroundColor: factor.color }]} /></View></View><Text maxFontSizeMultiplier={1.3} style={[styles.factorScore, { color: factor.color }]}>{factor.score || "—"}</Text></View>)}</View>
  </HealthPage>;
}

function BackHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <View style={styles.backHeader}><Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Ionicons name="chevron-back" size={22} color={palette.ink} /></Pressable><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.backTitle}>{title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.backSubtitle}>{subtitle}</Text></View></View>;
}

function DeviceStatus({ label, icon, connected, hasData, onPress }: { label: string; icon: IconName; connected: boolean; hasData: boolean; onPress: () => void }) {
  const state = connected ? "подключено" : hasData ? "есть сохранённые данные, сейчас отключено" : "нет данных";
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${state}`} accessibilityState={{ selected: connected }} onPress={onPress} style={({ pressed }) => [styles.devicePill, pressed && styles.pressed]}><View style={[styles.statusDot, { backgroundColor: connected ? palette.green : hasData ? palette.amber : palette.muted }]} /><Ionicons name={icon} size={16} color={palette.ink} /><Text maxFontSizeMultiplier={1.3} style={styles.devicePillText}>{label}</Text><Text maxFontSizeMultiplier={1.3} style={styles.devicePillStatus}>{connected ? "онлайн" : hasData ? "данные" : "нет"}</Text></Pressable>;
}

function ScoreRing({ score, large = false }: { score: number; large?: boolean }) {
  const size = large ? 144 : 106;
  const radius = large ? 57 : 40;
  const stroke = large ? 12 : 10;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => { progress.value = withTiming(score / 100, { duration: reduceMotion ? 0 : 360, easing: Easing.out(Easing.cubic) }); }, [progress, reduceMotion, score]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.value) }));
  return <View accessible accessibilityRole="progressbar" accessibilityLabel="Общий балл здоровья" accessibilityValue={{ min: 0, max: 100, now: score, text: score ? `${score} из 100` : "Нет данных" }} style={[styles.scoreRing, { width: size, height: size }]}><Svg importantForAccessibility="no-hide-descendants" width={size} height={size} viewBox={`0 0 ${size} ${size}`}><Circle cx={size / 2} cy={size / 2} r={radius} stroke="#DCE5DF" strokeWidth={stroke} fill="none" /><AnimatedCircle animatedProps={animatedProps} cx={size / 2} cy={size / 2} r={radius} stroke={palette.green} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></Svg><Text maxFontSizeMultiplier={1.3} style={[styles.scoreRingValue, large && styles.scoreRingValueLarge]}>{score || "—"}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.scoreRingCaption, large && styles.scoreRingCaptionLarge]}>из 100</Text></View>;
}

function Factor({ label, value, color, delay = 0 }: { label: string; value: number; color: string; delay?: number }) {
  const progress = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => { progress.value = withTiming(value, { duration: reduceMotion ? 0 : axMotion.slow, easing: Easing.out(Easing.cubic) }); }, [progress, reduceMotion, value]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` }));
  return <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(axMotion.standard).delay(delay)} style={styles.factor}><View style={styles.factorTop}><Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.factorLabel}>{label}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.factorValue, { color }]}>{value || "—"}</Text></View><View style={styles.factorMiniTrack}><Animated.View style={[styles.factorMiniFill, { backgroundColor: color }, fillStyle]} /></View></Animated.View>;
}

function SectionHeader({ title, subtitle, action, badge, onPress }: { title: string; subtitle?: string; action?: string; badge?: string; onPress?: () => void }) {
  return <View style={styles.sectionHeader}><View style={styles.flex}><View style={styles.sectionTitleRow}><Text maxFontSizeMultiplier={1.3} style={styles.sectionTitle}>{title}</Text>{badge ? <View style={styles.demoBadge}><Text maxFontSizeMultiplier={1.3} style={styles.demoBadgeText}>{badge}</Text></View> : null}</View>{subtitle ? <Text maxFontSizeMultiplier={1.3} style={styles.sectionSubtitle}>{subtitle}</Text> : null}</View>{action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.sectionAction}><Text maxFontSizeMultiplier={1.3} style={styles.sectionActionText}>{action}</Text><Ionicons name="chevron-forward" size={15} color={palette.green} /></Pressable> : null}</View>;
}

function MetricCard({ info, value, unit, digits, delta, updatedAt, onPress }: { info: MetricInfo; value?: number; unit: string; digits: number; delta?: number; updatedAt?: string; onPress: () => void }) {
  const deltaLabel = delta === undefined ? "Последнее значение" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${valueLabel(Math.abs(delta), digits)} ${unit}`;
  return <AxPressable accessibilityLabel={`${info.label}: ${valueLabel(value, digits)} ${unit}`} onPress={onPress} style={styles.metricCard}><View style={styles.metricCardTop}><View style={[styles.metricIcon, { backgroundColor: info.soft }]}><Ionicons name={info.icon} size={19} color={info.color} /></View><Ionicons name="chevron-forward" size={15} color={palette.muted} /></View><Text maxFontSizeMultiplier={1.3} style={styles.metricCardLabel}>{info.shortLabel}</Text><Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={styles.metricCardValue}>{valueLabel(value, digits)} <Text maxFontSizeMultiplier={1.3} style={styles.metricCardUnit}>{value !== undefined ? unit : ""}</Text></Text><Text maxFontSizeMultiplier={1.3} style={[styles.metricCardDelta, delta !== undefined && { color: info.color }]}>{value === undefined ? "Нет данных" : deltaLabel}</Text>{updatedAt ? <Text maxFontSizeMultiplier={1.3} style={styles.metricCardTime}>{dateTimeLabel(updatedAt)}</Text> : null}</AxPressable>;
}

function PeriodTabs({ value, onChange, compact = false }: { value: Period; onChange: (value: Period) => void; compact?: boolean }) {
  return <View style={[styles.periodControl, compact && styles.periodControlCompact]}><AxSegmentedControl value={value} options={periods.map(period => ({ value: period, label: period }))} onChange={onChange} /></View>;
}

function MetricChart({ readings, color }: { readings: DeviceReading[]; color: string }) {
  if (readings.length === 0) return <View style={styles.chartEmpty}><Ionicons name="analytics-outline" size={26} color={palette.muted} /><Text maxFontSizeMultiplier={1.3} style={styles.chartEmptyText}>Нет данных для графика</Text></View>;
  return <InteractiveMetricChart readings={readings} color={color} />;
}

function InteractiveMetricChart({ readings, color }: { readings: DeviceReading[]; color: string }) {
  const displayReadings = readings.length <= 32 ? readings : readings.filter((_, index) => index % Math.ceil(readings.length / 32) === 0 || index === readings.length - 1);
  const dataKey = `${displayReadings.length}:${displayReadings[0]?.recordedAt ?? ""}:${displayReadings.at(-1)?.recordedAt ?? ""}:${displayReadings.at(-1)?.value ?? ""}`;
  const [selected, setSelected] = useState(displayReadings.length - 1);
  const [chartWidth, setChartWidth] = useState(320);
  const draw = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => {
    setSelected(displayReadings.length - 1);
    draw.value = 0;
    draw.value = withTiming(1, { duration: reduceMotion ? 0 : 360, easing: Easing.out(Easing.cubic) });
  }, [dataKey, displayReadings.length, draw, reduceMotion]);
  const values = displayReadings.map(reading => reading.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = displayReadings.map((reading, index) => ({ x: displayReadings.length === 1 ? 160 : 18 + index * (284 / (displayReadings.length - 1)), y: 126 - ((reading.value - min) / range) * 88 }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${path} L ${points.at(-1)?.x ?? 302} 142 L ${points[0]?.x ?? 18} 142 Z`;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: 1000 * (1 - draw.value), opacity: draw.value }));
  const updateSelection = (event: GestureResponderEvent) => {
    const location = Math.max(0, Math.min(chartWidth, event.nativeEvent.locationX));
    const index = Math.max(0, Math.min(displayReadings.length - 1, Math.round((location / chartWidth) * (displayReadings.length - 1))));
    setSelected(index);
  };
  const selectedPoint = points[selected];
  const selectedReading = displayReadings[selected];
  return <View
    accessibilityRole="image"
    accessibilityLabel={`График: ${displayReadings.length} значений, от ${valueLabel(min, 1)} до ${valueLabel(max, 1)}`}
    style={styles.chartWrap}
    onLayout={(event: LayoutChangeEvent) => setChartWidth(event.nativeEvent.layout.width)}
    onTouchStart={updateSelection}
    onTouchMove={updateSelection}
  >
    {selectedReading && selectedPoint ? <View pointerEvents="none" style={[styles.chartTooltip, { left: Math.max(8, Math.min(chartWidth - 112, (selectedPoint.x / 320) * chartWidth - 52)) }]}><Text maxFontSizeMultiplier={1.3} style={styles.chartTooltipValue}>{valueLabel(selectedReading.value, 2)}</Text><Text maxFontSizeMultiplier={1.3} style={styles.chartTooltipDate}>{dateTimeLabel(selectedReading.recordedAt)}</Text></View> : null}
    <Svg width="100%" height="160" viewBox="0 0 320 160"><Path d="M18 38 H302 M18 82 H302 M18 126 H302" stroke={palette.line} strokeWidth="1" /><Path d={area} fill={color} opacity="0.09" /><AnimatedPath animatedProps={lineProps} d={path} strokeDasharray="1000 1000" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />{points.map((point, index) => <Circle key={`${point.x}:${index}`} cx={point.x} cy={point.y} r={index === selected ? 5 : 2.5} fill={palette.surface} stroke={color} strokeWidth={index === selected ? 3 : 2} />)}</Svg>
  </View>;
}

function StatRow({ readings, info }: { readings: DeviceReading[]; info: MetricInfo }) {
  const values = readings.map(reading => reading.value);
  const min = values.length ? Math.min(...values) : undefined;
  const max = values.length ? Math.max(...values) : undefined;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  return <View style={styles.statRow}><ChartStat label="Минимум" value={valueLabel(min, info.digits)} unit={min === undefined ? "" : info.unit} /><ChartStat label="Среднее" value={valueLabel(average, info.digits)} unit={average === undefined ? "" : info.unit} /><ChartStat label="Максимум" value={valueLabel(max, info.digits)} unit={max === undefined ? "" : info.unit} /></View>;
}

function ChartStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <View style={styles.chartStat}><Text maxFontSizeMultiplier={1.3} style={styles.chartStatLabel}>{label}</Text><Text maxFontSizeMultiplier={1.3} style={styles.chartStatValue}>{value} <Text maxFontSizeMultiplier={1.3} style={styles.chartStatUnit}>{unit}</Text></Text></View>;
}

function InlineError({ text, onRetry, action = "Повторить" }: { text: string; onRetry: () => void; action?: string }) {
  return <View style={styles.errorCard}><Ionicons name="alert-circle-outline" size={18} color={palette.danger} /><Text maxFontSizeMultiplier={1.3} accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorText}>{text}</Text><AxPressable accessibilityLabel={action} onPress={onRetry}><Text maxFontSizeMultiplier={1.3} style={styles.errorAction}>{action}</Text></AxPressable></View>;
}

function EmptyState({ icon, title, text, action, onPress }: { icon: IconName; title: string; text: string; action?: string; onPress?: () => void }) {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name={icon} size={27} color={palette.green} /></View><Text maxFontSizeMultiplier={1.3} style={styles.emptyTitle}>{title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.emptyText}>{text}</Text>{action && onPress ? <Pressable onPress={onPress} style={styles.emptyButton}><Text maxFontSizeMultiplier={1.3} style={styles.emptyButtonText}>{action}</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  overviewScroll: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 116 },
  pageScroll: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 116 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  pageTitle: { color: palette.ink, fontSize: 31, lineHeight: 37, fontWeight: "800", letterSpacing: -0.7 },
  pageDate: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  syncButton: { width: 50, height: 50, borderRadius: 17, backgroundColor: palette.greenSoft, borderWidth: 1, borderColor: "#D2E7DB", alignItems: "center", justifyContent: "center" },
  syncProgress: { position: "absolute", bottom: 3, color: palette.green, fontSize: 7, fontWeight: "900" },
  pressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.992 }] },
  deviceStatusRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  devicePill: { flex: 1, minHeight: 42, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  devicePillText: { flex: 1, color: palette.ink, fontSize: 12, fontWeight: "700" },
  devicePillStatus: { color: palette.muted, fontSize: 9, fontWeight: "700" },
  deviceHero: { borderRadius: 23, padding: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 14 },
  deviceHeroTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  deviceHeroIcon: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  deviceHeroTitle: { color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  connectionBadge: { minHeight: 28, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.surfaceMuted },
  connectionBadgeOnline: { backgroundColor: palette.greenSoft },
  connectionBadgeText: { color: palette.muted, fontSize: 9, fontWeight: "800" },
  connectionBadgeTextOnline: { color: palette.green },
  deviceUpdated: { color: palette.muted, fontSize: 10, marginTop: 12 },
  deviceFacts: { flexDirection: "row", gap: 7, marginTop: 14 },
  deviceFact: { flex: 1, minWidth: 0, minHeight: 56, borderRadius: 15, paddingHorizontal: 9, backgroundColor: palette.surfaceMuted, flexDirection: "row", alignItems: "center", gap: 7 },
  deviceFactValue: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  deviceFactLabel: { color: palette.muted, fontSize: 8, marginTop: 2 },
  syncStageCard: { borderRadius: 21, padding: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 20, overflow: "hidden" },
  syncStageComplete: { backgroundColor: palette.greenSoft, borderColor: palette.green },
  syncStageError: { backgroundColor: palette.dangerSoft, borderColor: "#F0D1D1" },
  syncStageHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  syncStageIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  syncStageTitle: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  syncStageDetail: { color: palette.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  syncStagePercent: { color: palette.green, fontSize: 12, fontWeight: "900" },
  syncStageTrack: { height: 5, borderRadius: 3, backgroundColor: "#DDE8E1", overflow: "hidden", marginTop: 12 },
  syncStageFill: { height: 5, borderRadius: 3, backgroundColor: palette.green },
  syncStageChips: { gap: 6, paddingTop: 12, paddingRight: 8 },
  syncStageChip: { minHeight: 28, paddingHorizontal: 8, borderRadius: 10, backgroundColor: palette.surfaceMuted, flexDirection: "row", alignItems: "center", gap: 4 },
  syncStageChipActive: { backgroundColor: palette.greenSoft },
  syncStageChipText: { color: palette.muted, fontSize: 8, fontWeight: "700" },
  pressureCard: { minHeight: 91, borderRadius: 20, padding: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 12 },
  pressureValue: { color: palette.ink, fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 2 },
  warningList: { gap: 7, marginBottom: 14 },
  warningRow: { minHeight: 44, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: palette.amberSoft, flexDirection: "row", alignItems: "center", gap: 8 },
  warningText: { flex: 1, color: "#765A25", fontSize: 9, lineHeight: 13 },
  stateCard: { minHeight: 196, borderRadius: 24, backgroundColor: "#18231D", padding: 18, flexDirection: "row", overflow: "hidden", marginBottom: 24 },
  stateSkeleton: { minHeight: 196, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 18, gap: 13, marginBottom: 24 },
  skeletonFactors: { gap: 9, marginTop: 3 },
  stateCopy: { flex: 1, zIndex: 2, paddingRight: 8 },
  eyebrow: { color: palette.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  stateTitle: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 8 },
  factorRow: { marginTop: 13, gap: 9 },
  factor: { width: "100%" },
  factorTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  factorLabel: { color: "#B9C4BD", fontSize: 9, flex: 1 },
  factorValue: { fontSize: 10, fontWeight: "800" },
  factorMiniTrack: { height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: "#34423A" },
  factorMiniFill: { height: 3, borderRadius: 2 },
  scoreRing: { alignItems: "center", justifyContent: "center" },
  scoreRingValue: { position: "absolute", top: 32, color: "#FFFFFF", fontSize: 25, fontWeight: "800" },
  scoreRingCaption: { position: "absolute", top: 61, color: "#AAB5AE", fontSize: 9 },
  scoreRingValueLarge: { top: 42, color: palette.ink, fontSize: 34 },
  scoreRingCaptionLarge: { top: 82, color: palette.muted, fontSize: 11 },
  stateChevron: { position: "absolute", right: 16, bottom: 15 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2, marginBottom: 12 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { color: palette.ink, fontSize: 21, lineHeight: 27, fontWeight: "800", letterSpacing: -0.35 },
  sectionSubtitle: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 1 },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 1, minHeight: 36 },
  sectionActionText: { color: palette.green, fontSize: 12, fontWeight: "700" },
  demoBadge: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: palette.amberSoft },
  demoBadgeText: { color: "#8A6728", fontSize: 8, fontWeight: "900", letterSpacing: 0.55 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 11 },
  metricReveal: { width: "48.5%" },
  metricCard: { width: "100%", minHeight: 136, borderRadius: 21, padding: 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  metricCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  metricIcon: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  metricCardLabel: { color: palette.muted, fontSize: 11, lineHeight: 15 },
  metricCardValue: { color: palette.ink, fontSize: 23, lineHeight: 29, fontWeight: "800", marginTop: 2 },
  metricCardUnit: { color: palette.muted, fontSize: 10, fontWeight: "600" },
  metricCardDelta: { color: palette.muted, fontSize: 9, marginTop: 5 },
  metricCardTime: { color: palette.muted, fontSize: 7, marginTop: 4 },
  outlineButton: { minHeight: 49, borderRadius: 17, borderWidth: 1, borderColor: palette.green, backgroundColor: palette.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 22, paddingHorizontal: 14 },
  outlineButtonText: { color: palette.green, fontSize: 13, fontWeight: "800" },
  primaryButton: { minHeight: 51, borderRadius: 17, backgroundColor: palette.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14, marginBottom: 22 },
  primaryButtonText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  actionSpacing: { marginBottom: 22 },
  scaleCard: { borderRadius: 23, padding: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 10 },
  scaleLead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 15 },
  scaleIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: palette.greenSoft, alignItems: "center", justifyContent: "center" },
  scaleLabel: { color: palette.muted, fontSize: 10 },
  scaleWeight: { color: palette.ink, fontSize: 27, lineHeight: 32, fontWeight: "800" },
  scaleWeightUnit: { color: palette.muted, fontSize: 12, fontWeight: "600" },
  numberRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  caption: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  scaleMetrics: { flexDirection: "row", gap: 7 },
  scaleMetric: { flex: 1, minWidth: 0, borderRadius: 16, padding: 9, backgroundColor: palette.surfaceMuted },
  smallIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  scaleMetricValue: { color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: "800", marginTop: 8 },
  scaleMetricLabel: { color: palette.muted, fontSize: 9, marginTop: 2 },
  scaleDemoText: { alignSelf: "flex-start", color: "#8A6728", backgroundColor: palette.amberSoft, fontSize: 7, fontWeight: "900", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, marginTop: 4, overflow: "hidden" },
  measurementProgress: { borderRadius: 18, padding: 13, marginTop: -12, marginBottom: 22, backgroundColor: palette.greenSoft, borderWidth: 1, borderColor: "#D1E5D9" },
  measurementProgressSuccess: { backgroundColor: "#EAF5EF" },
  measurementProgressError: { backgroundColor: palette.dangerSoft, borderColor: "#F2CECE" },
  measurementProgressTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  measurementProgressTitle: { color: palette.ink, fontSize: 11, fontWeight: "800" },
  measurementProgressText: { color: palette.muted, fontSize: 9, lineHeight: 13, marginTop: 1 },
  measurementProgressValue: { color: palette.green, fontSize: 10, fontWeight: "900" },
  measurementTrack: { height: 4, borderRadius: 2, backgroundColor: "#CFE1D7", overflow: "hidden", marginTop: 10 },
  measurementFill: { height: 4, borderRadius: 2, backgroundColor: palette.green },
  trendCard: { borderRadius: 23, padding: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 23 },
  metricChips: { gap: 7, paddingBottom: 12 },
  metricChip: { minHeight: 34, borderRadius: 12, justifyContent: "center", paddingHorizontal: 12, backgroundColor: palette.surfaceMuted },
  metricChipActive: { backgroundColor: palette.ink },
  metricChipText: { color: palette.text, fontSize: 11, fontWeight: "700" },
  metricChipTextActive: { color: "#FFF" },
  periodControl: { marginBottom: 12 },
  periodControlCompact: { marginBottom: 0 },
  periodTabs: { gap: 7, paddingBottom: 12 },
  periodTabsCompact: { paddingBottom: 0 },
  periodTab: { minHeight: 34, borderRadius: 12, justifyContent: "center", paddingHorizontal: 11, backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.line },
  periodTabActive: { backgroundColor: palette.greenSoft, borderColor: "#C7DDCF" },
  periodTabText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  periodTabTextActive: { color: palette.green },
  trendSummary: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 2 },
  trendLabel: { color: palette.muted, fontSize: 11 },
  trendValue: { color: palette.ink, fontSize: 25, lineHeight: 31, fontWeight: "800" },
  trendUnit: { color: palette.muted, fontSize: 10, fontWeight: "600" },
  deltaBadge: { minHeight: 28, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8 },
  deltaGood: { backgroundColor: palette.greenSoft },
  deltaWarm: { backgroundColor: palette.coralSoft },
  deltaText: { fontSize: 10, fontWeight: "800" },
  deltaTextGood: { color: palette.green },
  deltaTextWarm: { color: palette.coral },
  chartWrap: { height: 160, marginHorizontal: -2, marginTop: 3 },
  chartTooltip: { position: "absolute", top: 3, width: 104, zIndex: 3, borderRadius: 11, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: palette.ink, alignItems: "center" },
  chartTooltipValue: { color: palette.white, fontSize: 11, fontWeight: "900" },
  chartTooltipDate: { color: "#B9C4BD", fontSize: 7, marginTop: 1 },
  chartEmpty: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: 7 },
  chartEmptyText: { color: palette.muted, fontSize: 11 },
  statRow: { flexDirection: "row", gap: 7, marginTop: 4 },
  chartStat: { flex: 1, borderRadius: 13, padding: 9, backgroundColor: palette.surfaceMuted },
  chartStatLabel: { color: palette.muted, fontSize: 8 },
  chartStatValue: { color: palette.ink, fontSize: 12, fontWeight: "800", marginTop: 4 },
  chartStatUnit: { color: palette.muted, fontSize: 8, fontWeight: "600" },
  reportBanner: { minHeight: 82, borderRadius: 21, padding: 14, backgroundColor: palette.greenSoft, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 4 },
  reportIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" },
  reportTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  reportSubtitle: { color: palette.muted, fontSize: 10, marginTop: 4 },
  errorCard: { minHeight: 54, borderRadius: 15, padding: 11, backgroundColor: palette.dangerSoft, flexDirection: "row", alignItems: "center", gap: 8, marginTop: -14, marginBottom: 20 },
  errorText: { flex: 1, color: palette.danger, fontSize: 10, lineHeight: 15 },
  errorAction: { color: palette.danger, fontSize: 10, fontWeight: "800" },
  backHeader: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 20 },
  backButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" },
  backTitle: { color: palette.ink, fontSize: 24, lineHeight: 29, fontWeight: "800", letterSpacing: -0.4 },
  backSubtitle: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  detailHero: { borderRadius: 24, padding: 20, alignItems: "center", backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 14 },
  detailIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  detailValue: { color: palette.ink, fontSize: 38, lineHeight: 45, fontWeight: "800", letterSpacing: -0.8 },
  detailUnit: { color: palette.muted, fontSize: 13, fontWeight: "600" },
  detailStatus: { fontSize: 12, fontWeight: "800", marginTop: 4, marginBottom: 5 },
  demoPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: palette.amberSoft, marginTop: 10 },
  demoPillText: { color: "#8A6728", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  specialCard: { borderRadius: 22, padding: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 14 },
  specialHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  specialTitle: { color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  specialSubtitle: { color: palette.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  specialPercent: { fontSize: 22, lineHeight: 27, fontWeight: "900" },
  specialRoundIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  regularityBadge: { maxWidth: "52%", minHeight: 30, borderRadius: 11, paddingHorizontal: 9, backgroundColor: palette.purpleSoft, flexDirection: "row", alignItems: "center", gap: 5 },
  regularityText: { flexShrink: 1, color: palette.purple, fontSize: 8, fontWeight: "800" },
  sleepTimeRow: { minHeight: 64, marginTop: 13, borderRadius: 16, paddingHorizontal: 12, backgroundColor: palette.surfaceMuted, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sleepTimeline: { height: 12, borderRadius: 6, overflow: "hidden", flexDirection: "row", gap: 2, marginTop: 14, backgroundColor: "#ECEDEC" },
  sleepStage: { minWidth: 4, height: 12, borderRadius: 4 },
  sleepLegend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  sleepLegendItem: { width: "47%", flexDirection: "row", alignItems: "center", gap: 5 },
  sleepLegendDot: { width: 7, height: 7, borderRadius: 4 },
  sleepLegendLabel: { flex: 1, color: palette.muted, fontSize: 8 },
  sleepLegendValue: { color: palette.ink, fontSize: 8, fontWeight: "800" },
  specialUnavailable: { minHeight: 48, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: palette.surfaceMuted, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 13 },
  specialUnavailableText: { flex: 1, color: palette.muted, fontSize: 9, lineHeight: 13 },
  specialFacts: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 12 },
  specialFact: { flex: 1, minWidth: 0 },
  specialFactRight: { alignItems: "flex-end" },
  specialFactValue: { color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  specialFactLabel: { color: palette.muted, fontSize: 8, marginTop: 2 },
  goalTrack: { height: 8, borderRadius: 4, backgroundColor: "#E0EAE4", overflow: "hidden", marginTop: 13 },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: palette.green },
  dayBars: { height: 112, flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 15 },
  dayBarColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  dayBarTrack: { flex: 1, width: 18, borderRadius: 9, backgroundColor: "#E8ECE9", overflow: "hidden", justifyContent: "flex-end" },
  dayBarFill: { width: 18, borderRadius: 9, backgroundColor: palette.green },
  dayBarLabel: { color: palette.muted, fontSize: 8, marginTop: 6 },
  heartFacts: { flexDirection: "row", flexWrap: "wrap", rowGap: 13, columnGap: 8, marginTop: 15 },
  specialFootnote: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 13 },
  pressurePair: { fontSize: 22, lineHeight: 28, fontWeight: "900" },
  detailChartCard: { borderRadius: 23, padding: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 12 },
  detailChartHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardTitle: { color: palette.ink, fontSize: 17, fontWeight: "800" },
  cardSubtitle: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  changeBox: { alignItems: "flex-end" },
  changeLabel: { color: palette.muted, fontSize: 9 },
  changeValue: { fontSize: 12, fontWeight: "800", marginTop: 3 },
  explanationCard: { borderRadius: 18, padding: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  explanationTitle: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  explanationText: { color: palette.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  readingList: { borderRadius: 20, paddingHorizontal: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 10 },
  listTitle: { color: palette.ink, fontSize: 15, fontWeight: "800", paddingVertical: 14 },
  readingRow: { minHeight: 58, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  readingDate: { color: palette.text, fontSize: 11, fontWeight: "700" },
  readingValue: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  filterCard: { borderRadius: 21, padding: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 15 },
  filterLabel: { color: palette.muted, fontSize: 9, fontWeight: "700", marginBottom: 7 },
  sourceTabs: { flexDirection: "row", gap: 7, marginBottom: 14 },
  sourceTab: { flex: 1, minHeight: 37, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceMuted },
  sourceTabActive: { backgroundColor: palette.ink },
  sourceTabText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  sourceTabTextActive: { color: "#FFF" },
  filterMetricRow: { gap: 7, paddingBottom: 14 },
  filterMetricChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: "transparent" },
  filterMetricChipActive: { backgroundColor: palette.greenSoft, borderColor: "#CFE4D8" },
  filterMetricText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  filterMetricTextActive: { color: palette.green },
  historyCountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyCount: { minWidth: 31, height: 31, borderRadius: 11, overflow: "hidden", backgroundColor: palette.greenSoft, color: palette.green, textAlign: "center", lineHeight: 31, fontSize: 11, fontWeight: "800" },
  emptyState: { minHeight: 210, borderRadius: 22, padding: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: palette.greenSoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: "800", marginTop: 11 },
  emptyText: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5, maxWidth: 265 },
  emptyButton: { minHeight: 41, borderRadius: 14, backgroundColor: palette.green, paddingHorizontal: 15, alignItems: "center", justifyContent: "center", marginTop: 13 },
  emptyButtonText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  measurementHero: { borderRadius: 22, padding: 19, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: "center", marginBottom: 12 },
  measurementSourceIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  measurementHeroTitle: { color: palette.ink, fontSize: 20, fontWeight: "800", marginTop: 10 },
  measurementGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 12 },
  measurementMetric: { width: "48.5%", minHeight: 118, borderRadius: 19, padding: 12, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  measurementMetricLabel: { color: palette.muted, fontSize: 10, marginTop: 8 },
  measurementMetricValue: { color: palette.ink, fontSize: 18, fontWeight: "800", marginTop: 3 },
  measurementMetricUnit: { color: palette.muted, fontSize: 8, fontWeight: "600" },
  mockCaption: { color: "#8A6728", fontSize: 8, fontWeight: "800", marginTop: 5 },
  disclaimer: { borderRadius: 18, padding: 14, backgroundColor: palette.greenSoft, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  disclaimerText: { flex: 1, color: palette.text, fontSize: 10, lineHeight: 16 },
  reportPeriodTabs: { flexDirection: "row", padding: 4, borderRadius: 16, backgroundColor: "#E9ECE8", marginBottom: 14 },
  reportPeriodTab: { flex: 1, minHeight: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  reportPeriodTabActive: { backgroundColor: palette.surface },
  reportPeriodText: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  reportPeriodTextActive: { color: palette.ink },
  reportSummaryCard: { borderRadius: 24, padding: 19, backgroundColor: "#18231D", marginBottom: 12 },
  reportBigValue: { color: "#FFF", fontSize: 44, fontWeight: "800", marginTop: 9 },
  reportBigLabel: { color: "#B9C4BD", fontSize: 11 },
  reportFacts: { flexDirection: "row", gap: 8, marginTop: 17 },
  reportFact: { flex: 1, borderRadius: 14, padding: 10, backgroundColor: "#2A372F" },
  reportFactValue: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  reportFactLabel: { color: "#AEBAB2", fontSize: 8, marginTop: 3 },
  reportPreview: { borderRadius: 21, paddingHorizontal: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 12 },
  reportPreviewRow: { minHeight: 51, borderTopWidth: 1, borderTopColor: palette.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  reportPreviewLabel: { flex: 1, color: palette.text, fontSize: 11 },
  reportPreviewValue: { color: palette.ink, fontSize: 11, fontWeight: "800" },
  analysisHero: { alignItems: "center", borderRadius: 24, padding: 22, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, marginBottom: 12 },
  analysisTitle: { color: palette.ink, fontSize: 21, fontWeight: "800", marginTop: 8 },
  analysisText: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center", maxWidth: 285, marginTop: 6 },
  factorCards: { gap: 9 },
  factorCard: { minHeight: 91, borderRadius: 20, padding: 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "center", gap: 11 },
  factorCardIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  factorCardTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  factorTrack: { height: 4, borderRadius: 2, backgroundColor: "#E8EBE7", overflow: "hidden", marginTop: 8 },
  factorFill: { height: 4, borderRadius: 2 },
  factorScore: { width: 28, textAlign: "right", fontSize: 16, fontWeight: "800" },
  flex: { flex: 1, minWidth: 0 }
});
