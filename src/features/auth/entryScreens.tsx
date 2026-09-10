import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType
} from "expo-apple-authentication";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { SocialAuthError } from "./socialAuth";
import type { SocialProvider } from "./socialAuth";
import { AuthMode } from "./types";
import {
  AuthScaffold,
  AxMedLogo,
  FormField,
  LinkButton,
  PrimaryButton,
  SecondaryButton,
  Surface,
  authColors
} from "./ui";

export function WelcomeScreen({ onCreateAccount, onSignIn }: { onCreateAccount: () => void; onSignIn: () => void }) {
  const { height } = useWindowDimensions();
  const isCompact = height < 760;

  return (
    <AuthScaffold
      contentStyle={[styles.welcomeContent, isCompact && styles.welcomeContentCompact]}
      decorVariant="welcome"
    >
      <View style={styles.welcomeTop}>
        <AxMedLogo hero />
        <Text style={styles.welcomeTitle}>Добро пожаловать</Text>
        <Text style={styles.welcomeSubtitle}>
          AxMed помогает отслеживать важные показатели здоровья, понимать изменения и получать понятные рекомендации.
        </Text>
      </View>

      <HealthIllustration compact={isCompact} />

      <View style={styles.welcomeActions}>
        <PrimaryButton title="Создать аккаунт" onPress={onCreateAccount} variant="welcome" />
        <SecondaryButton title="Войти" onPress={onSignIn} variant="welcome" />
        <View style={styles.safetyLine}>
          <Ionicons name="lock-closed-outline" size={20} color={authColors.greenDark} />
          <Text style={styles.safetyText}>Безопасно. Конфиденциально. Для пользователей 18+</Text>
        </View>
      </View>
    </AuthScaffold>
  );
}

function HealthIllustration({ compact }: { compact: boolean }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.illustration, compact && styles.illustrationCompact]}>
      <View style={styles.illustrationGlow} />
      <View style={styles.shieldBubble}>
        <MaterialCommunityIcons name="shield-check-outline" size={55} color={authColors.green} />
      </View>
      <View style={styles.phone}>
        <View style={styles.phoneSpeaker} />
        <View style={styles.phonePulse}>
          <MaterialCommunityIcons name="heart-pulse" size={31} color={authColors.green} />
        </View>
        <View style={styles.phoneMetric}>
          <Text style={styles.phoneMetricValue}>120/80</Text>
          <Text style={styles.phoneMetricUnit}>мм рт. ст.</Text>
        </View>
        <View style={styles.phoneGraph}>
          <Svg width="100%" height="34" viewBox="0 0 104 34">
            <Path d="M2 23 C10 23 12 12 21 14 C29 16 31 8 39 9 C47 10 48 24 58 22 C67 20 69 14 77 17 C86 21 91 7 102 8" stroke={authColors.green} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </Svg>
        </View>
        <View style={styles.phoneMetricRow}>
          <Text style={styles.phoneMiniMetric}>98% SpO₂</Text>
          <Text style={styles.phoneMiniMetric}>♥ 72</Text>
        </View>
      </View>
      <View style={styles.chartBubble}>
        <View style={styles.chartHeaderLong} />
        <View style={styles.chartHeaderShort} />
        <View style={styles.chartBars}>
          <View style={[styles.chartBar, styles.chartBarOne]} />
          <View style={[styles.chartBar, styles.chartBarTwo]} />
          <View style={[styles.chartBar, styles.chartBarThree]} />
          <View style={[styles.chartBar, styles.chartBarFour]} />
        </View>
      </View>
      <View style={styles.heartBubble}>
        <MaterialCommunityIcons name="heart-pulse" size={62} color="#fff" />
      </View>
    </View>
  );
}

