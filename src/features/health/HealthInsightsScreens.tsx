import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { TabSwipeGuard, TabSwipeScrollView as ScrollView } from "../../ui/SwipeTabs";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import type { DeviceReading, Metric } from "../../devices/types";
import { AxBottomSheet, AxSnackbar } from "../../ui/feedback";
import { AxCollapsible, AxReveal } from "../../ui/motion";
import { AxBadge, AxButton, AxCard, AxFilterChip, AxPressable, AxSegmentedControl, AxSkeleton, AxStatePanel } from "../../ui/primitives";
import { axColors, axMotion } from "../../ui/tokens";
import { useAxReducedMotion, useAxTheme } from "../../ui/theme";
import { shareHealthExport, type HealthExportKind, type HealthReportPeriod } from "./healthExport";

type IconName = ComponentProps<typeof Ionicons>["name"];
type SourceFilter = "all" | "bracelet" | "scale";
type HistoryPeriod = "all" | "7d" | "30d" | "90d" | "year";
type HistorySort = "newest" | "oldest";
type DynamicsPeriod = "7 дней" | "Месяц" | "3 месяца" | "Год";

export type HealthMeasurement = {
  id: string;
  source: "bracelet" | "scale";
  recordedAt: string;
  samples: DeviceReading[];
  saved: boolean;
};

export type HealthHistoryFilters = {
  source: SourceFilter;
  metric: "all" | Metric;
  period: HistoryPeriod;
  realOnly: boolean;
  sort: HistorySort;
};

export const defaultHealthHistoryFilters: HealthHistoryFilters = {
  source: "all",
  metric: "all",
  period: "all",
  realOnly: false,
  sort: "newest"
};

type MetricUi = { label: string; short: string; icon: IconName; color: string; soft: string; digits: number; unit: string };
const fallbackMetric: MetricUi = { label: "Показатель", short: "Значение", icon: "pulse-outline", color: axColors.green, soft: axColors.greenSoft, digits: 1, unit: "" };
const metricUi: Partial<Record<Metric, MetricUi>> = {
  steps: { label: "Шаги", short: "Шаги", icon: "footsteps-outline", color: axColors.green, soft: axColors.greenSoft, digits: 0, unit: "" },
  heartRate: { label: "Пульс", short: "Пульс", icon: "heart-outline", color: axColors.coral, soft: axColors.coralSoft, digits: 0, unit: "уд/мин" },
  sleepDuration: { label: "Продолжительность сна", short: "Сон", icon: "moon-outline", color: axColors.purple, soft: axColors.purpleSoft, digits: 1, unit: "ч" },
  oxygenSaturation: { label: "Насыщение кислородом", short: "SpO₂", icon: "water-outline", color: axColors.blue, soft: axColors.blueSoft, digits: 0, unit: "%" },
  hrv: { label: "Вариабельность пульса", short: "HRV", icon: "pulse-outline", color: axColors.green, soft: axColors.greenSoft, digits: 0, unit: "мс" },
  stress: { label: "Уровень стресса", short: "Стресс", icon: "flash-outline", color: axColors.amber, soft: axColors.amberSoft, digits: 0, unit: "/100" },
  bodyTemperature: { label: "Температура", short: "Температура", icon: "thermometer-outline", color: axColors.coral, soft: axColors.coralSoft, digits: 1, unit: "°C" },
  activeCalories: { label: "Активные калории", short: "Калории", icon: "flame-outline", color: axColors.amber, soft: axColors.amberSoft, digits: 0, unit: "ккал" },
  distance: { label: "Расстояние", short: "Расстояние", icon: "navigate-outline", color: axColors.blue, soft: axColors.blueSoft, digits: 2, unit: "км" },
  bloodPressureSystolic: { label: "Систолическое давление", short: "Давление", icon: "speedometer-outline", color: axColors.coral, soft: axColors.coralSoft, digits: 0, unit: "мм рт. ст." },
  bloodPressureDiastolic: { label: "Диастолическое давление", short: "Нижнее", icon: "speedometer-outline", color: axColors.purple, soft: axColors.purpleSoft, digits: 0, unit: "мм рт. ст." },
  weight: { label: "Вес", short: "Вес", icon: "scale-outline", color: axColors.green, soft: axColors.greenSoft, digits: 2, unit: "кг" },
  bodyFatPercentage: { label: "Процент жира", short: "Жир", icon: "flame-outline", color: axColors.coral, soft: axColors.coralSoft, digits: 1, unit: "%" },
  muscleMass: { label: "Мышечная масса", short: "Мышцы", icon: "barbell-outline", color: axColors.blue, soft: axColors.blueSoft, digits: 1, unit: "кг" },
  bodyWaterPercentage: { label: "Вода в организме", short: "Вода", icon: "water-outline", color: axColors.blue, soft: axColors.blueSoft, digits: 1, unit: "%" },
  proteinPercentage: { label: "Белок", short: "Белок", icon: "nutrition-outline", color: axColors.amber, soft: axColors.amberSoft, digits: 1, unit: "%" },
  visceralFatLevel: { label: "Висцеральный жир", short: "Висц. жир", icon: "body-outline", color: axColors.coral, soft: axColors.coralSoft, digits: 0, unit: "ур." },
  boneMass: { label: "Костная масса", short: "Кости", icon: "fitness-outline", color: axColors.purple, soft: axColors.purpleSoft, digits: 1, unit: "кг" },
  basalMetabolicRate: { label: "Базовый обмен", short: "BMR", icon: "flash-outline", color: axColors.amber, soft: axColors.amberSoft, digits: 0, unit: "ккал" },
  metabolicAge: { label: "Метаболический возраст", short: "Возраст тела", icon: "time-outline", color: axColors.green, soft: axColors.greenSoft, digits: 0, unit: "лет" },
  bodyScore: { label: "Оценка тела", short: "Оценка", icon: "sparkles-outline", color: axColors.purple, soft: axColors.purpleSoft, digits: 0, unit: "/100" }
};

const historyMetricOptions: ReadonlyArray<Metric> = ["weight", "bodyFatPercentage", "steps", "heartRate", "sleepDuration", "oxygenSaturation", "hrv"];
const periodOptions: ReadonlyArray<{ value: DynamicsPeriod; label: string }> = [
  { value: "7 дней", label: "7 дней" }, { value: "Месяц", label: "Месяц" }, { value: "3 месяца", label: "3 месяца" }, { value: "Год", label: "Год" }
];
const AnimatedPath = Animated.createAnimatedComponent(Path);

