import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BodyMeasurements } from "./types";
import {
  AuthScaffold,
  InfoBanner,
  LinkButton,
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
  required?: boolean;
}[] = [
  { key: "height", label: "Рост", unit: "см", icon: "human-male-height", required: true },
  { key: "weight", label: "Вес", unit: "кг", icon: "scale-bathroom", required: true },
  { key: "waist", label: "Талия", unit: "см", icon: "tape-measure" },
  { key: "hips", label: "Бёдра", unit: "см", icon: "tape-measure" },
  { key: "chest", label: "Грудь", unit: "см", icon: "tape-measure" },
  { key: "arm", label: "Плечо (в бицепсе)", unit: "см", icon: "tape-measure" },
  { key: "calf", label: "Икра", unit: "см", icon: "tape-measure" }
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
            required={field.required}
            unit={field.unit}
            value={values[field.key]}
            onChange={(value) => onChange({ ...values, [field.key]: value })}
          />
        ))}
      </View>

      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Обхваты и измерения</Text>
        <Text style={styles.optionalLabel}>необязательно</Text>
      </View>
      <View style={styles.fields}>
        {bodyFields.slice(2).map((field) => (
          <MeasurementField
            key={field.key}
            icon={field.icon}
            label={field.label}
            required={field.required}
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
        <Text style={styles.calculationNoteText}>Показатели рассчитаны на основе введённых данных. Оценку диапазонов предоставит backend AxMed.</Text>
      </View>

      <PrimaryButton title="Рассчитать профиль" disabled={!canContinue} onPress={onContinue} />
    </AuthScaffold>
  );
}

function MeasurementField({
  label,
  unit,
  icon,
  value,
  required,
  onChange
}: {
  label: string;
  unit: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.measurementField}>
      <MaterialCommunityIcons name={icon} size={24} color={authColors.greenDark} />
      <Text style={styles.measurementLabel}>{label}{required ? " *" : ""}</Text>
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
  { id: "bia", title: "BIA-весы", description: "Вес, жир, мышцы, вода и другие показатели состава тела.", icon: "scale-bathroom", recommended: true },
  { id: "watch", title: "Умные часы", description: "Пульс, активность, сон, ВСР и другие показатели.", icon: "watch" },
  { id: "band", title: "Фитнес-браслет", description: "Шаги, пульс, сон и SpO₂ при поддержке устройства.", icon: "watch-variant" },
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
        title="Подключение источника"
        subtitle="Подключите устройства и сервисы, чтобы автоматически собирать данные. Этот шаг можно пропустить."
      />

      <Text style={styles.sectionTitle}>Рекомендуемые источники</Text>
      <View style={styles.sourceList}>
        {sources.map((source) => (
          <Surface key={source.id} style={styles.sourceCard}>
            <View style={[styles.sourceIcon, { backgroundColor: `${source.accent ?? authColors.green}12` }]}>
              <MaterialCommunityIcons name={source.icon} size={34} color={source.accent ?? authColors.greenDark} />
            </View>
            <View style={styles.sourceCopy}>
              <View style={styles.sourceTitleRow}>
                <Text style={styles.sourceTitle}>{source.title}</Text>
                {source.recommended && <Text style={styles.recommended}>Рекомендуем</Text>}
              </View>
              <Text style={styles.sourceDescription}>{source.description}</Text>
              <Text style={styles.permissionText}>Доступ запрашивается только к указанным показателям</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Подключить ${source.title}`} onPress={() => onConnect(source)} style={styles.connectButton}>
              <Text style={styles.connectButtonText}>Подключить</Text>
            </Pressable>
          </Surface>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={onManual} style={styles.manualCard}>
        <View style={styles.manualIcon}>
          <MaterialCommunityIcons name="pencil-outline" size={29} color={authColors.greenDark} />
        </View>
        <View style={styles.sourceCopy}>
          <Text style={styles.sourceTitle}>Ввести данные вручную</Text>
          <Text style={styles.sourceDescription}>Вы сможете пользоваться AxMed без подключения устройства.</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={authColors.ink} />
      </Pressable>

      <InfoBanner
        title="Ваши данные защищены"
        text="Перед подключением мы покажем, какие данные будут считываться и какие разрешения потребуются."
      />

      <View style={styles.sourceActions}>
        <PrimaryButton title="Продолжить" onPress={onContinue} />
        <LinkButton title="Пропустить и продолжить вручную" onPress={onManual} />
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
          <MaterialCommunityIcons name="wifi-off" size={68} color={authColors.danger} />
        </View>
        <PageTitle centered title="Не удалось подключиться" subtitle="Приложение не может установить соединение с вашим устройством." />

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
          <Ionicons name="checkmark" size={54} color="#fff" />
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
  sectionTitle: { color: authColors.ink, fontSize: 17, fontWeight: "700", marginBottom: 12 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 27 },
  optionalLabel: { color: authColors.muted, fontSize: 12, marginBottom: 12 },
  fields: { gap: 9 },
  measurementField: { minHeight: 60, borderRadius: 15, borderWidth: 1, borderColor: authColors.line, backgroundColor: "rgba(255,255,255,0.92)", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 11 },
  measurementLabel: { flex: 1, color: authColors.ink, fontSize: 16, fontWeight: "600" },
  measurementUnit: { color: authColors.muted, fontSize: 15 },
  measurementInput: { width: 76, color: authColors.ink, fontSize: 18, textAlign: "right", paddingVertical: 12 },
  calculationCard: { marginTop: 24, marginBottom: 13, padding: 18, backgroundColor: "#F2FBF8" },
  calculationHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  calculationTitle: { color: authColors.greenDark, fontSize: 16, fontWeight: "700" },
  metricsRow: { flexDirection: "row" },
  metric: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  metricBorder: { borderRightWidth: 1, borderRightColor: "#D8E8E3" },
  metricLabel: { color: authColors.text, fontSize: 15 },
  metricValue: { color: authColors.ink, fontSize: 27, lineHeight: 34, fontWeight: "700", marginTop: 8 },
  metricStatus: { color: authColors.greenDark, fontSize: 11, marginTop: 4, textAlign: "center" },
  calculationNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 24 },
  calculationNoteText: { flex: 1, color: authColors.muted, fontSize: 12, lineHeight: 17 },
  sourceList: { gap: 10 },
  sourceCard: { minHeight: 112, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  sourceIcon: { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  sourceCopy: { flex: 1 },
  sourceTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  sourceTitle: { color: authColors.ink, fontSize: 16, lineHeight: 21, fontWeight: "700" },
  recommended: { color: authColors.greenDark, fontSize: 10, fontWeight: "700", backgroundColor: "#DDF6EF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  sourceDescription: { color: authColors.text, fontSize: 13, lineHeight: 18, marginTop: 4 },
  permissionText: { color: authColors.muted, fontSize: 10.5, lineHeight: 14, marginTop: 5 },
  connectButton: { minHeight: 40, borderRadius: 11, backgroundColor: authColors.greenDark, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  connectButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  manualCard: { borderRadius: 17, backgroundColor: authColors.soft, padding: 16, flexDirection: "row", alignItems: "center", gap: 13, marginVertical: 18 },
  manualIcon: { width: 48, height: 48, borderRadius: 13, backgroundColor: "#DDF6EF", alignItems: "center", justifyContent: "center" },
  sourceActions: { marginTop: 22, gap: 5 },
  errorContent: { justifyContent: "space-between" },
  errorMain: { alignItems: "stretch" },
  connectionErrorIcon: { width: 132, height: 132, borderRadius: 66, backgroundColor: authColors.dangerSoft, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 10, marginBottom: 28 },
  failedDevice: { padding: 18, flexDirection: "row", alignItems: "center", gap: 18 },
  failedDeviceIcon: { width: 94, height: 94, borderRadius: 18, backgroundColor: "#F5F6F7", alignItems: "center", justifyContent: "center" },
  failedDeviceTitle: { color: authColors.ink, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  failedDeviceText: { color: authColors.text, fontSize: 15, lineHeight: 22 },
  tipsCard: { borderRadius: 17, borderWidth: 1, borderColor: "#CBEAE2", backgroundColor: "#F4FBF9", padding: 18, marginTop: 18 },
  tipHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
  tipTitle: { color: authColors.greenDark, fontSize: 17, fontWeight: "700" },
  tip: { color: authColors.text, fontSize: 14, lineHeight: 23, paddingLeft: 5 },
  errorActions: { gap: 13, marginTop: 30 },
  laterText: { color: authColors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 35 },
  completeSteps: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 18, paddingLeft: 95, marginBottom: 22 },
  stepsOnly: { flex: 1, flexDirection: "row", gap: 7 },
  completeStep: { flex: 1, height: 5, borderRadius: 4, backgroundColor: authColors.greenDark },
  completeStepText: { color: authColors.greenDark, fontSize: 14, minWidth: 83, textAlign: "right" },
  resultHero: { flexDirection: "row", alignItems: "center", gap: 22, marginBottom: 22 },
  successIcon: { width: 98, height: 98, borderRadius: 49, backgroundColor: authColors.green, alignItems: "center", justifyContent: "center", borderWidth: 10, borderColor: "#DCF6EF" },
  resultHeroCopy: { flex: 1 },
  resultTitle: { color: authColors.ink, fontSize: 32, lineHeight: 39, fontWeight: "800" },
  resultSubtitle: { color: authColors.text, fontSize: 16, lineHeight: 23, marginTop: 7 },
  resultCard: { padding: 18, marginBottom: 16 },
  resultCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 19 },
  resultCardTitle: { color: authColors.ink, fontSize: 18, lineHeight: 24, fontWeight: "700" },
  updatedBadge: { color: authColors.greenDark, fontSize: 11, backgroundColor: authColors.soft, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  resultMetrics: { flexDirection: "row" },
  resultMetric: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  resultMetricBorder: { borderRightWidth: 1, borderRightColor: authColors.line },
  resultMetricLabel: { color: authColors.text, fontSize: 12, marginTop: 6, textAlign: "center" },
  resultMetricValue: { color: authColors.ink, fontSize: 20, lineHeight: 27, fontWeight: "700", marginTop: 6 },
  resultMetricUnit: { color: authColors.muted, fontSize: 10, textAlign: "center" },
  profileCard: { padding: 18, marginBottom: 16 },
  profileTop: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  profileIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: authColors.soft, alignItems: "center", justifyContent: "center" },
  profileText: { color: authColors.text, fontSize: 14, lineHeight: 20, marginTop: 6 },
  qualityRow: { minHeight: 76, borderRadius: 13, backgroundColor: authColors.soft, flexDirection: "row", alignItems: "center", marginTop: 17, padding: 13 },
  qualityItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  qualityDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#D1E7E1", marginHorizontal: 11 },
  qualityLabel: { color: authColors.text, fontSize: 11 },
  qualityValue: { color: authColors.greenDark, fontSize: 13, fontWeight: "700", marginTop: 3 },
  nextStepCard: { borderRadius: 18, borderWidth: 1.5, borderColor: authColors.greenDark, backgroundColor: "#F4FBF9", padding: 17 },
  nextStepEyebrow: { color: authColors.greenDark, fontSize: 15, fontWeight: "600", marginBottom: 12 },
  nextStepRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  nextStepIcon: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: authColors.line, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  nextStepTitle: { color: authColors.ink, fontSize: 18, fontWeight: "700" },
  nextStepText: { color: authColors.text, fontSize: 12, lineHeight: 17, marginTop: 4 },
  resultActions: { marginTop: 22, gap: 13 }
});
