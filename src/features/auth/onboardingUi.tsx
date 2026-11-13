import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, useWindowDimensions, View
} from "react-native";
import type { StyleProp, TextInputProps, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

// Keep the existing names compatible with the shared device-connection screen.
export const authColors = {
  background: "#F7F7F7", ink: "#111111", text: "#444444", muted: "#6B6B6B",
  line: "#E3E3E3", soft: "#EFEFEF", white: "#FFFFFF",
  green: "#111111", greenDark: "#111111", greenLight: "#505050",
  danger: "#333333", dangerSoft: "#ECECEC"
} as const;

export function AuthScaffold({ children, contentStyle, noScroll = false }: {
  children: ReactNode; contentStyle?: StyleProp<ViewStyle>; noScroll?: boolean;
}) {
  const { height } = useWindowDimensions();
  const content = <View style={[styles.content, height < 740 && styles.contentCompact, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        {noScroll ? content : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>{content}</ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AxMedLogo() {
  return (
    <View accessible accessibilityLabel="AxMed" style={styles.brand}>
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.brandMark}>
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d="M12 4.5V19.5M4.5 12H19.5" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" />
        </Svg>
      </View>
      <Text style={styles.wordmark}>AxMed</Text>
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={onPress}
    style={({ pressed }) => [styles.backButton, pressed && styles.surfacePressed]}>
    <Ionicons name="arrow-back" size={21} color={authColors.ink} />
  </Pressable>;
}

export function AuthHeader({ onBack }: { onBack?: () => void }) {
  return <View style={styles.header}>
    {onBack ? <BackButton onPress={onBack} /> : <View />}
    <AxMedLogo />
  </View>;
}

export function StepHeader({ current, total = 4, labelTotal = total, onBack }: {
  current: number; total?: number; labelTotal?: number; onBack: () => void;
}) {
  return (
    <View>
      <AuthHeader onBack={onBack} />
      <View accessible accessibilityLabel={'Шаг ' + current + ' из ' + labelTotal} style={styles.progress}>
        <Text allowFontScaling style={styles.stepText}>Шаг {current} из {labelTotal}</Text>
        <View style={styles.steps}>
          {Array.from({ length: total }, (_, index) => (
            <View key={index} style={[styles.step, index < current && styles.stepActive]} />
          ))}
        </View>
      </View>
    </View>
  );
}

export function PageTitle({ title, subtitle, centered = false, compact = false }: {
  title: string; subtitle?: string; centered?: boolean; compact?: boolean;
}) {
  const { width } = useWindowDimensions();
  return <View style={styles.heading}>
    <Text allowFontScaling accessibilityRole="header"
      style={[styles.title, (compact || width < 375) && styles.titleCompact, centered && styles.centered]}>{title}</Text>
    {subtitle ? <Text allowFontScaling style={[styles.subtitle, centered && styles.centered]}>{subtitle}</Text> : null}
  </View>;
}

type ButtonProps = {
  title: string; onPress: () => void; disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap; variant?: "default" | "welcome" | "entry";
};

export function PrimaryButton({ title, onPress, disabled = false, icon }: ButtonProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed, disabled && styles.disabled]}>
      <Text allowFontScaling style={styles.primaryText}>{title}</Text>
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.buttonArrow}>
        <Ionicons name={icon ?? "arrow-forward"} size={20} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, disabled = false, icon }: ButtonProps & { darkText?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.secondary, pressed && styles.surfacePressed, disabled && styles.disabled]}>
    {icon ? <Ionicons name={icon} size={20} color={authColors.ink} /> : null}
    <Text allowFontScaling style={styles.secondaryText}>{title}</Text>
  </Pressable>;
}

export function LinkButton({ title, onPress, icon, disabled = false }: ButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.link, pressed && styles.pressed, disabled && styles.disabled]}>
    {icon ? <Ionicons name={icon} size={18} color={authColors.ink} /> : null}
    <Text allowFontScaling style={styles.linkText}>{title}</Text>
  </Pressable>;
}

export function FormField({ label, icon, error, rightIcon, rightIconAccessibilityLabel, onRightIconPress, ...props }: TextInputProps & {
  label?: string; icon?: keyof typeof Ionicons.glyphMap; error?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap; rightIconAccessibilityLabel?: string; onRightIconPress?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return <View>
    {label ? <Text allowFontScaling style={styles.label}>{label}</Text> : null}
    <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
      {!label && icon ? <Ionicons name={icon} size={20} color={authColors.muted} /> : null}
      <TextInput {...props} allowFontScaling autoCorrect={false} placeholderTextColor="#777777"
        selectionColor={authColors.ink} style={[styles.input, props.style]}
        onFocus={event => { setFocused(true); props.onFocus?.(event); }}
        onBlur={event => { setFocused(false); props.onBlur?.(event); }} />
      {rightIcon ? <Pressable accessibilityRole="button" accessibilityLabel={rightIconAccessibilityLabel}
        disabled={props.editable === false} onPress={onRightIconPress} style={styles.eyeButton}>
        <Ionicons name={rightIcon} size={21} color={authColors.muted} />
      </Pressable> : null}
    </View>
    {error ? <Text allowFontScaling accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

export function CodeInput({ value, onChangeText, onSubmitEditing, editable = true, label = "Код подтверждения", error = false }: {
  value: string; onChangeText: (value: string) => void; onSubmitEditing?: () => void;
  editable?: boolean; label?: string; error?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.codeContainer}>
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.codeRow}>
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={[styles.codeBox, focused && index === Math.min(value.length, 5) && styles.codeBoxFocused,
            error && styles.fieldError, !editable && styles.disabled]}>
            <Text style={styles.codeDigit}>{value[index] ?? ""}</Text>
          </View>
        ))}
      </View>
      <TextInput accessibilityLabel={label} value={value} onChangeText={text => onChangeText(text.replace(/\D/g, "").slice(0, 6))}
        editable={editable} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
        maxLength={6} caretHidden selectionColor="transparent" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing} style={styles.codeInput} />
    </View>
  );
}