function infoFor(metric: Metric) { return metricUi[metric] ?? fallbackMetric; }
function displayReading(reading: DeviceReading) { return reading.metric === "sleepDuration" ? reading.value / 60 : reading.value; }
function numberLabel(value: number | undefined, digits: number) { return value === undefined ? "—" : value.toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? 1 : 0 }); }
function dateTime(value: string) { return new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function dayKey(value: string) { return new Date(value).toLocaleDateString("sv-SE"); }
function dayTitle(value: string) {
  const date = new Date(value); const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(value) === dayKey(now.toISOString())) return "Сегодня";
  if (dayKey(value) === dayKey(yesterday.toISOString())) return "Вчера";
  const label = date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function latestReadings(samples: readonly DeviceReading[]) {
  const result = new Map<Metric, DeviceReading>();
  for (const sample of [...samples].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))) if (!result.has(sample.metric)) result.set(sample.metric, sample);
  return result;
}
function periodStart(period: HistoryPeriod | DynamicsPeriod) {
  if (period === "all") return 0;
  const days = period === "7d" || period === "7 дней" ? 7 : period === "30d" || period === "Месяц" ? 31 : period === "90d" || period === "3 месяца" ? 92 : 366;
  const date = new Date(); date.setDate(date.getDate() - days); return date.getTime();
}
function activeFilterCount(filters: HealthHistoryFilters) {
  return Number(filters.source !== "all") + Number(filters.metric !== "all") + Number(filters.period !== "all") + Number(filters.realOnly) + Number(filters.sort !== "newest");
}

export function HealthHistoryScreen({ measurements, filters, onFiltersChange, scrollOffset, onScrollOffset, loading, refreshing, error, onRefresh, onBack, onOpen }: {
  measurements: HealthMeasurement[]; filters: HealthHistoryFilters; onFiltersChange: (value: HealthHistoryFilters) => void; scrollOffset: number; onScrollOffset: (value: number) => void;
  loading: boolean; refreshing: boolean; error?: string; onRefresh: () => void; onBack: () => void; onOpen: (id: string) => void;
}) {
  const { colors, dark } = useAxTheme();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const listRef = useRef<SectionList<HealthMeasurement>>(null);
  const filtered = useMemo(() => {
    const start = periodStart(filters.period);
    const result = measurements.filter(measurement => {
      const samples = filters.realOnly ? measurement.samples.filter(sample => sample.origin !== "mock") : measurement.samples;
      return (filters.source === "all" || measurement.source === filters.source)
        && (filters.metric === "all" || samples.some(sample => sample.metric === filters.metric))
        && Date.parse(measurement.recordedAt) >= start
        && (!filters.realOnly || samples.length > 0);
    });
    return filters.sort === "newest" ? result : [...result].reverse();
  }, [filters, measurements]);
  const sections = useMemo(() => {
    const grouped = new Map<string, HealthMeasurement[]>();
    for (const measurement of filtered) { const key = measurement.samples[0]?.localDate || dayKey(measurement.recordedAt); const values = grouped.get(key) ?? []; values.push(measurement); grouped.set(key, values); }
    return [...grouped].map(([key, data]) => ({ key, title: dayTitle(`${key}T12:00:00`), data }));
  }, [filtered]);
  useEffect(() => { if (scrollOffset > 0 && sections.length) requestAnimationFrame(() => listRef.current?.getScrollResponder()?.scrollTo({ y: scrollOffset, animated: false })); }, []); // restore only on mount
  const change = (patch: Partial<HealthHistoryFilters>) => { const next = { ...filters, ...patch }; onFiltersChange(next); onScrollOffset(0); listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false }); };
  const header = <View>
    <PageHeader title="История измерений" subtitle="Браслет и умные весы" onBack={onBack} />
    <View style={styles.historyToolbar}><View><Text maxFontSizeMultiplier={1.3} style={styles.historyTotal}>{filtered.length}</Text><Text maxFontSizeMultiplier={1.3} style={styles.muted}>измерений найдено</Text></View><AxPressable accessibilityLabel="Открыть фильтры" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)} style={[styles.filterButton, filtersOpen && { backgroundColor: dark ? colors.green : colors.ink }]}><Ionicons name="options-outline" size={19} color={filtersOpen ? colors.onAccent : colors.green} /><Text maxFontSizeMultiplier={1.3} style={[styles.filterButtonText, { color: filtersOpen ? colors.onAccent : colors.green }]}>Фильтры</Text>{activeFilterCount(filters) > 0 ? <View style={styles.filterCount}><Text maxFontSizeMultiplier={1.3} style={styles.filterCountText}>{activeFilterCount(filters)}</Text></View> : null}</AxPressable></View>
    <AxCollapsible visible={filtersOpen} style={styles.filtersPanel}>
      <FilterGroup label="Устройство"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{([['all','Все','apps-outline'],['bracelet','Браслет','watch-outline'],['scale','Весы','scale-outline']] as const).map(([value,label,icon]) => <AxFilterChip key={value} label={label} icon={icon} selected={filters.source === value} onPress={() => change({ source: value })} />)}</ScrollView></FilterGroup>
      <FilterGroup label="Показатель"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}><AxFilterChip label="Все" selected={filters.metric === "all"} onPress={() => change({ metric: "all" })} />{historyMetricOptions.map(metric => <AxFilterChip key={metric} label={infoFor(metric).short} icon={infoFor(metric).icon} selected={filters.metric === metric} onPress={() => change({ metric })} />)}</ScrollView></FilterGroup>
      <FilterGroup label="Период"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{([['all','Всё время'],['7d','7 дней'],['30d','30 дней'],['90d','3 месяца'],['year','Год']] as const).map(([value,label]) => <AxFilterChip key={value} label={label} selected={filters.period === value} onPress={() => change({ period: value })} />)}</ScrollView></FilterGroup>
      <FilterGroup label="Данные"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}><AxFilterChip label="Все данные" selected={!filters.realOnly} onPress={() => change({ realOnly: false })} /><AxFilterChip label="Только реальные" icon="shield-checkmark-outline" selected={filters.realOnly} onPress={() => change({ realOnly: true })} /></ScrollView></FilterGroup>
      <FilterGroup label="Сортировка"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}><AxFilterChip label="Сначала новые" selected={filters.sort === "newest"} onPress={() => change({ sort: "newest" })} /><AxFilterChip label="Сначала старые" selected={filters.sort === "oldest"} onPress={() => change({ sort: "oldest" })} /></ScrollView></FilterGroup>
      <AxButton label="Сбросить фильтры" icon="refresh-outline" variant="ghost" compact onPress={() => change(defaultHealthHistoryFilters)} disabled={activeFilterCount(filters) === 0} />
    </AxCollapsible>
    {activeFilterCount(filters) > 0 && !filtersOpen ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilters}>{filters.source !== "all" ? <AxBadge label={filters.source === "scale" ? "Весы" : "Браслет"} tone="blue" /> : null}{filters.metric !== "all" ? <AxBadge label={infoFor(filters.metric).short} tone="success" /> : null}{filters.realOnly ? <AxBadge label="Только реальные" tone="success" /> : null}</ScrollView> : null}
    {error ? <View style={styles.inlineError}><Ionicons name="cloud-offline-outline" size={19} color={axColors.danger} /><Text maxFontSizeMultiplier={1.3} style={styles.inlineErrorText}>{error}</Text><AxPressable accessibilityLabel="Повторить загрузку" onPress={onRefresh}><Text maxFontSizeMultiplier={1.3} style={styles.retryText}>Повторить</Text></AxPressable></View> : null}
  </View>;
  if (loading && measurements.length === 0) return <View style={styles.screen}><View style={styles.pagePadding}><PageHeader title="История измерений" subtitle="Загружаем данные" onBack={onBack} /><HistorySkeleton /></View></View>;
  return <View style={styles.screen}><SectionList
    ref={listRef}
    sections={sections}
    keyExtractor={item => item.id}
    renderItem={({ item, index }) => <AxReveal delay={Math.min(index, 7) * 28}><HistoryRow measurement={item} realOnly={filters.realOnly} onPress={() => onOpen(item.id)} /></AxReveal>}
    renderSectionHeader={({ section }) => <View style={styles.dayHeader}><Text maxFontSizeMultiplier={1.3} style={styles.dayTitle}>{section.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.dayCount}>{section.data.length}</Text></View>}
    ListHeaderComponent={header}
    ListEmptyComponent={<AxStatePanel icon="calendar-outline" title="Нет измерений" message={measurements.length ? "Измените фильтры — по текущим условиям записей нет." : "Синхронизируйте браслет или выполните измерение на весах."} />}
    contentContainerStyle={styles.historyContent}
    stickySectionHeadersEnabled
    showsVerticalScrollIndicator={false}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={axColors.green} />}
    onScrollEndDrag={event => onScrollOffset(event.nativeEvent.contentOffset.y)}
    onMomentumScrollEnd={event => onScrollOffset(event.nativeEvent.contentOffset.y)}
    initialNumToRender={12}
    maxToRenderPerBatch={12}
    windowSize={8}
  /></View>;
}

