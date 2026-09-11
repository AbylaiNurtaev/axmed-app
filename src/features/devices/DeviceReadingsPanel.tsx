import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { readingSummary, syncWarningMessage } from "../../devices/readingSummary";
import type { DeviceReading, DeviceSyncBatch, Metric } from "../../devices/types";
import { authColors } from "../auth/ui";

const vitals: { metric: Metric; label: string; unit: string; digits: number }[] = [
  { metric: "heartRate", label: "Пульс", unit: "уд/мин", digits: 0 },
  { metric: "oxygenSaturation", label: "Кислород · SpO₂", unit: "%", digits: 0 },
  { metric: "bodyTemperature", label: "Температура тела", unit: "°C", digits: 1 },
  { metric: "hrv", label: "HRV", unit: "мс", digits: 0 },
  { metric: "stress", label: "Стресс", unit: "/ 100", digits: 0 },
  { metric: "met", label: "Активность · MET", unit: "MET", digits: 1 }
];
function valueLabel(value: number | undefined, digits = 0) {
  return value === undefined ? "—" : value.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}
function duration(value: number | undefined) {
  if (value === undefined) return "—";
  const minutes = Math.round(value);
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} м`;
}
function dateLabel(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}
function measuredAt(reading: DeviceReading | undefined, timeZone: string) {
  if (!reading) return "Нет данных";
  return new Date(reading.recordedAt).toLocaleString("ru-RU", {
    timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

export function DeviceReadingsPanel({ batch }: { batch: DeviceSyncBatch }) {
  const [selected, setSelected] = useState<string>();
  const all = useMemo(() => readingSummary(batch), [batch]);
  // A freshly connected device may expose different dates.
  const day = selected && all.days.includes(selected) ? selected : undefined;
  const summary = useMemo(() => day ? readingSummary(batch, new Date(), day) : all, [batch, day, all]);
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Показатели браслета</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
      <DateChip label="Последние" selected={!day} onPress={() => setSelected(undefined)} />
      {all.days.map(date => <DateChip key={date} label={dateLabel(date).slice(0, 5)} selected={day === date} onPress={() => setSelected(date)} />)}
    </ScrollView>
    <Text style={styles.section}>{day ? `Активность за ${dateLabel(day)}` : "Активность сегодня"}</Text>
    <View style={styles.activity}>
      <ActivityValue label="Шаги" value={valueLabel(summary.steps)} />
      <ActivityValue label="Расстояние · км" value={valueLabel(summary.distance, 2)} />
      <ActivityValue label="Калории · ккал" value={valueLabel(summary.activeCalories, 1)} />
    </View>
    <Text style={styles.section}>{day ? "Измерения за день" : "Последние измерения"}</Text>
    <View style={styles.grid}>
      {vitals.map(({ metric, label, unit, digits }) => {
        const reading = summary.latest[metric];
        return <View key={metric} style={styles.tile}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{valueLabel(reading?.value, digits)} <Text style={styles.unit}>{reading ? unit : ""}</Text></Text>
          <Text style={styles.caption}>{measuredAt(reading, batch.timeZone)}</Text>
          {reading?.aggregation === "mean" && <Text style={styles.caption}>Среднее записи</Text>}
          {reading?.origin === "manual" && <Text style={styles.caption}>Ручное измерение</Text>}
        </View>;
      })}
      <View style={[styles.tile, styles.wide]}>
        <Text style={styles.label}>Давление · оценка браслета</Text>
        <Text style={styles.value}>{summary.bloodPressure ? `${valueLabel(summary.bloodPressure.high.value)}/${valueLabel(summary.bloodPressure.low.value)}` : "—"}
          <Text style={styles.unit}>{summary.bloodPressure ? " мм рт. ст." : ""}</Text></Text>
        <Text style={styles.caption}>{measuredAt(summary.bloodPressure?.high, batch.timeZone)}</Text>
      </View>
    </View>
    <View style={styles.sleep}>
      <Text style={styles.label}>{summary.sleepDay ? `Сон за ${dateLabel(summary.sleepDay)}` : "Сон"}</Text>
      <Text style={styles.value}>{duration(summary.sleepMinutes)}</Text>
      {summary.latest.sleepDuration?.periodEnd && <Text style={styles.caption}>
        Последний период: {new Date(summary.latest.sleepDuration.recordedAt).toLocaleTimeString("ru-RU", { timeZone: batch.timeZone, hour: "2-digit", minute: "2-digit" })}
        {" — "}{new Date(summary.latest.sleepDuration.periodEnd).toLocaleTimeString("ru-RU", { timeZone: batch.timeZone, hour: "2-digit", minute: "2-digit" })}
      </Text>}
      <View style={styles.stages}>
        {([["sleepDeep", "Глубокий"], ["sleepLight", "Лёгкий"], ["sleepRem", "REM"], ["sleepAwake", "Пробуждения"]] as const)
          .map(([metric, label]) => <View key={metric} style={styles.stage}>
            <Text style={styles.caption}>{label}</Text><Text style={styles.stageValue}>{duration(summary.sleep?.[metric])}</Text>
          </View>)}
      </View>
    </View>
    <Text style={styles.note}>Данные и оценки G72, не медицинское заключение. Прочерк означает, что запись не получена. Измерения, сохранённые только внутри G Band, могут отсутствовать в памяти браслета.</Text>
    {batch.warnings?.map(code => <Text key={code} style={styles.note}>{syncWarningMessage(code)}</Text>)}
    <Text style={styles.note}>Глюкоза, ЭКГ, состав тела и компоненты крови пока не импортируются. Пустая карточка в G Band не означает наличие измерения.</Text>
  </View>;
}
function DateChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.selected]}>
    <Text style={[styles.chipLabel, selected && styles.selectedLabel]}>{label}</Text>
  </Pressable>;
}
function ActivityValue({ label, value }: { label: string; value: string }) {
  return <View style={styles.activityItem}><Text style={styles.activityValue}>{value}</Text><Text style={styles.caption}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  panel: { gap: 12, paddingBottom: 12 },
  title: { fontSize: 21, fontWeight: "700", color: authColors.ink },
  dates: { gap: 8 },
  chip: { paddingHorizontal: 13, minHeight: 44, justifyContent: "center", borderRadius: 22, backgroundColor: "#F3F5F7" },
  selected: { backgroundColor: authColors.greenDark },
  chipLabel: { fontSize: 13, color: authColors.text },
  selectedLabel: { color: "#FFF", fontWeight: "600" },
  section: { fontSize: 14, fontWeight: "600", color: authColors.ink, marginTop: 4 },
  activity: { backgroundColor: "#F2FAF7", padding: 14, borderRadius: 16, flexDirection: "row", gap: 8 },
  activityItem: { flex: 1 },
  activityValue: { fontSize: 20, fontWeight: "700", color: authColors.ink, marginBottom: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", flexGrow: 1, padding: 14, borderWidth: 1, borderColor: "#E6EDEB", borderRadius: 16, gap: 7, backgroundColor: "#FFF" },
  wide: { width: "100%" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: authColors.text },
  value: { fontSize: 25, lineHeight: 32, fontWeight: "700", color: authColors.ink },
  unit: { fontSize: 13, fontWeight: "400", color: authColors.muted },
  caption: { fontSize: 11, lineHeight: 16, color: authColors.muted },
  sleep: { padding: 16, backgroundColor: "#F4F4FC", borderRadius: 16, gap: 8 },
  stages: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  stage: { width: "45%", gap: 3 },
  stageValue: { fontSize: 14, fontWeight: "600", color: authColors.ink },
  note: { fontSize: 12, lineHeight: 18, color: authColors.muted }
});
