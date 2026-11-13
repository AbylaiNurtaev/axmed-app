import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

const colors = {
  background: "#F7F7F2",
  ink: "#202722",
  muted: "#6D736B",
  sage: "#637C69"
};

export function WelcomeScreen({ onCreateAccount, onSignIn }: {
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  const { height, width } = useWindowDimensions();
  const compact = height < 740;
  const narrow = width < 375;
  const sculptureHeight = height < 650 ? 168 : compact ? 224 : 292;

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
            <BalanceSculpture height={sculptureHeight} />
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

// A decorative continuous form: no measurements or implied health results.
function BalanceSculpture({ height }: { height: number }) {
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      pointerEvents="none" style={styles.sculpture}>
      <Svg width="100%" height={height} viewBox="0 0 360 310">
        <Defs>
          <RadialGradient id="balanceHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#DCE5D8" stopOpacity="0.65" />
            <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="balanceShadow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#5D705A" stopOpacity="0.19" />
            <Stop offset="0.55" stopColor="#7A8C72" stopOpacity="0.07" />
            <Stop offset="1" stopColor="#7A8C72" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="balanceSurface" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0.46" stopColor="#70876A" />
            <Stop offset="0.55" stopColor="#B6C5A9" />
            <Stop offset="0.7" stopColor="#F2F5E7" />
            <Stop offset="0.82" stopColor="#E1E8D6" />
            <Stop offset="0.94" stopColor="#A5B99B" />
            <Stop offset="1" stopColor="#6B8564" />
          </RadialGradient>
          <LinearGradient id="balanceLight" x1="12%" y1="12%" x2="87%" y2="95%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
            <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.45" />
            <Stop offset="0.6" stopColor="#B8C8AD" stopOpacity="0" />
            <Stop offset="1" stopColor="#38533D" stopOpacity="0.45" />
          </LinearGradient>
          <LinearGradient id="balanceSide" x1="0%" y1="0%" x2="95%" y2="95%">
            <Stop offset="0" stopColor="#D4DECE" />
            <Stop offset="0.42" stopColor="#B0C1A5" />
            <Stop offset="0.75" stopColor="#718A6B" />
            <Stop offset="1" stopColor="#48654B" />
          </LinearGradient>
          <LinearGradient id="balanceInner" x1="5%" y1="10%" x2="88%" y2="92%">
            <Stop offset="0" stopColor="#597253" />
            <Stop offset="0.4" stopColor="#9BB18F" />
            <Stop offset="0.8" stopColor="#E3EADA" />
            <Stop offset="1" stopColor="#F8FAF0" />
          </LinearGradient>
          <LinearGradient id="balanceRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#FAFFF3" stopOpacity="0.05" />
          </LinearGradient>
        </Defs>

        <Ellipse cx="183" cy="148" rx="172" ry="147" fill="url(#balanceHalo)" />
        <Ellipse cx="182" cy="287" rx="114" ry="19" fill="url(#balanceShadow)" />

        <G rotation="-29" origin="180,150">
          {/* The back edge, inner wall and front face give the ring its depth. */}
          <Path d="M185 24 C250 24 290 77 290 151 C290 225 250 280 185 280 C120 280 80 225 80 151 C80 77 120 24 185 24 Z M185 87 C155 87 139 113 139 151 C139 189 155 215 185 215 C215 215 231 189 231 151 C231 113 215 87 185 87 Z"
            fill="url(#balanceSide)" fillRule="evenodd" />
          <Path d="M175 80 C211 80 231 110 231 151 C231 192 211 220 175 220 C139 220 120 192 120 151 C120 110 139 80 175 80 Z M185 88 C155 88 139 114 139 151 C139 189 155 214 185 214 C215 214 231 189 231 151 C231 114 215 88 185 88 Z"
            fill="url(#balanceInner)" fillRule="evenodd" />
          <Path d="M175 17 C240 17 280 70 280 144 C280 218 240 273 175 273 C110 273 70 218 70 144 C70 70 110 17 175 17 Z M175 80 C139 80 120 107 120 144 C120 182 139 209 175 209 C211 209 231 182 231 144 C231 107 211 80 175 80 Z"
            fill="url(#balanceSurface)" fillRule="evenodd" />
          <Path d="M175 17 C240 17 280 70 280 144 C280 218 240 273 175 273 C110 273 70 218 70 144 C70 70 110 17 175 17 Z M175 80 C139 80 120 107 120 144 C120 182 139 209 175 209 C211 209 231 182 231 144 C231 107 211 80 175 80 Z"
            fill="url(#balanceLight)" fillRule="evenodd" />
          <Path d="M175 18 C239 18 279 71 279 144 C279 217 239 272 175 272 C111 272 71 217 71 144 C71 71 111 18 175 18 Z"
            fill="none" stroke="url(#balanceRim)" strokeWidth="1.2" />
          <Path d="M175 80 C139 80 120 107 120 144 C120 182 139 209 175 209 C211 209 231 182 231 144 C231 107 211 80 175 80 Z"
            fill="none" stroke="url(#balanceRim)" strokeWidth="0.8" />
        </G>

        <G rotation="-17" origin="180,156">
          <Path d="M40 176 C14 161 17 132 62 117 C84 110 115 105 144 104" fill="none" stroke="#ACB9A5" strokeOpacity="0.45" strokeWidth="0.8" />
          <Path d="M269 128 C351 155 342 198 262 203 C186 208 84 199 40 176" fill="none" stroke="#859C7E" strokeOpacity="0.6" strokeWidth="0.8" />
          <Circle cx="291" cy="200" r="4" fill="#748B6D" />
          <Circle cx="291" cy="200" r="1.2" fill="#E6EDD9" />
        </G>
      </Svg>
    </View>
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
  sculpture: { width: "100%", maxWidth: 360 },
  introduction: { paddingTop: 2 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 17 },
  eyebrowLine: { width: 20, height: 1, backgroundColor: colors.sage },
  eyebrowText: { fontSize: 9, fontWeight: "500", letterSpacing: 2, color: "#5D7262" },
  title: { color: colors.ink, fontSize: 51, lineHeight: 55, fontWeight: "500", letterSpacing: -2.5 },
  titleNarrow: { fontSize: 45, lineHeight: 50, letterSpacing: -2.2 },
  titleAccent: { fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
    fontStyle: "italic", fontWeight: "400", fontSize: 54, color: colors.sage, letterSpacing: -2.7 },
  titleAccentNarrow: { fontSize: 48, letterSpacing: -2.4 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 18, letterSpacing: -0.12 },
  actions: { paddingTop: 30 },
  actionsCompact: { paddingTop: 23 },
  createButton: { minHeight: 62, paddingLeft: 24, paddingRight: 12, paddingVertical: 9, borderRadius: 32,
    backgroundColor: colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
    shadowColor: "#243128", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 3 },
  createButtonPressed: { backgroundColor: "#344337", transform: [{ scale: 0.985 }] },
  createButtonText: { color: colors.background, fontSize: 15, fontWeight: "500", letterSpacing: 0.1, flexShrink: 1 },
  buttonArrow: { width: 39, height: 39, borderRadius: 20, borderWidth: 1, borderColor: "#485049", alignItems: "center", justifyContent: "center" },
  signInRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 9, flexWrap: "wrap" },
  signInHint: { fontSize: 13, color: colors.muted },
  signInButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  signInText: { fontSize: 13, color: colors.ink, fontWeight: "600" },
  linkPressed: { opacity: 0.55 }
});
