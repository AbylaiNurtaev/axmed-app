import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle
} from "react-native";
import Svg, { Path } from "react-native-svg";

export const authColors = {
  green: "#00A87E",
  greenDark: "#008F70",
  greenLight: "#20C99A",
  ink: "#071225",
  text: "#3E485B",
  muted: "#727C8E",
  line: "#DFE5E9",
  soft: "#EDF9F5",
  white: "#FFFFFF",
  danger: "#E5484D",
  dangerSoft: "#FFF0F0"
} as const;

export function AuthScaffold({
  children,
  contentStyle,
  decorVariant = "default",
  noScroll = false
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  decorVariant?: "default" | "welcome";
  noScroll?: boolean;
}) {
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <BackgroundDecor variant={decorVariant} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboard}
        >
          {noScroll ? (
            content
          ) : (
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {content}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

function BackgroundDecor({ variant }: { variant: "default" | "welcome" }) {
  const isWelcome = variant === "welcome";

  return (
    <>
      <View style={isWelcome ? styles.welcomeRingOuter : styles.ringOne} />
      <View style={isWelcome ? styles.welcomeRingMiddle : styles.ringTwo} />
      {isWelcome ? <View style={styles.welcomeRingInner} /> : null}
      <View style={isWelcome ? styles.welcomePlusOne : styles.plusOne}><Text style={styles.plus}>+</Text></View>
      <View style={isWelcome ? styles.welcomePlusTwo : styles.plusTwo}><Text style={styles.plus}>+</Text></View>
      {isWelcome ? <View style={styles.welcomePlusThree}><Text style={styles.plusSmall}>+</Text></View> : null}
      <Svg width="100%" height={isWelcome ? 138 : 180} viewBox="0 0 430 180" style={styles.wave} preserveAspectRatio="none">
        <Path d="M0 72 C96 112 136 160 224 128 C310 96 346 42 430 74 L430 180 L0 180 Z" fill={isWelcome ? "#EFFAF7" : "#EAF8F4"} />
        <Path d="M0 122 C86 86 142 178 232 158 C320 138 356 93 430 110 L430 180 L0 180 Z" fill={isWelcome ? "#DDF5EE" : "#D7F2EA"} />
      </Svg>
    </>
  );
}

export function AxMedLogo({ compact = false, hero = false }: { compact?: boolean; hero?: boolean }) {
  const iconSize = compact ? 56 : hero ? 60 : 72;
  return (
    <View style={[styles.logoWrap, compact && styles.logoWrapCompact, hero && styles.logoWrapHero]}>
      <View style={[styles.logoMark, { width: iconSize, height: iconSize }]}> 
        <View style={[styles.crossHorizontal, compact && styles.crossHorizontalCompact, hero && styles.crossHorizontalHero]} />
        <View style={[styles.crossVertical, compact && styles.crossVerticalCompact, hero && styles.crossVerticalHero]} />
        <Svg width={iconSize} height={iconSize} viewBox="0 0 72 72" style={styles.logoPulse}>
          <Path d="M8 37 H25 L31 23 L39 49 L45 34 L52 37 H64" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <Text style={[styles.logoText, compact && styles.logoTextCompact, hero && styles.logoTextHero]}>AxMed</Text>
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Назад" hitSlop={12} onPress={onPress} style={styles.backButton}>
      <Ionicons name="chevron-back" size={32} color={authColors.ink} />
    </Pressable>
  );
}

export function StepHeader({ current, total = 4, onBack }: { current: number; total?: number; onBack: () => void }) {
  return (
    <View style={styles.stepHeader}>
      <BackButton onPress={onBack} />
      <View style={styles.steps}>
        {Array.from({ length: total }, (_, index) => (
          <View key={index} style={[styles.step, index < current && styles.stepActive]} />
        ))}
      </View>
      <Text style={styles.stepText}>Шаг {current} из {total}</Text>
    </View>
  );
}

export function PageTitle({ title, subtitle, centered = false }: { title: string; subtitle?: string; centered?: boolean }) {
  return (
    <View style={[styles.pageHeading, centered && styles.centered]}>
      <Text style={[styles.pageTitle, centered && styles.textCentered]}>{title}</Text>
      {!!subtitle && <Text style={[styles.pageSubtitle, centered && styles.textCentered]}>{subtitle}</Text>}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  icon,
  variant = "default"
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "default" | "welcome";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, variant === "welcome" && styles.welcomeButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      {!!icon && <Ionicons name={icon} size={24} color="#fff" />}
      <Text style={[styles.primaryButtonText, variant === "welcome" && styles.welcomeButtonText]}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  icon,
  darkText = false,
  variant = "default"
}: {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  darkText?: boolean;
  variant?: "default" | "welcome";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, variant === "welcome" && styles.welcomeButton, pressed && styles.pressed]}
    >
      {!!icon && <Ionicons name={icon} size={24} color={darkText ? authColors.ink : authColors.green} />}
      <Text style={[styles.secondaryButtonText, variant === "welcome" && styles.welcomeButtonText, darkText && styles.secondaryDark]}>{title}</Text>
    </Pressable>
  );
}

