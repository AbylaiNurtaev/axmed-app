import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BodyMeasurements } from "./types";
import {
  AuthScaffold,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
  StepHeader,
  Surface,
  authColors
} from "./ui";

const bodyFields: {
  key: keyof BodyMeasurements;
  label: string;
  unit: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { key: "height", label: "Рост", unit: "см", icon: "human-male-height" },
  { key: "weight", label: "Вес", unit: "кг", icon: "scale-bathroom" },
  { key: "waist", label: "Талия", unit: "см", icon: "tape-measure" },
  { key: "hips", label: "Бёдра", unit: "см", icon: "tape-measure" },
  { key: "chest", label: "Грудь", unit: "см", icon: "tape-measure" },
  { key: "arm", label: "Плечо (в бицепсе)", unit: "см", icon: "tape-measure" },
  { key: "calf", label: "Икра (в самом широком месте)", unit: "см", icon: "tape-measure" }
];

export function BodyDataScreen({
  values,
  onChange,
  onBack,
  onContinue
}: {
  values: BodyMeasurements;
  onChange: (values: BodyMeasurements) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const metrics = calculateBodyMetrics(values);
  const canContinue = numberValue(values.height) > 0 && numberValue(values.weight) > 0;

  return (
    <AuthScaffold>
      <StepHeader current={3} onBack={onBack} />
      <PageTitle
        compact
        title="Первые данные тела"
        subtitle="Эти данные помогут рассчитать ваши показатели и сравнивать изменения со временем."
      />

      <Text style={styles.sectionTitle}>Основные параметры</Text>
      <View style={styles.fields}>
        {bodyFields.slice(0, 2).map((field) => (
          <MeasurementField
            key={field.key}
            icon={field.icon}
            label={field.label}
            unit={field.unit}
            value={values[field.key]}
            onChange={(value) => onChange({ ...values, [field.key]: value })}
          />
        ))}
      </View>

      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Обхваты и измерения</Text>
      </View>
      <View style={styles.fields}>
        {bodyFields.slice(2).map((field) => (
          <MeasurementField
            key={field.key}
            icon={field.icon}
            label={field.label}
            unit={field.unit}
            value={values[field.key]}
            onChange={(value) => onChange({ ...values, [field.key]: value })}
          />
        ))}
      </View>

      <Surface style={styles.calculationCard}>
        <View style={styles.calculationHeader}>
          <Text style={styles.calculationTitle}>Ваши расчётные показатели</Text>
          <Ionicons name="information-circle-outline" size={23} color={authColors.greenDark} />
        </View>
        <View style={styles.metricsRow}>
          <Metric label="BMI" value={metrics.bmi} />
          <Metric label="WHtR" value={metrics.whtr} />
          <Metric label="WHR" value={metrics.whr} last />
        </View>
      </Surface>

      <View style={styles.calculationNote}>
        <Ionicons name="information-circle-outline" size={19} color={authColors.muted} />
        <Text style={styles.calculationNoteText}>Показатели рассчитаны на основе введённых данных.</Text>
      </View>

      <PrimaryButton title="Продолжить" disabled={!canContinue} onPress={onContinue} />
    </AuthScaffold>
  );
}

function MeasurementField({
  label,
  unit,
  icon,
  value,
  onChange
}: {
  label: string;
  unit: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.measurementField}>
      <MaterialCommunityIcons name={icon} size={22} color={authColors.greenDark} />
      <Text numberOfLines={1} style={styles.measurementLabel}>{label}</Text>
      <Text style={styles.measurementUnit}>{unit}</Text>
      <TextInput
        accessibilityLabel={`${label}, ${unit}`}
        keyboardType="decimal-pad"
        onChangeText={(next) => onChange(next.replace(/[^0-9,.]/g, ""))}
        placeholder="—"
        placeholderTextColor="#A9B0BA"
        selectTextOnFocus
        style={styles.measurementInput}
        value={value}
      />
    </View>
  );
}

function Metric({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.metric, !last && styles.metricBorder]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricStatus}>{value === "—" ? "Нет данных" : "Рассчитано"}</Text>
    </View>
  );
}

type SourceItem = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  recommended?: boolean;
  accent?: string;
};