const HistoryRow = memo(function HistoryRow({ measurement, realOnly, onPress }: { measurement: HealthMeasurement; realOnly: boolean; onPress: () => void }) {
  const samples = realOnly ? measurement.samples.filter(sample => sample.origin !== "mock") : measurement.samples;
  const values = latestReadings(samples);
  const preferred = measurement.source === "scale" ? (["weight", "bodyFatPercentage", "muscleMass", "bodyWaterPercentage"] as Metric[]) : (["steps", "heartRate", "sleepDuration", "oxygenSaturation"] as Metric[]);
  return <AxPressable accessibilityLabel={`${measurement.source === "scale" ? "Умные весы" : "Браслет"}, ${dateTime(measurement.recordedAt)}`} onPress={onPress} style={styles.historyRow}>
    <View style={[styles.sourceIcon, { backgroundColor: measurement.source === "scale" ? axColors.greenSoft : axColors.blueSoft }]}><Ionicons name={measurement.source === "scale" ? "scale-outline" : "watch-outline"} size={20} color={measurement.source === "scale" ? axColors.green : axColors.blue} /></View>
    <View style={styles.flex}><View style={styles.rowTop}><Text maxFontSizeMultiplier={1.3} style={styles.rowSource}>{measurement.source === "scale" ? "Умные весы" : "Браслет"}</Text><Text maxFontSizeMultiplier={1.3} style={styles.rowTime}>{new Date(measurement.recordedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</Text></View><View style={styles.valuePreview}>{preferred.flatMap(metric => { const reading = values.get(metric); if (!reading) return []; const info = infoFor(metric); return [<View key={metric} style={styles.previewItem}><Text maxFontSizeMultiplier={1.3} style={styles.previewLabel}>{info.short}</Text><Text maxFontSizeMultiplier={1.3} style={styles.previewValue}>{numberLabel(displayReading(reading), info.digits)} {info.unit}</Text>{reading.origin === "mock" ? <Text maxFontSizeMultiplier={1.3} style={styles.tinyDemo}>Демо</Text> : null}</View>]; })}</View><View style={styles.saveRow}><Ionicons name={measurement.saved ? "cloud-done-outline" : "cloud-offline-outline"} size={13} color={measurement.saved ? axColors.green : axColors.danger} /><Text maxFontSizeMultiplier={1.3} style={[styles.saveText, !measurement.saved && { color: axColors.danger }]}>{measurement.saved ? "Сохранено" : "Не сохранено"}</Text></View></View><Ionicons name="chevron-forward" size={18} color={axColors.muted} />
  </AxPressable>;
});

export function HealthMeasurementScreen({ measurement, previous, retrying, onRetrySave, onBack, onMetric }: { measurement?: HealthMeasurement; previous?: HealthMeasurement; retrying: boolean; onRetrySave: () => void; onBack: () => void; onMetric: (metric: Metric) => void }) {
  if (!measurement) return <View style={styles.screen}><ScrollView contentContainerStyle={styles.pagePadding}><PageHeader title="Измерение" subtitle="Данные не найдены" onBack={onBack} /><AxStatePanel icon="alert-circle-outline" title="Измерение недоступно" message="Обновите историю и попробуйте снова." /></ScrollView></View>;
  const values = latestReadings(measurement.samples); const previousValues = latestReadings(previous?.samples ?? []);
  const metrics = [...values.keys()].filter(metric => metricUi[metric]).sort((left, right) => (metricUi[left]?.label ?? left).localeCompare(metricUi[right]?.label ?? right));
  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.pagePadding} showsVerticalScrollIndicator={false}><PageHeader title="Измерение" subtitle={dateTime(measurement.recordedAt)} onBack={onBack} />
    <AxCard style={styles.measurementHero}><View style={[styles.measurementIcon, { backgroundColor: measurement.source === "scale" ? axColors.greenSoft : axColors.blueSoft }]}><Ionicons name={measurement.source === "scale" ? "scale-outline" : "watch-outline"} size={26} color={measurement.source === "scale" ? axColors.green : axColors.blue} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.measurementTitle}>{measurement.source === "scale" ? "AxMed Scale" : "Фитнес-браслет"}</Text><Text maxFontSizeMultiplier={1.3} style={styles.muted}>{metrics.length} показателей · {new Date(measurement.recordedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</Text></View><AxBadge label={measurement.saved ? "Сохранено" : "Не сохранено"} tone={measurement.saved ? "success" : "danger"} icon={measurement.saved ? "cloud-done-outline" : "cloud-offline-outline"} /></AxCard>
    {!measurement.saved ? <View style={styles.unsaved}><Ionicons name="cloud-offline-outline" size={20} color={axColors.danger} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.unsavedTitle}>Данные остались на устройстве</Text><Text maxFontSizeMultiplier={1.3} style={styles.unsavedText}>Повторите сохранение без нового измерения.</Text></View><AxButton label="Сохранить" compact fullWidth={false} loading={retrying} onPress={onRetrySave} /></View> : null}
    <SectionLabel title="Показатели" subtitle="Нажмите, чтобы открыть динамику" />
    <View style={styles.measurementGrid}>{metrics.map((metric, index) => { const reading = values.get(metric)!; const before = previousValues.get(metric); const info = infoFor(metric); const value = displayReading(reading); const delta = before ? value - displayReading(before) : undefined; return <AxReveal key={metric} delay={Math.min(index, 8) * 25} style={styles.measurementReveal}><AxPressable accessibilityLabel={`${info.label}: ${numberLabel(value, info.digits)} ${info.unit}`} onPress={() => onMetric(metric)} style={styles.metricTile}><View style={styles.tileTop}><View style={[styles.metricIcon, { backgroundColor: info.soft }]}><Ionicons name={info.icon} size={18} color={info.color} /></View>{reading.origin === "mock" ? <AxBadge label="Демо" tone="warning" /> : <Ionicons name="chevron-forward" size={16} color={axColors.muted} />}</View><Text maxFontSizeMultiplier={1.3} style={styles.metricLabel}>{info.short}</Text><Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{numberLabel(value, info.digits)} <Text maxFontSizeMultiplier={1.3} style={styles.unit}>{info.unit}</Text></Text><Text maxFontSizeMultiplier={1.3} style={styles.metricDelta}>{delta === undefined ? "Нет сравнения" : `${delta > 0 ? "+" : ""}${numberLabel(delta, info.digits)} к предыдущему`}</Text></AxPressable></AxReveal>; })}</View>
    <View style={styles.disclaimer}><Ionicons name="shield-checkmark-outline" size={19} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.disclaimerText}>Сравнение нейтрально показывает изменение и не оценивает его как хорошее или плохое.</Text></View>
  </ScrollView></View>;
}

