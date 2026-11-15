import { useAxStyles, type AxThemeColors } from "../../ui/theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

type HomeMetric = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
  unit: string;
  delta: string;
  points: readonly number[];
};

export function HomeScreen({ score, status, metrics, onOpenMetrics }: {
  score: number; status: string; metrics: readonly HomeMetric[];
  onOpenMetrics: () => void;
}) {
  const { styles, colors: homeColors } = useAxStyles(createStyles);
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 375;
  const singleColumn = fontScale > 1.3;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ваше состояние: ${score} из 100. ${status}`}
          accessibilityHint="Открыть показатели и отчёты" onPress={onOpenMetrics}
          style={({ pressed }) => [styles.summary, pressed && styles.summaryPressed]}>
          <View style={styles.summaryHeader}>
            <Text allowFontScaling style={styles.summaryTitle}>Ваше состояние</Text>
            <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.summaryArrow}>
              <Ionicons name="arrow-forward" size={18} color={homeColors.white} style={styles.diagonalArrow} />
            </View>
          </View>
          <View style={[styles.summaryBody, singleColumn && styles.summaryBodyStacked]}>
            <View style={styles.scoreCopy}>
              <View style={styles.scoreRow}>
                <Text allowFontScaling style={[styles.score, narrow && styles.scoreNarrow]}>{score}</Text>
                <Text allowFontScaling style={styles.scoreTotal}>/ 100</Text>
              </View>
              <View style={styles.status}>
                <View style={styles.statusDot} />
                <Text allowFontScaling style={styles.statusText}>{status}</Text>
              </View>
            </View>
            <HealthRing value={score} />
          </View>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text allowFontScaling accessibilityRole="header" style={styles.sectionTitle}>Показатели</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Все показатели" onPress={onOpenMetrics}
            style={({ pressed }) => [styles.allButton, pressed && styles.pressed]}>
            <Text allowFontScaling style={styles.allText}>Все</Text>
            <Ionicons name="arrow-forward" size={17} color={homeColors.ink} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {metrics.map(metric => <MetricCard key={metric.label} metric={metric} narrow={narrow}
            singleColumn={singleColumn} onPress={onOpenMetrics} />)}
        </View>
      </View>
    </ScrollView>
  );
}

function HealthRing({ value }: { value: number }) {
  const { styles } = useAxStyles(createStyles);
  const circumference = 2 * Math.PI * 45;
  const progress = Math.max(0, Math.min(100, value)) / 100;
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.ring}>
      <Svg width={108} height={108} viewBox="0 0 108 108">
        <Circle cx={54} cy={54} r={45} fill="none" stroke="#3A3A3A" strokeWidth={5} />
        <Circle cx={54} cy={54} r={45} fill="none" stroke="#F7F7F7" strokeWidth={5}
          strokeDasharray={`${circumference * progress} ${circumference}`} strokeLinecap="round"
          rotation={-90} origin="54, 54" />
        <Path d="M33 55 H43 L48 43 L56 65 L62 51 L67 55 H75" fill="none"
          stroke="#F7F7F7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const formatValue = (value: string) => value.replace(".", ",").replace("-", "−");

function MetricCard({ metric, narrow, singleColumn, onPress }: {
  metric: HomeMetric; narrow: boolean; singleColumn: boolean; onPress: () => void;
}) {
  const { styles, colors: homeColors } = useAxStyles(createStyles);
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={`${metric.label}: ${formatValue(metric.value)} ${metric.unit}. Изменение: ${formatValue(metric.delta)}`}
      accessibilityHint="Открыть показатели и отчёты" onPress={onPress}
      style={({ pressed }) => [styles.metric, narrow && styles.metricNarrow, singleColumn && styles.metricFull, pressed && styles.pressed]}>
      <View style={styles.metricHeader}>
        <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.metricIcon}>
          <MaterialCommunityIcons name={metric.icon} size={19} color={homeColors.ink} />
        </View>
        <Text allowFontScaling style={styles.delta}>{formatValue(metric.delta)}</Text>
      </View>
      <Text allowFontScaling style={styles.metricName}>{metric.label}</Text>
      <View style={styles.valueRow}>
        <Text allowFontScaling style={[styles.value, narrow && styles.valueNarrow]}>{formatValue(metric.value)}</Text>
        <Text allowFontScaling style={styles.unit}>{metric.unit}</Text>
      </View>
      <MetricTrend points={metric.points} />
    </Pressable>
  );
}

function MetricTrend({ points }: { points: readonly number[] }) {
  const { styles, colors: homeColors } = useAxStyles(createStyles);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const range = Math.max(...points) - min || 1;
  const plot = points.map((value, index) => ({ x: 3 + index * 122 / (points.length - 1), y: 24 - (value - min) / range * 19 }));
  const path = plot.map(({ x, y }, index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
  const last = plot[plot.length - 1];
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.trend}>
      <Svg width="100%" height={28} viewBox="0 0 128 28" preserveAspectRatio="none">
        <Path d="M3 25 H125" stroke={homeColors.line} strokeWidth={1} />
        <Path d={path} fill="none" stroke={homeColors.muted} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={last.x} cy={last.y} r={2.3} fill={homeColors.ink} />
      </Svg>
    </View>
  );
}

const createStyles = (homeColors: AxThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: homeColors.background },
  scroll: { flexGrow: 1, alignItems: "center" },
  content: { width: "100%", maxWidth: 480, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 116 },
  summary: { backgroundColor: "#111111", borderWidth: 1, borderColor: homeColors.line, borderRadius: 28, padding: 22 },
  summaryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  summaryTitle: { color: "#E6E6E6", fontSize: 14, lineHeight: 20, fontWeight: "500", flexShrink: 1 },
  summaryArrow: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#3C3C3C", alignItems: "center", justifyContent: "center" },
  diagonalArrow: { transform: [{ rotate: "-45deg" }] },
  summaryBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 },
  summaryBodyStacked: { flexDirection: "column", alignItems: "flex-start", gap: 24 },
  scoreCopy: { flexShrink: 1 },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  score: { color: homeColors.white, fontSize: 72, lineHeight: 80, letterSpacing: -3.5, fontWeight: "500", fontVariant: ["tabular-nums"] },
  scoreNarrow: { fontSize: 62, lineHeight: 72 },
  scoreTotal: { color: "#B0B0B0", fontSize: 12, lineHeight: 18 },
  status: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#D7D7D7" },
  statusText: { color: "#E6E6E6", fontSize: 13, lineHeight: 20 },
  ring: { width: 108, height: 108, flexShrink: 0 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 24, marginBottom: 12 },
  sectionTitle: { color: homeColors.ink, fontSize: 22, lineHeight: 28, letterSpacing: -0.5, fontWeight: "500", flexShrink: 1 },
  allButton: { minWidth: 60, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  allText: { color: homeColors.ink, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  metric: { width: "48.2%", backgroundColor: homeColors.surface, borderWidth: 1, borderColor: homeColors.line, borderRadius: 23, padding: 16 },
  metricNarrow: { padding: 13 }, metricFull: { width: "100%" },
  metricHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" },
  metricIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: homeColors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  delta: { color: homeColors.muted, fontSize: 11, lineHeight: 16, fontWeight: "500" },
  metricName: { color: homeColors.muted, fontSize: 12, lineHeight: 17, minHeight: 34, marginTop: 13 },
  valueRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 5 },
  value: { color: homeColors.ink, fontSize: 34, lineHeight: 41, letterSpacing: -1.5, fontWeight: "500", fontVariant: ["tabular-nums"] },
  valueNarrow: { fontSize: 30, lineHeight: 37, letterSpacing: -1.2 },
  unit: { color: homeColors.muted, fontSize: 12, lineHeight: 18 },
  trend: { marginTop: 12 },
  pressed: { opacity: 0.65 }, summaryPressed: { backgroundColor: "#292929" }
});
