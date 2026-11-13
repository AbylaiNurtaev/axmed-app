import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

const colors = { background: "#F4F4F2", ink: "#171918", muted: "#6B706C", line: "#E9EBE8", accent: "#449D7C" };

export function WelcomeScreen({ onCreateAccount, onSignIn }: {
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  const { height, width } = useWindowDimensions();
  const compact = height < 740;
  const narrow = width < 360;

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.content, compact && styles.contentCompact]}>
        <View accessibilityLabel="AxMed" style={styles.brand}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.brandMark}>
            <Svg width={25} height={25} viewBox="0 0 28 28">
              <Path d="M14 6V22M6 14H22" stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" />
            </Svg>
          </View>
          <Text style={styles.wordmark}>AxMed</Text>
        </View>

        <View style={[styles.introduction, compact && styles.introductionCompact]}>
          <Text accessibilityRole="header" style={[styles.title, narrow && styles.titleNarrow]}>
            Ваше здоровье.{"\n"}Ясная картина.
          </Text>
          <Text style={styles.subtitle}>Тело, сон и активность — в одном месте. Чтобы лучше понимать себя каждый день.</Text>
        </View>

        <HealthPreview compact={compact} />

        <View style={[styles.actions, compact && styles.actionsCompact]}>
          <Pressable accessibilityRole="button" onPress={onCreateAccount}
            style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}>
            <Text style={styles.createButtonText}>Создать аккаунт</Text>
            <Ionicons name="arrow-forward" size={21} color="#FFFFFF" />
          </Pressable>
          <View style={styles.signInRow}>
            <Text style={styles.signInHint}>Уже есть аккаунт?</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Войти в аккаунт" onPress={onSignIn}
              style={({ pressed }) => [styles.signInButton, pressed && styles.pressed]}>
              <Text style={styles.signInText}>Войти</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

// An illustration of the product's focus, without fabricated health measurements.
function HealthPreview({ compact }: { compact: boolean }) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    pointerEvents="none" style={[styles.preview, compact && styles.previewCompact]}>
    <View style={styles.previewHeading}>
      <Text style={styles.previewEyebrow}>ЛИЧНАЯ ДИНАМИКА</Text>
      <View style={styles.statusDot} />
    </View>
    <Svg width="100%" height={compact ? 95 : 124} viewBox="0 0 300 124" preserveAspectRatio="none" style={styles.chart}>
      <Line x1="0" y1="22" x2="300" y2="22" stroke={colors.line} strokeDasharray="3 5" />
      <Line x1="0" y1="62" x2="300" y2="62" stroke={colors.line} strokeDasharray="3 5" />
      <Line x1="0" y1="102" x2="300" y2="102" stroke={colors.line} strokeDasharray="3 5" />
      <Path d="M3 99 C20 99 24 88 39 90 S60 108 77 90 S99 64 117 73 S141 84 158 62 S180 36 195 48 S217 63 234 35 S260 35 277 19"
        fill="none" stroke={colors.ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="277" cy="19" r="9" fill="#E7F0EA" />
      <Circle cx="277" cy="19" r="4" fill={colors.accent} />
    </Svg>
    <View style={styles.previewFooter}>
      <PreviewFeature icon="body-outline" label="Тело" />
      <View style={styles.separator} />
      <PreviewFeature icon="moon-outline" label="Сон" />
      <View style={styles.separator} />
      <PreviewFeature icon="pulse-outline" label="Активность" />
    </View>
  </View>;
}

function PreviewFeature({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return <View style={styles.feature}><Ionicons name={icon} size={17} color={colors.ink} /><Text style={styles.featureLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: "center" },
  content: { flexGrow: 1, width: "100%", maxWidth: 480, paddingHorizontal: 26, paddingTop: 28, paddingBottom: 18 },
  contentCompact: { paddingTop: 18, paddingBottom: 10 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 37, height: 37, borderRadius: 12, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  wordmark: { fontSize: 25, fontWeight: "600", color: colors.ink, letterSpacing: -1 },
  introduction: { marginTop: 66, marginBottom: 30 },
  introductionCompact: { marginTop: 32, marginBottom: 24 },
  title: { color: colors.ink, fontSize: 43, lineHeight: 49, fontWeight: "600", letterSpacing: -1.8 },
  titleNarrow: { fontSize: 35, lineHeight: 41, letterSpacing: -1.4 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 18, maxWidth: 325 },
  preview: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 17, borderRadius: 28, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E9EAE6" },
  previewCompact: { paddingTop: 16, paddingBottom: 14, borderRadius: 25 },
  previewHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  previewEyebrow: { fontSize: 10, fontWeight: "600", color: colors.muted, letterSpacing: 1.5 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  chart: { marginTop: 16, marginBottom: 17 },
  previewFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16, gap: 8 },
  feature: { flexDirection: "row", alignItems: "center", gap: 5 },
  featureLabel: { color: colors.ink, fontSize: 11, fontWeight: "500" },
  separator: { height: 13, width: 1, backgroundColor: colors.line },
  actions: { marginTop: "auto", paddingTop: 38 },
  actionsCompact: { paddingTop: 26 },
  createButton: { minHeight: 58, paddingHorizontal: 23, borderRadius: 32, backgroundColor: colors.ink,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  createButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
  signInRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 10, flexWrap: "wrap" },
  signInHint: { fontSize: 14, color: colors.muted },
  signInButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 5 },
  signInText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  pressed: { opacity: 0.7 }
});