export function HealthDynamicsScreen({ metric, samples, onMetric, onHistory, onBack }: { metric: Metric; samples: DeviceReading[]; onMetric: (metric: Metric) => void; onHistory: () => void; onBack: () => void }) {
  const [period, setPeriod] = useState<DynamicsPeriod>("Месяц");
  const availableMetrics = useMemo(() => [...new Set(samples.map(sample => sample.metric))].filter(value => metricUi[value]), [samples]);
  const info = infoFor(metric);
  const readings = useMemo(() => samples.filter(sample => sample.metric === metric && Date.parse(sample.recordedAt) >= periodStart(period)).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).map(sample => ({ ...sample, value: displayReading(sample) })), [metric, period, samples]);
  const values = readings.map(reading => reading.value); const latest = readings.at(-1); const first = readings[0]; const delta = latest && first ? latest.value - first.value : undefined; const percent = delta !== undefined && first.value !== 0 ? delta / Math.abs(first.value) * 100 : undefined; const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.pagePadding} showsVerticalScrollIndicator={false}><PageHeader title="Динамика" subtitle={info.label} onBack={onBack} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricSelector}>{availableMetrics.map(value => <AxFilterChip key={value} label={infoFor(value).short} icon={infoFor(value).icon} selected={metric === value} onPress={() => onMetric(value)} />)}</ScrollView>
    <AxSegmentedControl value={period} options={periodOptions} onChange={setPeriod} />
    <Animated.View key={`${metric}:${period}`} entering={FadeIn.duration(axMotion.standard)} exiting={FadeOut.duration(axMotion.quick)} style={styles.dynamicsBlock}>
      <AxCard style={styles.dynamicsHero}><View style={[styles.dynamicsIcon, { backgroundColor: info.soft }]}><Ionicons name={info.icon} size={22} color={info.color} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.muted}>Текущий результат</Text><Text maxFontSizeMultiplier={1.3} style={styles.dynamicsValue}>{numberLabel(latest?.value, info.digits)} <Text maxFontSizeMultiplier={1.3} style={styles.unit}>{latest ? info.unit : ""}</Text></Text><Text maxFontSizeMultiplier={1.3} style={styles.dynamicsDate}>{latest ? dateTime(latest.recordedAt) : "Нет данных за период"}</Text></View><View style={[styles.deltaPanel, { backgroundColor: info.soft }]}><Text maxFontSizeMultiplier={1.3} style={[styles.deltaNumber, { color: info.color }]}>{delta === undefined ? "—" : `${delta > 0 ? "+" : ""}${numberLabel(delta, info.digits)}`}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.deltaPercent, { color: info.color }]}>{percent === undefined ? "" : `${percent > 0 ? "+" : ""}${numberLabel(percent, 1)}%`}</Text></View></AxCard>
      <AxCard style={styles.chartCard}><View style={styles.chartTop}><View><Text maxFontSizeMultiplier={1.3} style={styles.cardTitle}>График</Text><Text maxFontSizeMultiplier={1.3} style={styles.muted}>{period} · {readings.length} измерений</Text></View><Ionicons name="analytics-outline" size={21} color={info.color} /></View><TrendChart readings={readings} info={info} /><View style={styles.statsRow}><Stat label="Минимум" value={values.length ? Math.min(...values) : undefined} info={info} /><Stat label="Среднее" value={average} info={info} /><Stat label="Максимум" value={values.length ? Math.max(...values) : undefined} info={info} /><Stat label="Записей" value={readings.length || undefined} info={{ ...info, unit: "", digits: 0 }} /></View></AxCard>
    </Animated.View>
    <SectionLabel title="Точки графика" subtitle="Последние события выбранного периода" />
    {readings.length ? <View style={styles.eventList}>{[...readings].reverse().slice(0, 24).map((reading, index) => <View key={`${reading.sourceRecordId}:${reading.recordedAt}:${index}`} style={styles.eventRow}><View style={[styles.eventDot, { backgroundColor: info.color }]} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.eventDate}>{dateTime(reading.recordedAt)}</Text><Text maxFontSizeMultiplier={1.3} style={styles.muted}>{reading.origin === "mock" ? "Демо-расчёт" : "Реальные данные"}</Text></View><Text maxFontSizeMultiplier={1.3} style={styles.eventValue}>{numberLabel(reading.value, info.digits)} {info.unit}</Text>{reading.origin === "mock" ? <AxBadge label="Демо" tone="warning" /> : null}</View>)}</View> : <AxStatePanel icon="analytics-outline" title="Нет данных" message="Выберите другой показатель или период." />}
    <AxButton label="Открыть в истории" icon="calendar-outline" variant="outline" onPress={onHistory} style={styles.bottomAction} />
  </ScrollView></View>;
}