const sources: SourceItem[] = [
  { id: "bia", title: "BIA-весы", description: "Анализ состава тела: вес, жир, мышцы, вода и др.", icon: "scale-bathroom", recommended: true },
  { id: "watch", title: "Умные часы", description: "Пульс, активность, сон, HRV и другие показатели.", icon: "watch" },
  { id: "band", title: "Фитнес-браслет", description: "Шаги, пульс, сон, SpO₂ и уровень стресса.", icon: "watch-variant" },
  { id: "healthkit", title: "Apple Health (HealthKit)", description: "Импорт данных из приложения «Здоровье» на iPhone.", icon: "heart", accent: "#FF3B68" },
  { id: "healthconnect", title: "Health Connect", description: "Импорт данных из приложений и сервисов на Android.", icon: "link-variant", accent: "#467BEF" }
];

export function DataSourceScreen({
  onBack,
  onConnect,
  onManual,
  onContinue
}: {
  onBack: () => void;
  onConnect: (source: SourceItem) => void;
  onManual: () => void;
  onContinue: () => void;
}) {
  return (
    <AuthScaffold>
      <StepHeader current={4} onBack={onBack} />
      <PageTitle
        compact
        title="Подключение источника"
        subtitle="Подключите устройства и сервисы, чтобы автоматически собирать ваши данные и получать более точные рекомендации."
      />

      <Text style={[styles.sectionTitle, styles.sourceSectionTitle]}>Рекомендуемые источники</Text>
      <View style={styles.sourceList}>
        {sources.map((source) => (
          <Surface key={source.id} style={styles.sourceCard}>
            <View style={[styles.sourceIcon, { backgroundColor: `${source.accent ?? authColors.green}12` }]}>
              <MaterialCommunityIcons name={source.icon} size={30} color={source.accent ?? authColors.greenDark} />
            </View>
            <View style={styles.sourceCopy}>
              <View style={styles.sourceTitleRow}>
                <Text style={styles.sourceTitle}>{source.title}</Text>
                {source.recommended && <Text style={styles.recommended}>Рекомендуем</Text>}
              </View>
              <Text style={styles.sourceDescription}>{source.description}</Text>
            </View>
            <View style={styles.connectActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Подключить ${source.title}`} onPress={() => onConnect(source)} style={styles.connectButton}>
                <Text style={styles.connectButtonText}>Подключить</Text>
              </Pressable>
              <Ionicons name="chevron-forward" size={20} color={authColors.text} />
            </View>
          </Surface>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={onManual} style={styles.manualCard}>
        <View style={styles.manualIcon}>
          <MaterialCommunityIcons name="pencil-outline" size={29} color={authColors.greenDark} />
        </View>
        <View style={styles.sourceCopy}>
          <Text style={styles.sourceTitle}>Ввести данные вручную</Text>
          <Text style={styles.sourceDescription}>Вы сможете добавить данные вручную, если не подключите устройства сейчас.</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={authColors.ink} />
      </Pressable>

      <View style={styles.privacyRow}>
        <View style={styles.privacyIcon}>
          <MaterialCommunityIcons name="lock" size={22} color={authColors.greenDark} />
        </View>
        <View style={styles.sourceCopy}>
          <Text style={styles.privacyTitle}>Ваши данные защищены</Text>
          <Text style={styles.privacyText}>Мы используем шифрование и не передаём данные третьим лицам без вашего согласия.</Text>
        </View>
      </View>

      <View style={styles.sourceActions}>
        <PrimaryButton title="Продолжить" onPress={onContinue} />
      </View>
    </AuthScaffold>
  );
}

export function ConnectionErrorScreen({
  source,
  onBack,
  onRetry,
  onManual
}: {
  source: string;
  onBack: () => void;
  onRetry: () => void;
  onManual: () => void;
}) {
  return (
    <AuthScaffold contentStyle={styles.errorContent}>
      <StepHeader current={4} onBack={onBack} />
      <View style={styles.errorMain}>
        <View style={styles.connectionErrorIcon}>
          <MaterialCommunityIcons name="wifi-off" size={52} color={authColors.danger} />
        </View>
        <PageTitle compact centered title="Не удалось подключиться" subtitle="Приложение не может установить соединение с вашим устройством." />

        <Surface style={styles.failedDevice}>
          <View style={styles.failedDeviceIcon}>
            <MaterialCommunityIcons name="scale-bathroom" size={54} color="#8D949D" />
          </View>
          <View style={styles.sourceCopy}>
            <Text style={styles.failedDeviceTitle}>{source}</Text>
            <Text style={styles.failedDeviceText}>Модель: BodyScale X</Text>
            <Text style={styles.failedDeviceText}>SN: BSX123456789</Text>
          </View>
        </Surface>

        <View style={styles.tipsCard}>
          <View style={styles.tipHeading}>
            <Ionicons name="information-circle-outline" size={26} color={authColors.greenDark} />
            <Text style={styles.tipTitle}>Что можно сделать</Text>
          </View>
          {[
            "Убедитесь, что устройство включено и заряжено",
            "Проверьте, включён ли Bluetooth на телефоне",
            "Расположите телефон ближе к устройству",
            "Попробуйте перезапустить устройство"
          ].map((tip) => <Text key={tip} style={styles.tip}>•  {tip}</Text>)}
        </View>
      </View>

      <View style={styles.errorActions}>
        <PrimaryButton title="Повторить подключение" icon="refresh-outline" onPress={onRetry} />
        <SecondaryButton title="Продолжить с ручным вводом" icon="pencil-outline" onPress={onManual} />
        <Text style={styles.laterText}>Вы сможете подключить устройство позже в настройках приложения.</Text>
      </View>
    </AuthScaffold>
  );
}

export function FirstResultScreen({
  measurements,
  onComplete
}: {
  measurements: BodyMeasurements;
  onComplete: () => void;
}) {
  const metrics = calculateBodyMetrics(measurements);
  const items = [
    ["scale-bathroom", "Вес", measurements.weight || "—", measurements.weight ? "кг" : ""],
    ["human-male", "BMI", metrics.bmi, ""],
    ["tape-measure", "Талия", measurements.waist || "—", measurements.waist ? "см" : ""],
    ["human-handsup", "WHtR", metrics.whtr, ""],
    ["human", "WHR", metrics.whr, ""]
  ] as const;
  const hasRecommendedData = Boolean(measurements.waist && measurements.hips);

  return (
    <AuthScaffold>
      <View style={styles.completeSteps}>
        <View style={styles.stepsOnly}>
          {Array.from({ length: 4 }, (_, index) => <View key={index} style={styles.completeStep} />)}
        </View>
        <Text style={styles.completeStepText}>Шаг 4 из 4</Text>
      </View>

      <View style={styles.resultHero}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={40} color="#fff" />
        </View>
        <View style={styles.resultHeroCopy}>
          <Text style={styles.resultTitle}>Первый результат</Text>
          <Text style={styles.resultSubtitle}>AxMed обработал ваши первые доступные данные тела.</Text>
        </View>
      </View>

      <Surface style={styles.resultCard}>
        <View style={styles.resultCardHeader}>
          <Text style={styles.resultCardTitle}>Ваши ключевые показатели</Text>
          <Text style={styles.updatedBadge}>Обновлено сейчас</Text>
        </View>
        <View style={styles.resultMetrics}>
          {items.map(([icon, label, value, unit], index) => (
            <View key={label} style={[styles.resultMetric, index < items.length - 1 && styles.resultMetricBorder]}>
              <MaterialCommunityIcons name={icon} size={26} color={authColors.greenDark} />
              <Text style={styles.resultMetricLabel}>{label}</Text>
              <Text style={styles.resultMetricValue}>{value}</Text>
              <Text style={styles.resultMetricUnit}>{unit || (value === "—" ? "нет данных" : "рассчитано")}</Text>
            </View>
          ))}
        </View>
      </Surface>

      <Surface style={styles.profileCard}>
        <View style={styles.profileTop}>
          <View style={styles.profileIcon}>
            <MaterialCommunityIcons name="shield-check-outline" size={38} color={authColors.greenDark} />
          </View>
          <View style={styles.sourceCopy}>
            <Text style={styles.resultCardTitle}>Краткий профиль тела</Text>
            <Text style={styles.profileText}>Первые показатели рассчитаны. Более точные выводы появятся после дополнительных измерений.</Text>
          </View>
        </View>
        <View style={styles.qualityRow}>
          <View style={styles.qualityItem}>
            <MaterialCommunityIcons name="database-outline" size={26} color={authColors.greenDark} />
            <View>
              <Text style={styles.qualityLabel}>Полнота данных</Text>
              <Text style={styles.qualityValue}>{hasRecommendedData ? "Хорошая" : "Базовая"}</Text>
            </View>
          </View>
          <View style={styles.qualityDivider} />
          <View style={styles.qualityItem}>
            <MaterialCommunityIcons name="certificate-outline" size={26} color={authColors.greenDark} />
            <View>
              <Text style={styles.qualityLabel}>Источник</Text>
              <Text style={styles.qualityValue}>Ручной ввод</Text>
            </View>
          </View>
        </View>
      </Surface>

      <Pressable accessibilityRole="button" style={styles.nextStepCard} onPress={() => Alert.alert("Следующий шаг", "Сценарий измерения давления будет подключён в основном приложении.")}>
        <Text style={styles.nextStepEyebrow}>Рекомендуемый следующий шаг</Text>
        <View style={styles.nextStepRow}>
          <View style={styles.nextStepIcon}><MaterialCommunityIcons name="heart-pulse" size={35} color={authColors.greenDark} /></View>
          <View style={styles.sourceCopy}>
            <Text style={styles.nextStepTitle}>Измерить давление</Text>
            <Text style={styles.nextStepText}>Это поможет дополнить профиль и точнее оценить состояние сердечно-сосудистой системы.</Text>
          </View>
          <Ionicons name="chevron-forward" size={27} color={authColors.greenDark} />
        </View>
      </Pressable>

      <View style={styles.resultActions}>
        <PrimaryButton title="На Главную" onPress={onComplete} />
        <SecondaryButton
          title="Почему такой результат?"
          onPress={() => Alert.alert("Почему такой результат?", "Использованы введённые рост, вес и обхваты. Источник — ручной ввод. Полнота и качество показаны отдельно.")}
        />
      </View>
    </AuthScaffold>
  );
}

function calculateBodyMetrics(values: BodyMeasurements) {
  const heightCm = numberValue(values.height);
  const weight = numberValue(values.weight);
  const waist = numberValue(values.waist);
  const hips = numberValue(values.hips);
  const heightM = heightCm / 100;
  return {
    bmi: heightM > 0 && weight > 0 ? (weight / (heightM * heightM)).toFixed(1) : "—",
    whtr: heightCm > 0 && waist > 0 ? (waist / heightCm).toFixed(2) : "—",
    whr: hips > 0 && waist > 0 ? (waist / hips).toFixed(2) : "—"
  };
}

function numberValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

const styles = StyleSheet.create({
  sectionTitle: { color: authColors.ink, fontSize: 17, fontWeight: "700", marginBottom: 2 },
  sourceSectionTitle: { marginBottom: 6 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 2 },
  fields: { gap: 4 },
  measurementField: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: authColors.line, backgroundColor: "rgba(255,255,255,0.96)", flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 7 },
  measurementLabel: { flex: 1, color: authColors.ink, fontSize: 13, fontWeight: "600" },
  measurementUnit: { color: authColors.muted, fontSize: 13 },
  measurementInput: { width: 55, color: authColors.ink, fontSize: 15, textAlign: "right", paddingVertical: 8 },
  calculationCard: { marginTop: 13, marginBottom: 9, padding: 12, backgroundColor: "#F2FBF8" },
  calculationHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calculationTitle: { color: authColors.greenDark, fontSize: 16, fontWeight: "700" },
  metricsRow: { flexDirection: "row" },
  metric: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  metricBorder: { borderRightWidth: 1, borderRightColor: "#D8E8E3" },
  metricLabel: { color: authColors.text, fontSize: 15 },
  metricValue: { color: authColors.ink, fontSize: 23, lineHeight: 28, fontWeight: "700", marginTop: 4 },
  metricStatus: { color: authColors.greenDark, fontSize: 10, marginTop: 3, textAlign: "center" },
  calculationNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 16 },
  calculationNoteText: { flex: 1, color: authColors.muted, fontSize: 12, lineHeight: 17 },
  sourceList: { gap: 2 },
  sourceCard: { minHeight: 76, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  sourceIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  sourceCopy: { flex: 1 },
  sourceTitleRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  sourceTitle: { color: authColors.ink, fontSize: 13, lineHeight: 16, fontWeight: "700" },
  recommended: { color: authColors.greenDark, fontSize: 8.5, fontWeight: "700", backgroundColor: "#DDF6EF", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9 },
  sourceDescription: { color: authColors.text, fontSize: 10.5, lineHeight: 14, marginTop: 2 },
  connectActions: { alignItems: "center", flexDirection: "row", gap: 4 },
  connectButton: { minHeight: 32, borderRadius: 9, backgroundColor: authColors.greenDark, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  connectButtonText: { color: "#fff", fontSize: 9.5, fontWeight: "700" },
  manualCard: { borderRadius: 17, backgroundColor: authColors.soft, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, marginVertical: 14 },
  manualIcon: { width: 48, height: 48, borderRadius: 13, backgroundColor: "#DDF6EF", alignItems: "center", justifyContent: "center" },
  privacyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 5 },
  privacyIcon: { width: 45, height: 45, borderRadius: 23, backgroundColor: authColors.soft, alignItems: "center", justifyContent: "center" },
  privacyTitle: { color: authColors.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" },
  privacyText: { color: authColors.text, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  sourceActions: { marginTop: 16, gap: 4 },
  errorContent: { justifyContent: "space-between" },
  errorMain: { alignItems: "stretch" },
  connectionErrorIcon: { width: 98, height: 98, borderRadius: 49, backgroundColor: authColors.dangerSoft, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 8, marginBottom: 20 },
  failedDevice: { padding: 16, flexDirection: "row", alignItems: "center", gap: 16 },
  failedDeviceIcon: { width: 82, height: 82, borderRadius: 17, backgroundColor: "#F5F6F7", alignItems: "center", justifyContent: "center" },
  failedDeviceTitle: { color: authColors.ink, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  failedDeviceText: { color: authColors.text, fontSize: 14, lineHeight: 20 },
  tipsCard: { borderRadius: 17, borderWidth: 1, borderColor: "#CBEAE2", backgroundColor: "#F4FBF9", padding: 15, marginTop: 15 },
  tipHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
  tipTitle: { color: authColors.greenDark, fontSize: 16, fontWeight: "700" },
  tip: { color: authColors.text, fontSize: 11.5, lineHeight: 19, paddingLeft: 5 },
  errorActions: { gap: 12, marginTop: 24 },
  laterText: { color: authColors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 35 },
  completeSteps: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 16, paddingLeft: 58, marginBottom: 15 },
  stepsOnly: { flex: 1, flexDirection: "row", gap: 7 },
  completeStep: { flex: 1, height: 5, borderRadius: 4, backgroundColor: authColors.greenDark },
  completeStepText: { color: authColors.greenDark, fontSize: 14, minWidth: 83, textAlign: "right" },
  resultHero: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16 },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: authColors.green, alignItems: "center", justifyContent: "center", borderWidth: 6, borderColor: "#DCF6EF" },
  resultHeroCopy: { flex: 1 },
  resultTitle: { color: authColors.ink, fontSize: 25, lineHeight: 31, fontWeight: "800" },
  resultSubtitle: { color: authColors.text, fontSize: 14, lineHeight: 20, marginTop: 5 },
  resultCard: { padding: 14, marginBottom: 12 },
  resultCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 },
  resultCardTitle: { color: authColors.ink, fontSize: 16, lineHeight: 21, fontWeight: "700" },
  updatedBadge: { color: authColors.greenDark, fontSize: 9.5, backgroundColor: authColors.soft, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  resultMetrics: { flexDirection: "row" },
  resultMetric: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  resultMetricBorder: { borderRightWidth: 1, borderRightColor: authColors.line },
  resultMetricLabel: { color: authColors.text, fontSize: 10.5, marginTop: 4, textAlign: "center" },
  resultMetricValue: { color: authColors.ink, fontSize: 18, lineHeight: 23, fontWeight: "700", marginTop: 4 },
  resultMetricUnit: { color: authColors.muted, fontSize: 8.5, textAlign: "center" },
  profileCard: { padding: 14, marginBottom: 12 },
  profileTop: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  profileIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: authColors.soft, alignItems: "center", justifyContent: "center" },
  profileText: { color: authColors.text, fontSize: 12, lineHeight: 17, marginTop: 4 },
  qualityRow: { minHeight: 58, borderRadius: 13, backgroundColor: authColors.soft, flexDirection: "row", alignItems: "center", marginTop: 12, padding: 10 },
  qualityItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  qualityDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#D1E7E1", marginHorizontal: 11 },
  qualityLabel: { color: authColors.text, fontSize: 9.5 },
  qualityValue: { color: authColors.greenDark, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  nextStepCard: { borderRadius: 18, borderWidth: 1.5, borderColor: authColors.greenDark, backgroundColor: "#F4FBF9", padding: 14 },
  nextStepEyebrow: { color: authColors.greenDark, fontSize: 13, fontWeight: "600", marginBottom: 9 },
  nextStepRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  nextStepIcon: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: authColors.line, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  nextStepTitle: { color: authColors.ink, fontSize: 16, fontWeight: "700" },
  nextStepText: { color: authColors.text, fontSize: 10.5, lineHeight: 14, marginTop: 3 },
  resultActions: { marginTop: 14, gap: 10 }
});
