import { useAuthStyles, type AuthColors } from "./authTheme";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { WelcomeMotion } from "./WelcomeMotion";

export function WelcomeScreen({ onCreateAccount, onSignIn }: {
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  const { styles, dark } = useAuthStyles(createStyles);
  const { height, width } = useWindowDimensions();
  const compact = height < 740;
  const narrow = width < 375;
  const animationHeight = height < 650 ? 168 : compact ? 224 : 292;
  const handleSignIn = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSignIn();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={dark ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.content, compact && styles.contentCompact]}>
          <View style={styles.header}>
            <View accessible accessibilityLabel="AxMed" style={styles.brand}>
              <Text style={styles.wordmark}>AxMed</Text>
            </View>
          </View>

          <View style={[styles.hero, compact && styles.heroCompact]}>
            <WelcomeMotion height={animationHeight} />
          </View>

          <View style={styles.introduction}>
            <Text allowFontScaling accessibilityRole="header" style={[styles.title, narrow && styles.titleNarrow]}>
              Здоровье{"\n"}
              <Text style={[styles.titleAccent, narrow && styles.titleAccentNarrow]}>в балансе.</Text>
            </Text>
            <Text allowFontScaling style={styles.subtitle}>
              Всё о вашем теле в одном месте.{"\n"}Понимайте себя. Заботьтесь о главном.
            </Text>
          </View>

          <View style={[styles.actions, compact && styles.actionsCompact]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Войти в аккаунт" onPress={handleSignIn}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text allowFontScaling style={styles.primaryButtonText}>Войти</Text>
            </Pressable>
            <View style={styles.registerRow}>
              <Text allowFontScaling style={styles.registerHint}>Нет аккаунта?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Создать аккаунт" onPress={onCreateAccount}
                style={({ pressed }) => [styles.registerButton, pressed && styles.linkPressed]}>
                <Text allowFontScaling style={styles.registerText}>Создать</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AuthColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: "center" },
  content: { flexGrow: 1, width: "100%", maxWidth: 480, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 10 },
  contentCompact: { paddingTop: 14, paddingBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 20 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  wordmark: { fontSize: 24, fontWeight: "600", color: colors.ink, letterSpacing: -1.1 },
  hero: { marginTop: 22, marginBottom: 12, alignItems: "center", flexGrow: 1, justifyContent: "center" },
  heroCompact: { marginTop: 10, marginBottom: 8 },
  introduction: { paddingTop: 2 },
  title: { color: colors.ink, fontSize: 51, lineHeight: 55, fontWeight: "500", letterSpacing: -2.5, textAlign: "center" },
  titleNarrow: { fontSize: 45, lineHeight: 50, letterSpacing: -2.2 },
  titleAccent: { fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
    fontStyle: "italic", fontWeight: "400", fontSize: 54, color: colors.accent, letterSpacing: -2.7 },
  titleAccentNarrow: { fontSize: 48, letterSpacing: -2.4 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 18, letterSpacing: -0.12, textAlign: "center" },
  actions: { paddingTop: 30 },
  actionsCompact: { paddingTop: 23 },
  primaryButton: { minHeight: 62, paddingHorizontal: 24, paddingVertical: 9, borderRadius: 32,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
    shadowColor: "#000000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 3 },
  primaryButtonPressed: { backgroundColor: colors.greenPressed, transform: [{ scale: 0.985 }] },
  primaryButtonText: { color: colors.background, fontSize: 15, fontWeight: "500", letterSpacing: 0.1, flexShrink: 1, textAlign: "center" },
  registerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 9, flexWrap: "wrap" },
  registerHint: { fontSize: 13, color: colors.muted },
  registerButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  registerText: { fontSize: 13, color: colors.ink, fontWeight: "600" },
  linkPressed: { opacity: 0.55 }
});