const TrendChart = memo(function TrendChart({ readings, info }: { readings: DeviceReading[]; info: MetricUi }) {
  if (!readings.length) return <View style={styles.chartEmpty}><Ionicons name="analytics-outline" size={28} color={axColors.muted} /><Text maxFontSizeMultiplier={1.3} style={styles.muted}>Недостаточно данных для графика</Text></View>;
  const display = readings.length <= 48 ? readings : readings.filter((_, index) => index % Math.ceil(readings.length / 48) === 0 || index === readings.length - 1);
  return <InteractiveTrend readings={display} info={info} />;
});

function InteractiveTrend({ readings, info }: { readings: DeviceReading[]; info: MetricUi }) {
  const [width, setWidth] = useState(320); const [selected, setSelected] = useState(readings.length - 1); const draw = useSharedValue(0); const reduceMotion = useAxReducedMotion();
  const values = readings.map(reading => reading.value); const min = Math.min(...values); const range = Math.max(0.001, Math.max(...values) - min);
  const points = readings.map((reading, index) => ({ x: readings.length === 1 ? 160 : 18 + index * (284 / (readings.length - 1)), y: 126 - ((reading.value - min) / range) * 86 }));
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  useEffect(() => { setSelected(readings.length - 1); draw.value = 0; draw.value = withTiming(1, { duration: reduceMotion ? 0 : 360, easing: Easing.out(Easing.cubic) }); }, [draw, readings.length, readings[0]?.recordedAt, readings.at(-1)?.recordedAt, reduceMotion]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: 1000 * (1 - draw.value), opacity: draw.value }));
  const select = (event: GestureResponderEvent) => setSelected(Math.max(0, Math.min(readings.length - 1, Math.round((event.nativeEvent.locationX / width) * (readings.length - 1)))));
  const point = points[selected]; const reading = readings[selected];
  return <TabSwipeGuard style={styles.chart} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} onTouchStart={select} onTouchMove={select} accessibilityRole="image" accessibilityLabel={`График ${info.label}, ${readings.length} точек`}>
    {point && reading ? <View pointerEvents="none" style={[styles.tooltip, { left: Math.max(4, Math.min(width - 112, point.x / 320 * width - 53)) }]}><Text maxFontSizeMultiplier={1.3} style={styles.tooltipValue}>{numberLabel(reading.value, info.digits)} {info.unit}</Text><Text maxFontSizeMultiplier={1.3} style={styles.tooltipDate}>{dateTime(reading.recordedAt)}</Text></View> : null}
    <Svg width="100%" height="160" viewBox="0 0 320 160"><Path d="M18 40 H302 M18 83 H302 M18 126 H302" stroke={axColors.line} strokeWidth="1" /><AnimatedPath animatedProps={animatedProps} d={path} stroke={info.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1000 1000" fill="none" />{points.map((value, index) => <Circle key={`${value.x}:${index}`} cx={value.x} cy={value.y} r={selected === index ? 5 : 2.5} fill={axColors.surface} stroke={info.color} strokeWidth={selected === index ? 3 : 2} />)}</Svg>
  </TabSwipeGuard>;
}

export function HealthReportsScreen({ samples, measurements, refreshing, error, onRefresh, onBack }: { samples: DeviceReading[]; measurements: HealthMeasurement[]; refreshing: boolean; error?: string; onRefresh: () => void; onBack: () => void }) {
  const [period, setPeriod] = useState<HealthReportPeriod>("week"); const [sheet, setSheet] = useState(false); const [exporting, setExporting] = useState<HealthExportKind>(); const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" }>();
  const report = useMemo(() => buildReport(samples, measurements, period), [measurements, period, samples]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(undefined), 3200); return () => clearTimeout(timer); }, [notice]);
  const runExport = async (kind: HealthExportKind) => { setExporting(kind); try { const result = await shareHealthExport(kind, report.samples, period); setSheet(false); setNotice({ message: `${result.fileName} готов`, tone: "success" }); } catch { setNotice({ message: "Не удалось сформировать файл. Попробуйте ещё раз.", tone: "error" }); } finally { setExporting(undefined); } };
  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.reportContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={axColors.green} />}><PageHeader title="Отчёты" subtitle="Сводка и экспорт" onBack={onBack} />
    <AxSegmentedControl value={period} options={[{ value: "week", label: "Неделя" }, { value: "month", label: "Месяц" }]} onChange={setPeriod} />
    {error ? <View style={styles.inlineError}><Ionicons name="cloud-offline-outline" size={19} color={axColors.danger} /><Text maxFontSizeMultiplier={1.3} style={styles.inlineErrorText}>{error}</Text><AxPressable accessibilityLabel="Повторить" onPress={onRefresh}><Text maxFontSizeMultiplier={1.3} style={styles.retryText}>Повторить</Text></AxPressable></View> : null}
    {report.samples.length === 0 ? <AxStatePanel icon="document-text-outline" title="Недостаточно данных" message="За выбранный период измерений пока нет." /> : <>
      <AxReveal><View style={styles.reportHero}><View><Text maxFontSizeMultiplier={1.3} style={styles.reportEyebrow}>СОСТОЯНИЕ ЗА {period === "week" ? "НЕДЕЛЮ" : "МЕСЯЦ"}</Text><Text maxFontSizeMultiplier={1.3} style={styles.reportScore}>{report.score || "—"}<Text maxFontSizeMultiplier={1.3} style={styles.reportScoreUnit}> / 100</Text></Text><Text maxFontSizeMultiplier={1.3} style={styles.reportStatus}>{report.status}</Text></View><View style={styles.reportRing}><Text maxFontSizeMultiplier={1.3} style={styles.reportRingValue}>{report.stability}%</Text><Text maxFontSizeMultiplier={1.3} style={styles.reportRingLabel}>регулярность</Text></View></View></AxReveal>
      <View style={styles.reportFacts}><ReportFact icon="calendar-outline" label="Дней с данными" value={`${report.activeDays}/${report.days}`} color={axColors.green} soft={axColors.greenSoft} /><ReportFact icon="pulse-outline" label="Показателей" value={String(report.metricCount)} color={axColors.coral} soft={axColors.coralSoft} /><ReportFact icon="analytics-outline" label="Измерений" value={String(report.measurementCount)} color={axColors.blue} soft={axColors.blueSoft} /></View>
      <SectionLabel title="Краткая сводка" subtitle="Главное без лишнего текста" />
      <View style={styles.summaryGrid}><SummaryCard icon="footsteps-outline" label="Активность" value={report.steps === undefined ? "—" : `${Math.round(report.steps).toLocaleString("ru-RU")}`} caption="среднее шагов" color={axColors.green} soft={axColors.greenSoft} /><SummaryCard icon="moon-outline" label="Сон" value={report.sleep === undefined ? "—" : `${numberLabel(report.sleep, 1)} ч`} caption="средняя длительность" color={axColors.purple} soft={axColors.purpleSoft} /><SummaryCard icon="heart-outline" label="Пульс" value={report.heart === undefined ? "—" : `${Math.round(report.heart)}`} caption="средний, уд/мин" color={axColors.coral} soft={axColors.coralSoft} /><SummaryCard icon="scale-outline" label="Вес" value={report.weight === undefined ? "—" : `${numberLabel(report.weight, 1)} кг`} caption="последнее значение" color={axColors.blue} soft={axColors.blueSoft} /></View>
      <SectionLabel title={period === "month" ? "Тренды месяца" : "Ключевые изменения"} subtitle={period === "month" ? "Сравнение с предыдущими 30 днями" : "Первое и последнее значение периода"} />
      <View style={styles.changeList}>{report.changes.length ? report.changes.map(change => <ChangeRow key={change.metric} change={change} />) : <View style={styles.noChanges}><Ionicons name="remove-circle-outline" size={20} color={axColors.muted} /><Text maxFontSizeMultiplier={1.3} style={styles.muted}>Для сравнения нужно больше измерений.</Text></View>}</View>
      <View style={styles.reportNote}><Ionicons name="shield-checkmark-outline" size={19} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.reportNoteText}>Отчёт показывает динамику и не является медицинским заключением.</Text></View>
    </>}
  </ScrollView>
  {report.samples.length ? <AxPressable accessibilityLabel="Экспортировать отчёт" onPress={() => setSheet(true)} style={styles.exportFab}><Ionicons name="share-outline" size={21} color={axColors.onAccent} /><Text maxFontSizeMultiplier={1.3} style={styles.exportFabText}>Экспорт</Text></AxPressable> : null}
  <AxBottomSheet visible={sheet} title="Экспорт отчёта" subtitle="Файл создаётся локально на устройстве" onClose={() => !exporting && setSheet(false)}><View style={styles.exportOptions}><AxButton label="PDF-отчёт" icon="document-text-outline" loading={exporting === "pdf"} disabled={Boolean(exporting && exporting !== "pdf")} onPress={() => void runExport("pdf")} /><AxButton label="Данные CSV" icon="grid-outline" variant="secondary" loading={exporting === "csv"} disabled={Boolean(exporting && exporting !== "csv")} onPress={() => void runExport("csv")} /></View></AxBottomSheet>
  <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} onDismiss={() => setNotice(undefined)} />
  </View>;
}

