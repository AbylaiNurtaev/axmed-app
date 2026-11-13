import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { WelcomeMotion } from "./WelcomeMotion";

const colors = {
  background: "#F7F7F7",
  ink: "#111111",
  muted: "#6B6B6B",
  accent: "#505050"
};

export function WelcomeScreen({ onCreateAccount, onSignIn }: {
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  const { height, width } = useWindowDimensions();
  const compact = height < 740;
  const narrow = width < 375;
  const animationHeight = height < 650 ? 168 : compact ? 224 : 292;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.content, compact && styles.contentCompact]}>
          <View style={styles.header}>
            <View accessible accessibilityLabel="AxMed" style={styles.brand}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.brandMark}>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path d="M12 4.5V19.5M4.5 12H19.5" stroke={colors.background} strokeWidth={3.2} strokeLinecap="round" />
                </Svg>
              </View>
              <Text style={styles.wordmark}>AxMed</Text>
            </View>
            <Text allowFontScaling style={styles.headerLabel}>ЛИЧНОЕ{"\n"}ЗДОРОВЬЕ</Text>
          </View>

          <View style={[styles.hero, compact && styles.heroCompact]}>
            <WelcomeMotion height={animationHeight} />
          </View>

          <View style={styles.introduction}>
            <View accessible accessibilityLabel="Тело, сон, активность" style={styles.eyebrow}>
              <View style={styles.eyebrowLine} />
              <Text allowFontScaling style={styles.eyebrowText}>ТЕЛО · СОН · АКТИВНОСТЬ</Text>
            </View>
            <Text allowFontScaling accessibilityRole="header" style={[styles.title, narrow && styles.titleNarrow]}>
              Здоровье{"\n"}
              <Text style={[styles.titleAccent, narrow && styles.titleAccentNarrow]}>в балансе.</Text>
            </Text>
            <Text allowFontScaling style={styles.subtitle}>
              Всё о вашем теле в одном месте.{"\n"}Понимайте себя. Заботьтесь о главном.
            </Text>
          </View>

          <View style={[styles.actions, compact && styles.actionsCompact]}>
            <Pressable accessibilityRole="button" onPress={onCreateAccount}
              style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}>
              <Text allowFontScaling style={styles.createButtonText}>Создать аккаунт</Text>
              <View style={styles.buttonArrow}>
                <Ionicons name="arrow-forward" size={20} color={colors.background} />
              </View>
            </Pressable>
            <View style={styles.signInRow}>
              <Text allowFontScaling style={styles.signInHint}>Уже с нами?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Войти в аккаунт" onPress={onSignIn}
                style={({ pressed }) => [styles.signInButton, pressed && styles.linkPressed]}>
                <Text allowFontScaling style={styles.signInText}>Войти</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: "center" },
  content: { flexGrow: 1, width: "100%", maxWidth: 480, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 10 },
  contentCompact: { paddingTop: 14, paddingBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 20 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 31, height: 31, borderRadius: 10, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  wordmark: { fontSize: 24, fontWeight: "600", color: colors.ink, letterSpacing: -1.1 },
  headerLabel: { fontSize: 8, lineHeight: 12, fontWeight: "500", color: colors.muted, letterSpacing: 1.7, textAlign: "right" },
  hero: { marginTop: 22, marginBottom: 12, alignItems: "center", flexGrow: 1, justifyContent: "center" },
  heroCompact: { marginTop: 10, marginBottom: 8 },
  introduction: { paddingTop: 2 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 17 },
  eyebrowLine: { width: 20, height: 1, backgroundColor: colors.accent },
  eyebrowText: { fontSize: 9, fontWeight: "500", letterSpacing: 2, color: "#5B5B5B" },
  title: { color: colors.ink, fontSize: 51, lineHeight: 55, fontWeight: "500", letterSpacing: -2.5 },
  titleNarrow: { fontSize: 45, lineHeight: 50, letterSpacing: -2.2 },
  titleAccent: { fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
    fontStyle: "italic", fontWeight: "400", fontSize: 54, color: colors.accent, letterSpacing: -2.7 },
  titleAccentNarrow: { fontSize: 48, letterSpacing: -2.4 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 18, letterSpacing: -0.12 },
  actions: { paddingTop: 30 },
  actionsCompact: { paddingTop: 23 },
  createButton: { minHeight: 62, paddingLeft: 24, paddingRight: 12, paddingVertical: 9, borderRadius: 32,
    backgroundColor: colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
    shadowColor: "#000000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 3 },
  createButtonPressed: { backgroundColor: "#2A2A2A", transform: [{ scale: 0.985 }] },
  createButtonText: { color: colors.background, fontSize: 15, fontWeight: "500", letterSpacing: 0.1, flexShrink: 1 },
  buttonArrow: { width: 39, height: 39, borderRadius: 20, borderWidth: 1, borderColor: "#444444", alignItems: "center", justifyContent: "center" },
  signInRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 9, flexWrap: "wrap" },
  signInHint: { fontSize: 13, color: colors.muted },
  signInButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  signInText: { fontSize: 13, color: colors.ink, fontWeight: "600" },
  linkPressed: { opacity: 0.55 }
});
