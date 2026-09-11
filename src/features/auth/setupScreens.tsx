import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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

const deviceSprite = require("../../../assets/auth-device-sprite.png") as ImageSourcePropType;
const deviceSpriteLeftOffsets = [-0.15, -1.17, -2.01, -2.88, -3.95];

const bodyFields: {
  key: keyof BodyMeasurements;
  label: string;
  unit: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hint?: string;
}[] = [
  { key: "height", label: "Рост", unit: "см", icon: "human-male-height" },
  { key: "weight", label: "Вес", unit: "кг", icon: "scale-bathroom" },
  { key: "waist", label: "Талия", unit: "см", icon: "tape-measure" },
  { key: "hips", label: "Бёдра", unit: "см", icon: "tape-measure" },
  { key: "chest", label: "Грудь", unit: "см", icon: "tape-measure" },
  { key: "arm", label: "Бицепс", hint: "Обхват плеча", unit: "см", icon: "tape-measure" },
  { key: "calf", label: "Икра", hint: "В самом широком месте", unit: "см", icon: "tape-measure" }
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
  const [showCircumferences, setShowCircumferences] = useState(false);
  const canContinue = numberValue(values.height) > 0 && numberValue(values.weight) > 0;

  return (
    <AuthScaffold>
      <StepHeader current={3} onBack={onBack} />
      <PageTitle
        title="Данные тела"
        subtitle="Начните с роста и веса. Остальное — по желанию."
      />

      <View style={styles.primaryMeasurements}>
        {bodyFields.slice(0, 2).map((field) => (
          <MeasurementField
            key={field.key}
            prominent
            icon={field.icon}
            label={field.label}
            unit={field.unit}
            value={values[field.key]}
            onChange={(value) => onChange({ ...values, [field.key]: value })}
          />
        ))}
      </View>

      <View style={styles.circumferencesCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Обхваты тела"
          accessibilityState={{ expanded: showCircumferences }}
          onPress={() => setShowCircumferences((current) => !current)}
          style={({ pressed }) => [styles.circumferencesHeader, pressed && styles.bodyPressed]}
        >
          <View style={styles.circumferencesCopy}>
            <Text style={styles.circumferencesTitle}>Обхваты тела</Text>
            <Text style={styles.circumferencesSubtitle}>Необязательно</Text>
          </View>
          <Ionicons name={showCircumferences ? "chevron-up" : "add"} size={24} color={authColors.greenDark} />
        </Pressable>
        {showCircumferences && (
          <View style={styles.circumferencesFields}>
            {bodyFields.slice(2).map((field) => (
              <MeasurementField
                key={field.key}
                label={field.label}
                hint={field.hint}
                unit={field.unit}
                value={values[field.key]}
                onChange={(value) => onChange({ ...values, [field.key]: value })}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.bodyActions}>
        <PrimaryButton title="Продолжить" disabled={!canContinue} onPress={onContinue} />
      </View>
    </AuthScaffold>
  );
}

function MeasurementField({
  label,
  unit,
  icon,
  hint,
  prominent = false,
  value,
  onChange
}: {
  label: string;
  unit: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  hint?: string;
  prominent?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessible={false}
      focusable={false}
      onPress={() => inputRef.current?.focus()}
      style={[
        styles.measurementField,
        prominent && styles.primaryMeasurement,
        focused && styles.measurementFocused
      ]}
    >
      <View style={[styles.measurementCopy, !prominent && styles.measurementRowCopy]}>
        {icon && <MaterialCommunityIcons name={icon} size={21} color={authColors.greenDark} />}
        <View style={styles.measurementLabelCopy}>
          <Text style={styles.measurementLabel}>{label}</Text>
          {hint && <Text style={styles.measurementHint}>{hint}</Text>}
        </View>
      </View>
      <View style={[styles.measurementValueRow, prominent && styles.primaryMeasurementValue]}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={`${label}, ${unit}`}
          accessibilityHint={hint}
          keyboardType="decimal-pad"
          maxLength={6}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onChangeText={(next) => onChange(next.replace(/[^0-9,.]/g, ""))}
          placeholder="—"
          placeholderTextColor="#A9B0BA"
          selectTextOnFocus
          selectionColor={authColors.green}
          style={[styles.measurementInput, prominent && styles.primaryMeasurementInput]}
          value={value}
        />
        <Text style={styles.measurementUnit}>{unit}</Text>
      </View>
    </Pressable>
  );
}

function DeviceArtwork({ index, size = 54 }: { index: number; size?: number }) {
  return (
    <View style={[styles.deviceArtwork, { width: size, height: size }]}>
      <Image
        resizeMode="stretch"
        source={deviceSprite}
        style={{
          height: size * 2,
          left: deviceSpriteLeftOffsets[index] * size,
          top: -size / 2,
          width: size * 5
        }}
      />
    </View>
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
            <DeviceArtwork index={0} size={76} />
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

function numberValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

const styles = StyleSheet.create({
  primaryMeasurements: { flexDirection: "row", gap: 12, marginBottom: 20 },
  measurementField: { minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: "#E5EBEF", backgroundColor: authColors.white, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, gap: 10 },
  primaryMeasurement: { flex: 1, minWidth: 0, minHeight: 132, flexDirection: "column", alignItems: "stretch", justifyContent: "space-between", backgroundColor: "#F8FAFA", paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  measurementFocused: { borderColor: authColors.green, backgroundColor: "#F2FBF8" },
  measurementCopy: { flexDirection: "row", alignItems: "center", gap: 8 },
  measurementRowCopy: { flex: 1 },
  measurementLabelCopy: { flex: 1 },
  measurementLabel: { color: authColors.ink, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  measurementHint: { color: authColors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  measurementValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  primaryMeasurementValue: { width: "100%" },
  measurementUnit: { color: authColors.muted, fontSize: 14 },
  measurementInput: { width: 64, minHeight: 48, color: authColors.ink, fontSize: 19, fontWeight: "500", textAlign: "right", padding: 0, fontVariant: ["tabular-nums"] },
  primaryMeasurementInput: { flex: 1, minWidth: 0, width: "auto", fontSize: 30, fontWeight: "600", textAlign: "left" },
  circumferencesCard: { borderWidth: 1, borderColor: authColors.line, borderRadius: 18, marginBottom: 24 },
  circumferencesHeader: { minHeight: 78, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  circumferencesCopy: { flex: 1 },
  circumferencesTitle: { color: authColors.ink, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  circumferencesSubtitle: { color: authColors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  circumferencesFields: { padding: 12, paddingTop: 0, gap: 8 },
  bodyPressed: { opacity: 0.65 },
  bodyActions: { flexGrow: 1, justifyContent: "flex-end", paddingTop: 8 },
  deviceArtwork: { overflow: "hidden", alignItems: "flex-start", justifyContent: "flex-start" },
  sourceCopy: { flex: 1 },
  errorContent: { justifyContent: "space-between" },
  errorMain: { alignItems: "stretch" },
  connectionErrorIcon: { width: 98, height: 98, borderRadius: 49, backgroundColor: authColors.dangerSoft, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 8, marginBottom: 20 },
  failedDevice: { padding: 16, flexDirection: "row", alignItems: "center", gap: 16 },
  failedDeviceIcon: { width: 92, height: 92, borderRadius: 17, backgroundColor: "#F5F8F7", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  failedDeviceTitle: { color: authColors.ink, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  failedDeviceText: { color: authColors.text, fontSize: 14, lineHeight: 20 },
  tipsCard: { borderRadius: 17, borderWidth: 1, borderColor: "#CBEAE2", backgroundColor: "#F4FBF9", padding: 15, marginTop: 15 },
  tipHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
  tipTitle: { color: authColors.greenDark, fontSize: 16, fontWeight: "700" },
  tip: { color: authColors.text, fontSize: 11.5, lineHeight: 19, paddingLeft: 5 },
  errorActions: { gap: 12, marginTop: 24 },
  laterText: { color: authColors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 35 },
});