type ReportChange = { metric: Metric; delta: number; percent?: number; current: number };
function buildReport(samples: DeviceReading[], measurements: HealthMeasurement[], period: HealthReportPeriod) {
  const days = period === "week" ? 7 : 30; const now = Date.now(); const start = now - days * 86_400_000; const previousStart = start - days * 86_400_000;
  const selected = samples.filter(sample => Date.parse(sample.recordedAt) >= start); const previous = samples.filter(sample => { const time = Date.parse(sample.recordedAt); return time >= previousStart && time < start; });
  const selectedMeasurements = measurements.filter(measurement => Date.parse(measurement.recordedAt) >= start); const activeDays = new Set(selected.map(sample => sample.localDate)).size; const stability = Math.min(100, Math.round(activeDays / days * 100));
  const average = (metric: Metric, source = selected) => { const values = source.filter(sample => sample.metric === metric).map(sample => displayReading(sample)); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined; };
  const latest = (metric: Metric) => selected.filter(sample => sample.metric === metric).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  const scoreSignals = [average("steps") !== undefined ? Math.min(100, average("steps")! / 8000 * 100) : undefined, average("sleepDuration") !== undefined ? Math.min(100, average("sleepDuration")! / 8 * 100) : undefined, latest("bodyScore")?.value].filter((value): value is number => value !== undefined);
  const score = scoreSignals.length ? Math.round(scoreSignals.reduce((sum, value) => sum + value, 0) / scoreSignals.length) : 0;
  const changes = (["steps", "sleepDuration", "heartRate", "weight", "bodyFatPercentage", "muscleMass"] as Metric[]).flatMap(metric => { const current = period === "month" ? average(metric) : (() => { const values = selected.filter(sample => sample.metric === metric).sort((a,b) => a.recordedAt.localeCompare(b.recordedAt)); return values.at(-1) ? displayReading(values.at(-1)!) : undefined; })(); const before = period === "month" ? average(metric, previous) : (() => { const values = selected.filter(sample => sample.metric === metric).sort((a,b) => a.recordedAt.localeCompare(b.recordedAt)); return values[0] ? displayReading(values[0]) : undefined; })(); if (current === undefined || before === undefined || current === before) return []; return [{ metric, current, delta: current - before, percent: before === 0 ? undefined : (current - before) / Math.abs(before) * 100 }]; });
  return { samples: selected, days, activeDays, stability, score, status: score >= 80 ? "Стабильное состояние" : score >= 60 ? "Умеренная динамика" : score ? "Нужно больше стабильности" : "Недостаточно данных", metricCount: new Set(selected.map(sample => sample.metric)).size, measurementCount: selectedMeasurements.length, steps: average("steps"), sleep: average("sleepDuration"), heart: average("heartRate"), weight: latest("weight")?.value, changes };
}