export function InfoBanner({ title, text, icon = "shield-check-outline" }: {
  title: string; text: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap; danger?: boolean;
}) {
  return <View style={styles.info}>
    <MaterialCommunityIcons name={icon} size={24} color={authColors.ink} />
    <View style={styles.infoCopy}>
      <Text allowFontScaling style={styles.infoTitle}>{title}</Text>
      <Text allowFontScaling style={styles.infoText}>{text}</Text>
    </View>
  </View>;
}

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: authColors.background },
  keyboard: { flex: 1 }, scroll: { flexGrow: 1 },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 18 },
  contentCompact: { paddingTop: 14, paddingBottom: 12 },
  header: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 28 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 31, height: 31, borderRadius: 10, backgroundColor: authColors.ink, alignItems: "center", justifyContent: "center" },
  wordmark: { fontSize: 24, fontWeight: "600", letterSpacing: -1.1, color: authColors.ink },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: authColors.line,
    backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  progress: { flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 26 },
  stepText: { color: authColors.muted, fontSize: 11, lineHeight: 16 },
  steps: { flex: 1, flexDirection: "row", gap: 6 },
  step: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "#E1E1E1" },
  stepActive: { backgroundColor: authColors.ink },
  heading: { marginBottom: 26 },
  title: { fontSize: 36, lineHeight: 43, fontWeight: "500", letterSpacing: -1.5, color: authColors.ink },
  titleCompact: { fontSize: 30, lineHeight: 37, letterSpacing: -1.1 },
  subtitle: { color: authColors.muted, fontSize: 14, lineHeight: 22, marginTop: 10 },
  centered: { textAlign: "center" },
  primary: { minHeight: 58, borderRadius: 30, paddingVertical: 9, paddingLeft: 23, paddingRight: 10,
    backgroundColor: authColors.ink, flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "space-between",
    shadowColor: "#000000", shadowOpacity: 0.09, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  primaryText: { color: "#FFFFFF", fontSize: 15, lineHeight: 21, fontWeight: "500", flexShrink: 1 },
  buttonArrow: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: "#444444", alignItems: "center", justifyContent: "center" },
  primaryPressed: { backgroundColor: "#2A2A2A" },
  secondary: { minHeight: 54, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 28, borderWidth: 1, borderColor: authColors.line,
    backgroundColor: "#FFFFFF", flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: authColors.ink, fontSize: 14, lineHeight: 20, fontWeight: "500", textAlign: "center", flexShrink: 1 },
  link: { minHeight: 44, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  linkText: { color: authColors.ink, fontSize: 13, lineHeight: 19, fontWeight: "500", textAlign: "center", flexShrink: 1 },
  pressed: { opacity: 0.55 }, surfacePressed: { backgroundColor: "#ECECEC" }, disabled: { opacity: 0.45, shadowOpacity: 0 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: authColors.ink, marginBottom: 7 },
  field: { minHeight: 54, borderWidth: 1, borderColor: authColors.line, borderRadius: 17, paddingLeft: 16, paddingRight: 6,
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF" },
  fieldFocused: { borderColor: authColors.ink }, fieldError: { borderColor: authColors.ink, backgroundColor: "#EFEFEF" },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 12, paddingRight: 10, fontSize: 15, color: authColors.ink,
    ...Platform.select({ web: { outlineWidth: 0 } }) },
  eyeButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  error: { color: authColors.danger, fontSize: 12, lineHeight: 18, marginTop: 8 },
  codeContainer: { position: "relative" },
  codeRow: { flexDirection: "row", gap: 7 },
  codeBox: { flex: 1, minWidth: 0, height: 62, borderWidth: 1, borderColor: authColors.line, borderRadius: 14,
    backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center" },
  codeBoxFocused: { borderColor: authColors.ink },
  codeDigit: { color: authColors.ink, fontSize: 25, fontWeight: "500", fontVariant: ["tabular-nums"] },
  codeInput: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: "transparent",
    ...Platform.select({ web: { outlineWidth: 0 } }) },
  info: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1, borderColor: authColors.line,
    borderRadius: 20, backgroundColor: "#FFFFFF", padding: 18 },
  infoCopy: { flex: 1, minWidth: 0 },
  infoTitle: { color: authColors.ink, fontSize: 14, lineHeight: 20, fontWeight: "600", marginBottom: 6 },
  infoText: { color: authColors.muted, fontSize: 13, lineHeight: 20 },
  surface: { borderWidth: 1, borderColor: authColors.line, borderRadius: 22, backgroundColor: "#FFFFFF" }
});