export function AuthChoiceScreen({
  initialMode,
  onBack,
  onContinueEmail,
  onSocialContinue
}: {
  initialMode: AuthMode;
  onBack: () => void;
  onContinueEmail: (email: string, mode: AuthMode) => void;
  onSocialContinue: (mode: AuthMode, provider: SocialProvider) => Promise<void>;
}) {
  const { height } = useWindowDimensions();
  const isCompact = height < 760;
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [socialError, setSocialError] = useState("");
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);

  const continueWithEmail = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Введите корректный email");
      return;
    }
    setError("");
    onContinueEmail(normalizedEmail, mode);
  };

  const isSignUp = mode === "signUp";

  const continueWithSocial = async (provider: SocialProvider) => {
    if (socialLoading) return;
    setSocialError("");
    setSocialLoading(provider);

    try {
      await onSocialContinue(mode, provider);
    } catch (socialAuthError) {
      if (socialAuthError instanceof SocialAuthError && socialAuthError.code === "cancelled") return;
      setSocialError(
        socialAuthError instanceof SocialAuthError
          ? socialAuthError.userMessage
          : `Не удалось войти с ${provider}. Попробуйте ещё раз.`
      );
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <AuthScaffold
      contentStyle={[styles.entryContent, isCompact && styles.entryContentCompact]}
      decorVariant="entry"
    >
      <View style={styles.entryLogo}><AxMedLogo compact /></View>

      <View style={styles.authTabs}>
        <Pressable onPress={() => { setMode("signUp"); setError(""); }} style={[styles.authTab, isSignUp && styles.authTabActive]}>
          <Text style={[styles.authTabText, isSignUp && styles.authTabTextActive]}>Регистрация</Text>
        </Pressable>
        <Pressable onPress={() => { setMode("signIn"); setError(""); }} style={[styles.authTab, !isSignUp && styles.authTabActive]}>
          <Text style={[styles.authTabText, !isSignUp && styles.authTabTextActive]}>Вход</Text>
        </Pressable>
      </View>

      <Text style={styles.authTitle}>Регистрация / Вход</Text>
      <Text style={styles.authSubtitle}>
        Выберите удобный способ, чтобы создать аккаунт или войти в AxMed.
      </Text>

      <Surface style={styles.emailCard}>
        <FormField
          autoCapitalize="none"
          autoComplete="email"
          error={error}
          icon="mail-outline"
          keyboardType="email-address"
          onChangeText={(value) => { setEmail(value); if (error) setError(""); }}
          onSubmitEditing={continueWithEmail}
          placeholder="Введите email"
          returnKeyType="go"
          value={email}
        />
        <PrimaryButton
          title={isSignUp ? "Продолжить с email" : "Получить код по email"}
          onPress={continueWithEmail}
        />
      </Surface>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>или</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.socialButtons}>
        <SocialButton
          provider="Google"
          title="Продолжить с Google"
          loading={socialLoading === "Google"}
          disabled={socialLoading !== null}
          onPress={() => continueWithSocial("Google")}
        />
        <SocialButton
          provider="Apple"
          title="Продолжить с Apple"
          loading={socialLoading === "Apple"}
          disabled={socialLoading !== null}
          onPress={() => continueWithSocial("Apple")}
        />
        {socialError ? <Text accessibilityRole="alert" style={styles.socialError}>{socialError}</Text> : null}
      </View>

      <Pressable style={styles.switchMode} onPress={() => setMode(isSignUp ? "signIn" : "signUp")}>
        <Text style={styles.switchModeMuted}>{isSignUp ? "Уже есть аккаунт?" : "Нет аккаунта?"} </Text>
        <Text style={styles.switchModeLink}>{isSignUp ? "Войти" : "Создать аккаунт"}</Text>
      </Pressable>

      <LinkButton title="Назад" onPress={onBack} />
      <View style={styles.secureFooter}>
        <MaterialCommunityIcons name="shield-lock-outline" size={27} color={authColors.greenDark} />
        <Text style={styles.secureFooterText}>Безопасный вход. Ваши данные защищены.</Text>
      </View>
    </AuthScaffold>
  );
}