function ChangeRow({ change }: { change: ReportChange }) { const info = infoFor(change.metric); return <View style={styles.changeRow}><View style={[styles.metricIcon, { backgroundColor: info.soft }]}><Ionicons name={info.icon} size={17} color={info.color} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.changeTitle}>{info.short}</Text><Text maxFontSizeMultiplier={1.3} style={styles.muted}>Текущее: {numberLabel(change.current, info.digits)} {info.unit}</Text></View><View style={[styles.changeBadge, { backgroundColor: info.soft }]}><Ionicons name={change.delta > 0 ? "arrow-up" : "arrow-down"} size={12} color={info.color} /><Text maxFontSizeMultiplier={1.3} style={[styles.changeBadgeText, { color: info.color }]}>{numberLabel(Math.abs(change.delta), info.digits)}{change.percent === undefined ? "" : ` · ${numberLabel(Math.abs(change.percent), 1)}%`}</Text></View></View>; }
function ReportFact({ icon, label, value, color, soft }: { icon: IconName; label: string; value: string; color: string; soft: string }) { return <View style={styles.reportFact}><View style={[styles.reportFactIcon, { backgroundColor: soft }]}><Ionicons name={icon} size={17} color={color} /></View><Text maxFontSizeMultiplier={1.3} style={styles.reportFactValue}>{value}</Text><Text maxFontSizeMultiplier={1.3} style={styles.reportFactLabel}>{label}</Text></View>; }
function SummaryCard({ icon, label, value, caption, color, soft }: { icon: IconName; label: string; value: string; caption: string; color: string; soft: string }) { return <AxCard style={styles.summaryCard}><View style={[styles.summaryIcon, { backgroundColor: soft }]}><Ionicons name={icon} size={18} color={color} /></View><Text maxFontSizeMultiplier={1.3} style={styles.summaryLabel}>{label}</Text><Text maxFontSizeMultiplier={1.3} style={styles.summaryValue}>{value}</Text><Text maxFontSizeMultiplier={1.3} style={styles.muted}>{caption}</Text></AxCard>; }
function Stat({ label, value, info }: { label: string; value?: number; info: MetricUi }) { return <View style={styles.stat}><Text maxFontSizeMultiplier={1.3} style={styles.statLabel}>{label}</Text><Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{numberLabel(value, info.digits)} <Text maxFontSizeMultiplier={1.3} style={styles.statUnit}>{value === undefined ? "" : info.unit}</Text></Text></View>; }
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.filterGroup}><Text maxFontSizeMultiplier={1.3} style={styles.filterLabel}>{label}</Text>{children}</View>; }
function SectionLabel({ title, subtitle }: { title: string; subtitle: string }) { return <View style={styles.sectionLabel}><Text maxFontSizeMultiplier={1.3} style={styles.sectionTitle}>{title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.muted}>{subtitle}</Text></View>; }
function PageHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) { return <View style={styles.header}><AxPressable accessibilityLabel="Назад" onPress={onBack} style={styles.back}><Ionicons name="chevron-back" size={23} color={axColors.ink} /></AxPressable><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.title}>{title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>{subtitle}</Text></View></View>; }
function HistorySkeleton() { return <View style={styles.skeleton}><AxSkeleton height={92} radius={20} /><AxSkeleton height={82} radius={20} /><AxSkeleton height={82} radius={20} /><AxSkeleton height={82} radius={20} /></View>; }

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:axColors.background},flex:{flex:1,minWidth:0},pagePadding:{paddingHorizontal:18,paddingTop:8,paddingBottom:120},historyContent:{paddingHorizontal:18,paddingTop:8,paddingBottom:120},reportContent:{paddingHorizontal:18,paddingTop:8,paddingBottom:170},header:{flexDirection:"row",alignItems:"flex-start",gap:11,marginBottom:20},back:{width:42,height:42,borderRadius:15,backgroundColor:axColors.surface,borderWidth:1,borderColor:axColors.line,alignItems:"center",justifyContent:"center"},title:{color:axColors.ink,fontSize:25,lineHeight:30,fontWeight:"500",letterSpacing:-.45},subtitle:{color:axColors.muted,fontSize:11,lineHeight:16,marginTop:2},muted:{color:axColors.muted,fontSize:9,lineHeight:13},cardTitle:{color:axColors.ink,fontSize:16,fontWeight:"800"},unit:{color:axColors.muted,fontSize:9,fontWeight:"600"},
  historyToolbar:{minHeight:76,borderRadius:22,padding:14,backgroundColor:axColors.surface,borderWidth:1,borderColor:axColors.line,flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:10},historyTotal:{color:axColors.ink,fontSize:27,fontWeight:"500"},filterButton:{minHeight:43,borderRadius:14,paddingHorizontal:12,backgroundColor:axColors.greenSoft,flexDirection:"row",alignItems:"center",gap:6},filterButtonActive:{backgroundColor:axColors.ink},filterButtonText:{color:axColors.green,fontSize:10,fontWeight:"800"},filterButtonTextActive:{color:axColors.onAccent},filterCount:{minWidth:20,height:20,borderRadius:10,backgroundColor:axColors.green,alignItems:"center",justifyContent:"center"},filterCountText:{color:axColors.onAccent,fontSize:8,fontWeight:"900"},filtersPanel:{borderRadius:22,padding:14,backgroundColor:axColors.surface,borderWidth:1,borderColor:axColors.line,marginBottom:10},filterGroup:{marginBottom:12},filterLabel:{color:axColors.ink,fontSize:10,fontWeight:"800",marginBottom:7},chipRow:{gap:7,paddingRight:8},activeFilters:{gap:6,paddingVertical:3,marginBottom:8},inlineError:{minHeight:58,borderRadius:16,padding:11,backgroundColor:axColors.dangerSoft,flexDirection:"row",alignItems:"center",gap:8,marginVertical:10},inlineErrorText:{flex:1,color:axColors.text,fontSize:9,lineHeight:14},retryText:{color:axColors.danger,fontSize:9,fontWeight:"800"},dayHeader:{minHeight:42,backgroundColor:axColors.background,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingTop:8},dayTitle:{color:axColors.ink,fontSize:13,fontWeight:"800"},dayCount:{minWidth:25,height:25,lineHeight:25,borderRadius:9,overflow:"hidden",backgroundColor:axColors.surfaceMuted,color:axColors.muted,textAlign:"center",fontSize:8,fontWeight:"800"},historyRow:{minHeight:104,borderRadius:20,padding:12,marginBottom:8,backgroundColor:axColors.surface,borderWidth:1,borderColor:axColors.line,flexDirection:"row",alignItems:"center",gap:10},sourceIcon:{width:43,height:43,borderRadius:14,alignItems:"center",justifyContent:"center"},rowTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},rowSource:{color:axColors.ink,fontSize:12,fontWeight:"800"},rowTime:{color:axColors.muted,fontSize:8},valuePreview:{flexDirection:"row",flexWrap:"wrap",gap:5,marginTop:7},previewItem:{minHeight:29,borderRadius:9,paddingHorizontal:7,backgroundColor:axColors.surfaceMuted,flexDirection:"row",alignItems:"center",gap:3},previewLabel:{color:axColors.muted,fontSize:7},previewValue:{color:axColors.text,fontSize:8,fontWeight:"800"},tinyDemo:{color:"#555555",fontSize:6,fontWeight:"900"},saveRow:{flexDirection:"row",alignItems:"center",gap:4,marginTop:7},saveText:{color:axColors.green,fontSize:7,fontWeight:"700"},skeleton:{gap:9},
  measurementHero:{minHeight:84,flexDirection:"row",alignItems:"center",gap:11,marginBottom:10},measurementIcon:{width:48,height:48,borderRadius:16,alignItems:"center",justifyContent:"center"},measurementTitle:{color:axColors.ink,fontSize:14,fontWeight:"800"},unsaved:{borderRadius:18,padding:12,backgroundColor:axColors.dangerSoft,flexDirection:"row",alignItems:"center",gap:9,marginBottom:16},unsavedTitle:{color:axColors.danger,fontSize:10,fontWeight:"800"},unsavedText:{color:axColors.text,fontSize:8,marginTop:2},sectionLabel:{marginTop:6,marginBottom:11},sectionTitle:{color:axColors.ink,fontSize:19,lineHeight:24,fontWeight:"800"},measurementGrid:{flexDirection:"row",flexWrap:"wrap",gap:9,marginBottom:14},measurementReveal:{width:"48.5%"},metricTile:{width:"100%",minHeight:137,borderRadius:20,padding:12,backgroundColor:axColors.surface,borderWidth:1,borderColor:axColors.line},tileTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},metricIcon:{width:36,height:36,borderRadius:12,alignItems:"center",justifyContent:"center"},metricLabel:{color:axColors.muted,fontSize:10,marginTop:10},metricValue:{color:axColors.ink,fontSize:20,fontWeight:"800",marginTop:2},metricDelta:{color:axColors.muted,fontSize:8,lineHeight:12,marginTop:6},disclaimer:{borderRadius:17,padding:13,backgroundColor:axColors.greenSoft,flexDirection:"row",alignItems:"flex-start",gap:9},disclaimerText:{flex:1,color:axColors.text,fontSize:9,lineHeight:14},
  metricSelector:{gap:7,paddingRight:8,paddingBottom:12},dynamicsBlock:{marginTop:12},dynamicsHero:{minHeight:105,flexDirection:"row",alignItems:"center",gap:11,marginBottom:10},dynamicsIcon:{width:46,height:46,borderRadius:15,alignItems:"center",justifyContent:"center"},dynamicsValue:{color:axColors.ink,fontSize:27,fontWeight:"500",marginTop:2},dynamicsDate:{color:axColors.muted,fontSize:8,marginTop:3},deltaPanel:{minWidth:72,borderRadius:15,padding:10,alignItems:"center"},deltaNumber:{fontSize:12,fontWeight:"900"},deltaPercent:{fontSize:8,fontWeight:"800",marginTop:3},chartCard:{marginBottom:14},chartTop:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between"},chart:{height:160,marginTop:4},chartEmpty:{height:160,alignItems:"center",justifyContent:"center",gap:8},tooltip:{position:"absolute",top:3,width:108,zIndex:3,borderRadius:11,paddingHorizontal:7,paddingVertical:6,backgroundColor:"#111111",alignItems:"center"},tooltipValue:{color:axColors.white,fontSize:10,fontWeight:"900"},tooltipDate:{color:"#C0C0C0",fontSize:7,marginTop:2},statsRow:{flexDirection:"row",gap:5,marginTop:2},stat:{flex:1,minWidth:0,borderRadius:12,padding:8,backgroundColor:axColors.surfaceMuted},statLabel:{color:axColors.muted,fontSize:7},statValue:{color:axColors.ink,fontSize:10,fontWeight:"800",marginTop:4},statUnit:{color:axColors.muted,fontSize:6},eventList:{borderRadius:20,paddingHorizontal:13,backgroundColor:axColors.surface,borderWidth:1,borderColor:axColors.line},eventRow:{minHeight:59,borderTopWidth:1,borderTopColor:axColors.line,flexDirection:"row",alignItems:"center",gap:8},eventDot:{width:7,height:7,borderRadius:4},eventDate:{color:axColors.text,fontSize:9,fontWeight:"700"},eventValue:{color:axColors.ink,fontSize:11,fontWeight:"800"},bottomAction:{marginTop:14},
  reportHero:{minHeight:168,borderRadius:24,padding:18,backgroundColor:"#111111",flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:12,marginBottom:10},reportEyebrow:{color:"#A8A8A8",fontSize:8,fontWeight:"900",letterSpacing:1},reportScore:{color:axColors.white,fontSize:40,fontWeight:"500",marginTop:10},reportScoreUnit:{color:"#A8A8A8",fontSize:13},reportStatus:{color:"#D8D8D8",fontSize:11,fontWeight:"800",marginTop:3},reportRing:{width:92,height:92,borderRadius:46,borderWidth:9,borderColor:"#FFFFFF",alignItems:"center",justifyContent:"center"},reportRingValue:{color:axColors.white,fontSize:19,fontWeight:"900"},reportRingLabel:{color:"#A8A8A8",fontSize:7,marginTop:2},reportFacts:{flexDirection:"row",gap:7,marginBottom:15},reportFact:{flex:1,minWidth:0,borderRadius:17,padding:10,backgroundColor:axColors.surface,borderWidth:1,borderColor:axColors.line},reportFactIcon:{width:31,height:31,borderRadius:10,alignItems:"center",justifyContent:"center"},reportFactValue:{color:axColors.ink,fontSize:15,fontWeight:"800",marginTop:7},reportFactLabel:{color:axColors.muted,fontSize:7,lineHeight:10,marginTop:2},summaryGrid:{flexDirection:"row",flexWrap:"wrap",gap:9},summaryCard:{width:"48.5%",minHeight:126},summaryIcon:{width:37,height:37,borderRadius:12,alignItems:"center",justifyContent:"center"},summaryLabel:{color:axColors.muted,fontSize:9,marginTop:9},summaryValue:{color:axColors.ink,fontSize:19,fontWeight:"800",marginTop:2},changeList:{borderRadius:20,paddingHorizontal:13,backgroundColor:axColors.surface,borderWidth:1,borderColor:axColors.line},changeRow:{minHeight:65,borderTopWidth:1,borderTopColor:axColors.line,flexDirection:"row",alignItems:"center",gap:9},changeTitle:{color:axColors.ink,fontSize:10,fontWeight:"800"},changeBadge:{minHeight:30,maxWidth:"42%",borderRadius:10,paddingHorizontal:7,flexDirection:"row",alignItems:"center",gap:4},changeBadgeText:{fontSize:8,fontWeight:"800"},noChanges:{minHeight:82,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},reportNote:{borderRadius:17,padding:13,backgroundColor:axColors.greenSoft,flexDirection:"row",alignItems:"flex-start",gap:9,marginTop:14},reportNoteText:{flex:1,color:axColors.text,fontSize:9,lineHeight:14},exportFab:{position:"absolute",right:18,bottom:104,minHeight:54,borderRadius:20,paddingHorizontal:17,backgroundColor:axColors.green,flexDirection:"row",alignItems:"center",gap:8},exportFabText:{color:axColors.onAccent,fontSize:12,fontWeight:"800"},exportOptions:{gap:9},
});