export function LinkButton({ title, onPress, icon }: { title: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkButton}>
      {!!icon && <Ionicons name={icon} size={22} color={authColors.green} />}
      <Text style={styles.linkButtonText}>{title}</Text>
    </Pressable>
  );
}

export function FormField({ icon, error, ...props }: TextInputProps & { icon: keyof typeof Ionicons.glyphMap; error?: string }) {
  return (
    <View>
      <View style={[styles.formField, !!error && styles.formFieldError]}>
        <Ionicons name={icon} size={25} color={error ? authColors.danger : authColors.greenDark} />
        <TextInput
          {...props}
          placeholderTextColor="#A6AEBA"
          style={[styles.input, props.style]}
        />
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

export function InfoBanner({
  title,
  text,
  icon = "shield-check-outline",
  danger = false
}: {
  title: string;
  text: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  danger?: boolean;
}) {
  const color = danger ? authColors.danger : authColors.greenDark;
  return (
    <View style={[styles.infoBanner, danger && styles.infoBannerDanger]}>
      <MaterialCommunityIcons name={icon} size={34} color={color} />
      <View style={styles.infoCopy}>
        <Text style={[styles.infoTitle, { color }]}>{title}</Text>
        <Text style={styles.infoText}>{text}</Text>
      </View>
    </View>
  );
}

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: authColors.white },
  screen: { flex: 1, backgroundColor: authColors.white, overflow: "hidden" },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 54 },
  ringOne: { position: "absolute", width: 420, height: 420, borderRadius: 210, borderWidth: 1, borderColor: "#E9F7F3", top: -230, alignSelf: "center" },
  ringTwo: { position: "absolute", width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: "#ECF8F5", top: -160, alignSelf: "center" },
  welcomeRingOuter: { position: "absolute", width: 520, height: 520, borderRadius: 260, borderWidth: 1, borderColor: "#E9F7F3", top: 22, alignSelf: "center" },
  welcomeRingMiddle: { position: "absolute", width: 380, height: 380, borderRadius: 190, borderWidth: 1, borderColor: "#EDF9F6", top: 76, alignSelf: "center" },
  welcomeRingInner: { position: "absolute", width: 252, height: 252, borderRadius: 126, borderWidth: 1, borderColor: "#F1FAF8", top: 116, alignSelf: "center" },
  plusOne: { position: "absolute", top: 70, left: 30 },
  plusTwo: { position: "absolute", top: 160, right: 34 },
  welcomePlusOne: { position: "absolute", top: 72, left: 66 },
  welcomePlusTwo: { position: "absolute", top: 126, right: 48 },
  welcomePlusThree: { position: "absolute", top: "48%", right: 54 },
  plus: { color: "#C4F0E4", fontSize: 28, fontWeight: "700" },
  plusSmall: { color: "#C7F0E5", fontSize: 22, fontWeight: "700" },
  wave: { position: "absolute", left: 0, right: 0, bottom: 0 },
  logoWrap: { alignItems: "center", gap: 10 },
  logoWrapCompact: { gap: 6 },
  logoWrapHero: { gap: 6 },
  logoMark: { alignItems: "center", justifyContent: "center" },
  crossHorizontal: { position: "absolute", width: 68, height: 32, borderRadius: 12, backgroundColor: authColors.greenLight },
  crossVertical: { position: "absolute", width: 32, height: 68, borderRadius: 12, backgroundColor: authColors.green },
  crossHorizontalCompact: { width: 54, height: 26, borderRadius: 10 },
  crossVerticalCompact: { width: 26, height: 54, borderRadius: 10 },
  crossHorizontalHero: { width: 58, height: 28, borderRadius: 10 },
  crossVerticalHero: { width: 28, height: 58, borderRadius: 10 },
  logoPulse: { position: "absolute" },
  logoText: { color: authColors.ink, fontSize: 45, lineHeight: 50, fontWeight: "800", letterSpacing: -1.5 },
  logoTextCompact: { fontSize: 35, lineHeight: 39 },
  logoTextHero: { fontSize: 38, lineHeight: 40, letterSpacing: -1.2 },
  backButton: { width: 38, height: 44, justifyContent: "center", alignItems: "flex-start" },
  stepHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  steps: { flex: 1, flexDirection: "row", gap: 7 },
  step: { flex: 1, height: 5, borderRadius: 4, backgroundColor: "#E7E9EC" },
  stepActive: { backgroundColor: authColors.greenDark },
  stepText: { color: authColors.text, fontSize: 14, minWidth: 82, textAlign: "right" },
  pageHeading: { marginBottom: 28 },
  centered: { alignItems: "center" },
  pageTitle: { color: authColors.ink, fontSize: 34, lineHeight: 41, fontWeight: "800", letterSpacing: -0.8 },
  pageSubtitle: { color: authColors.text, fontSize: 17, lineHeight: 26, marginTop: 10 },
  textCentered: { textAlign: "center" },
  primaryButton: { minHeight: 58, borderRadius: 15, paddingHorizontal: 20, backgroundColor: authColors.green, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", shadowColor: authColors.greenDark, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  primaryButtonText: { color: authColors.white, fontSize: 19, fontWeight: "700", textAlign: "center" },
  secondaryButton: { minHeight: 58, borderRadius: 15, borderWidth: 1.5, borderColor: authColors.green, paddingHorizontal: 18, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.88)" },
  secondaryButtonText: { color: authColors.green, fontSize: 18, fontWeight: "700", textAlign: "center" },
  welcomeButton: { minHeight: 52, borderRadius: 14 },
  welcomeButtonText: { fontSize: 17 },
  secondaryDark: { color: authColors.ink },
  linkButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10 },
  linkButtonText: { color: authColors.greenDark, fontSize: 17, fontWeight: "600", textAlign: "center" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.42, shadowOpacity: 0 },
  formField: { height: 60, borderWidth: 1.5, borderColor: authColors.green, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, backgroundColor: "rgba(255,255,255,0.9)" },
  formFieldError: { borderColor: authColors.danger },
  input: { flex: 1, height: "100%", color: authColors.ink, fontSize: 18 },
  errorText: { color: authColors.danger, fontSize: 13, marginTop: 7, marginLeft: 4 },
  infoBanner: { borderRadius: 17, backgroundColor: authColors.soft, padding: 18, flexDirection: "row", alignItems: "flex-start", gap: 14 },
  infoBannerDanger: { backgroundColor: authColors.dangerSoft },
  infoCopy: { flex: 1 },
  infoTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700", marginBottom: 5 },
  infoText: { color: authColors.text, fontSize: 15, lineHeight: 22 },
  surface: { borderWidth: 1, borderColor: authColors.line, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.94)", shadowColor: authColors.ink, shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 }
});