function SocialButton({
  provider,
  title,
  loading,
  disabled,
  onPress
}: {
  provider: SocialProvider;
  title: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  if (provider === "Apple" && Platform.OS === "ios") {
    return (
      <View pointerEvents={disabled ? "none" : "auto"} style={[styles.appleButtonContainer, disabled && styles.buttonDisabled]}>
        <AppleAuthenticationButton
          buttonType={AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthenticationButtonStyle.WHITE_OUTLINE}
          cornerRadius={14}
          onPress={onPress}
          style={styles.appleButton}
        />
        {loading ? <View style={styles.appleLoading}><ActivityIndicator size="small" color="#111" /></View> : null}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled}
      style={({ pressed }) => [styles.socialButton, pressed && styles.buttonPressed, disabled && styles.buttonDisabled]}
      onPress={onPress}
    >
      {loading
        ? <ActivityIndicator size="small" color={authColors.greenDark} />
        : <Ionicons name={provider === "Google" ? "logo-google" : "logo-apple"} size={28} color={provider === "Google" ? "#4285F4" : "#111"} />}
      <Text style={styles.socialButtonText}>{title}</Text>
    </Pressable>
  );
}

export function VerificationScreen({
  email,
  mode,
  onBack,
  onChangeEmail,
  onConfirm
}: {
  email: string;
  mode: AuthMode;
  onBack: () => void;
  onChangeEmail: () => void;
  onConfirm: () => void;
}) {
  const { height } = useWindowDimensions();
  const isCompact = height < 760;
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(32);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  const resend = () => {
    if (seconds > 0) return;
    setCode("");
    setSeconds(32);
    Alert.alert("Код отправлен", `Новый код отправлен на ${maskEmail(email)}`);
    inputRef.current?.focus();
  };

  return (
    <AuthScaffold
      contentStyle={[styles.entryContent, isCompact && styles.entryContentCompact]}
      decorVariant="entry"
    >
      <View style={styles.entryLogo}><AxMedLogo compact /></View>

      <Text style={styles.verifyTitle}>Подтверждение email</Text>
      <Text style={styles.verifySubtitle}>
        Мы отправили одноразовый код для {mode === "signUp" ? "регистрации" : "входа"}
      </Text>
      <Text style={styles.maskedEmail}>{maskEmail(email)}</Text>

      <Surface style={styles.codeCard}>
        <Pressable accessibilityRole="button" accessibilityLabel="Введите шестизначный код" onPress={() => inputRef.current?.focus()} style={styles.codeBoxes}>
          {Array.from({ length: 6 }, (_, index) => (
            <View key={index} style={[styles.codeBox, index === code.length && code.length < 6 && styles.codeBoxActive]}>
              <Text style={styles.codeDigit}>{code[index] ?? ""}</Text>
            </View>
          ))}
          <TextInput
            ref={inputRef}
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
            style={styles.hiddenCodeInput}
            value={code}
          />
        </Pressable>
        <Text style={styles.codeHint}>Введите код из письма</Text>
        <View style={styles.codeSeparator} />
        <View style={styles.resendTimer}>
          <Ionicons name="time-outline" size={22} color={authColors.greenDark} />
          <Text style={styles.resendTimerText}>
            {seconds > 0 ? `Повторная отправка через 00:${seconds.toString().padStart(2, "0")}` : "Код можно отправить повторно"}
          </Text>
        </View>
      </Surface>

      <View style={styles.verifyActions}>
        <PrimaryButton title={mode === "signUp" ? "Подтвердить" : "Войти"} disabled={code.length !== 6} onPress={onConfirm} />
        <LinkButton title="Отправить код снова" icon="refresh-outline" onPress={resend} />
        <LinkButton title="Изменить email" icon="mail-outline" onPress={onChangeEmail} />
        <LinkButton title="Назад" onPress={onBack} />
      </View>

      <View style={styles.secureFooter}>
        <MaterialCommunityIcons name="shield-lock-outline" size={27} color={authColors.greenDark} />
        <Text style={styles.secureFooterText}>Безопасное подтверждение. Ваши данные защищены.</Text>
      </View>
    </AuthScaffold>
  );
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, Math.min(3, name.length));
  return `${visible}***@${domain}`;
}

const styles = StyleSheet.create({
  welcomeContent: { paddingHorizontal: 40, paddingTop: 104, paddingBottom: 64 },
  welcomeContentCompact: { paddingTop: 66, paddingBottom: 18 },
  welcomeTop: { alignItems: "center", marginHorizontal: -16 },
  welcomeTitle: { color: authColors.ink, fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -1, textAlign: "center", marginTop: 24 },
  welcomeSubtitle: { color: "#53617A", fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 12, maxWidth: 330, alignSelf: "center" },
  illustration: { height: 240, marginTop: 10, marginBottom: 14, alignItems: "center", justifyContent: "center" },
  illustrationCompact: { height: 190, marginTop: 6, marginBottom: 4, transform: [{ scale: 0.86 }] },
  illustrationGlow: { position: "absolute", width: 280, height: 194, borderRadius: 140, backgroundColor: "rgba(222,246,239,0.56)" },
  phone: { width: 132, height: 222, borderRadius: 26, borderWidth: 6, borderColor: "#D7EDE7", backgroundColor: "#F9FFFD", padding: 13, transform: [{ rotate: "5deg" }], shadowColor: authColors.greenDark, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 4 },
  phoneSpeaker: { width: 32, height: 4, borderRadius: 3, backgroundColor: "#C8E6DE", alignSelf: "center", marginBottom: 10 },
  phonePulse: { height: 42, borderRadius: 11, backgroundColor: authColors.soft, alignItems: "center", justifyContent: "center" },
  phoneMetric: { marginTop: 9, borderRadius: 10, backgroundColor: "#fff", paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: "#E4F2EE" },
  phoneMetricValue: { color: authColors.ink, fontSize: 16, fontWeight: "800" },
  phoneMetricUnit: { color: authColors.greenDark, fontSize: 10 },
  phoneGraph: { height: 36, marginTop: 7, borderRadius: 9, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E4F2EE", paddingHorizontal: 5, justifyContent: "center" },
  phoneMetricRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  phoneMiniMetric: { color: authColors.greenDark, fontSize: 9, fontWeight: "700" },
  shieldBubble: { position: "absolute", zIndex: 2, left: 4, top: 102, width: 82, height: 82, borderRadius: 41, backgroundColor: "#E8F8F3", alignItems: "center", justifyContent: "center", shadowColor: authColors.greenDark, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 },
  chartBubble: { position: "absolute", right: 0, top: 42, width: 104, height: 100, borderRadius: 18, backgroundColor: "#fff", paddingHorizontal: 13, paddingTop: 13, shadowColor: authColors.greenDark, shadowOpacity: 0.1, shadowRadius: 16, elevation: 3 },
  chartHeaderLong: { width: 46, height: 5, borderRadius: 3, backgroundColor: "#E8F6F2" },
  chartHeaderShort: { width: 32, height: 4, borderRadius: 2, backgroundColor: "#EFF9F6", marginTop: 5 },
  chartBars: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingTop: 6, paddingBottom: 10 },
  chartBar: { width: 11, borderRadius: 6, backgroundColor: authColors.greenLight },
  chartBarOne: { height: 25 },
  chartBarTwo: { height: 34 },
  chartBarThree: { height: 29 },
  chartBarFour: { height: 45 },
  heartBubble: { position: "absolute", right: 30, bottom: 5, width: 78, height: 78, borderRadius: 39, backgroundColor: authColors.green, alignItems: "center", justifyContent: "center", shadowColor: authColors.greenDark, shadowOpacity: 0.12, shadowRadius: 13, elevation: 3 },
  welcomeActions: { gap: 10, marginTop: "auto" },
  safetyLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 9 },
  safetyText: { color: "#53617A", fontSize: 11, lineHeight: 16, flexShrink: 1, textAlign: "center" },
  entryContent: { paddingHorizontal: 32, paddingTop: 44, paddingBottom: 28 },
  entryContentCompact: { paddingTop: 22, paddingBottom: 18 },
  entryLogo: { minHeight: 122, alignItems: "center", justifyContent: "flex-start" },
  authTabs: { width: "84%", maxWidth: 310, alignSelf: "center", height: 44, flexDirection: "row", borderWidth: 1.5, borderColor: authColors.green, borderRadius: 23, marginBottom: 23, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.88)" },
  authTab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  authTabActive: { backgroundColor: authColors.soft, borderWidth: 1, borderColor: authColors.green },
  authTabText: { color: authColors.muted, fontSize: 15, fontWeight: "600" },
  authTabTextActive: { color: authColors.greenDark, fontWeight: "700" },
  authTitle: { color: authColors.ink, fontSize: 30, lineHeight: 37, fontWeight: "800", textAlign: "center", letterSpacing: -0.6 },
  authSubtitle: { color: authColors.text, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8, marginBottom: 22, paddingHorizontal: 8 },
  emailCard: { gap: 14, padding: 16 },
  divider: { flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 20, paddingHorizontal: 34 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#9BDCCB" },
  dividerText: { color: authColors.greenDark, fontSize: 17, fontWeight: "600" },
  socialButtons: { gap: 11 },
  socialButton: { minHeight: 54, borderRadius: 14, borderWidth: 1.5, borderColor: authColors.green, backgroundColor: "rgba(255,255,255,0.92)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 18 },
  socialButtonText: { color: authColors.ink, fontSize: 16, fontWeight: "700" },
  appleButtonContainer: { width: "100%", height: 54 },
  appleButton: { width: "100%", height: 54 },
  appleLoading: { position: "absolute", inset: 0, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  socialError: { color: "#B42318", fontSize: 12, lineHeight: 17, textAlign: "center", paddingHorizontal: 8 },
  switchMode: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 18, minHeight: 34 },
  switchModeMuted: { color: authColors.text, fontSize: 14 },
  switchModeLink: { color: authColors.greenDark, fontSize: 14, fontWeight: "700" },
  secureFooter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 8 },
  secureFooterText: { color: authColors.text, fontSize: 12, flexShrink: 1, textAlign: "center" },
  buttonPressed: { opacity: 0.76 },
  buttonDisabled: { opacity: 0.62 },
  verifyTitle: { color: authColors.ink, fontSize: 30, lineHeight: 37, fontWeight: "800", textAlign: "center" },
  verifySubtitle: { color: authColors.text, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10, paddingHorizontal: 18 },
  maskedEmail: { color: authColors.greenDark, fontSize: 17, fontWeight: "700", textAlign: "center", marginTop: 12, marginBottom: 21 },
  codeCard: { padding: 18 },
  codeBoxes: { flexDirection: "row", gap: 9, justifyContent: "center", position: "relative" },
  codeBox: { flex: 1, maxWidth: 58, aspectRatio: 0.76, borderRadius: 13, borderWidth: 1.5, borderColor: "#B8E7DB", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  codeBoxActive: { borderColor: authColors.green, borderWidth: 2 },
  codeDigit: { color: authColors.greenDark, fontSize: 28, fontWeight: "700" },
  hiddenCodeInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  codeHint: { color: authColors.greenDark, fontSize: 15, textAlign: "center", marginTop: 16 },
  codeSeparator: { height: 1, backgroundColor: "#D1EDE6", marginVertical: 15 },
  resendTimer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  resendTimerText: { color: authColors.greenDark, fontSize: 14, textAlign: "center" },
  verifyActions: { gap: 2, marginTop: 20 }
});
