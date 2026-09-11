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
  Image,
  ImageSourcePropType,
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
import type { VerificationResult } from "./authApi";
import { AuthMode } from "./types";
import {
  AuthScaffold,
  AxMedLogo,
  BackButton,
  FormField,
  LinkButton,
  PrimaryButton,
  SecondaryButton,
  Surface,
  authColors
} from "./ui";

const healthHero = require("../../../assets/auth-health-hero.png") as ImageSourcePropType;
const emailPattern = /^(?=.{3,254}$)(?=.{1,64}@)[a-z0-9]+(?:[._%+-][a-z0-9]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function WelcomeScreen({ onCreateAccount, onSignIn }: { onCreateAccount: () => void; onSignIn: () => void }) {
  const { height } = useWindowDimensions();
  const isCompact = height < 650;

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
      </View>
    </AuthScaffold>
  );
}

function HealthIllustration({ compact }: { compact: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.illustration, compact && styles.illustrationCompact]}
    >
      <Image resizeMode="contain" source={healthHero} style={styles.healthHeroImage} />
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
  onContinueEmail: (email: string, mode: AuthMode, password: string) => Promise<void> | void;
  onSocialContinue: (mode: AuthMode, provider: SocialProvider) => Promise<void>;
}) {
  const { height } = useWindowDimensions();
  const isCompact = height < 650;
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [socialError, setSocialError] = useState("");
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);

  const continueWithEmail = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) {
      setError("Введите корректный email");
      return;
    }
    if (password.length === 0) {
      setPasswordError("Введите пароль");
      return;
    }
    if (isSignUp && (password.length < 8 || !/\p{L}/u.test(password) || !/\p{N}/u.test(password))) {
      setPasswordError("Минимум 8 символов, одна буква и одна цифра");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setConfirmPasswordError("Пароли не совпадают");
      return;
    }
    setError("");
    setPasswordError("");
    setConfirmPasswordError("");
    setSubmitError("");
    setEmailLoading(true);
    try {
      await onContinueEmail(normalizedEmail, mode, password);
    } catch (submitFailure) {
      setSubmitError(getErrorMessage(
        submitFailure,
        isSignUp
          ? "Не удалось создать аккаунт. Попробуйте снова."
          : "Неверный email или пароль. Проверьте данные и попробуйте снова."
      ));
    } finally {
      setEmailLoading(false);
    }
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
      <View style={styles.entryLogo}>
        <View style={styles.entryBack}><BackButton onPress={onBack} /></View>
        <AxMedLogo compact />
      </View>

      <Text style={styles.authTitle}>{isSignUp ? "Регистрация" : "Вход"}</Text>

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
        <FormField
          autoCapitalize="none"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          error={passwordError}
          icon="lock-closed-outline"
          onChangeText={(value) => {
            setPassword(value);
            if (passwordError) setPasswordError("");
            if (submitError) setSubmitError("");
          }}
          onSubmitEditing={isSignUp ? undefined : continueWithEmail}
          placeholder={isSignUp ? "Придумайте пароль" : "Введите пароль"}
          returnKeyType={isSignUp ? "next" : "go"}
          rightIcon={passwordVisible ? "eye-off-outline" : "eye-outline"}
          rightIconAccessibilityLabel={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
          onRightIconPress={() => setPasswordVisible((visible) => !visible)}
          secureTextEntry={!passwordVisible}
          value={password}
        />
        {isSignUp ? (
          <FormField
            autoCapitalize="none"
            autoComplete="new-password"
            error={confirmPasswordError}
            icon="shield-checkmark-outline"
            onChangeText={(value) => {
              setConfirmPassword(value);
              if (confirmPasswordError) setConfirmPasswordError("");
              if (submitError) setSubmitError("");
            }}
            onSubmitEditing={continueWithEmail}
            placeholder="Повторите пароль"
            returnKeyType="go"
            rightIcon={confirmPasswordVisible ? "eye-off-outline" : "eye-outline"}
            rightIconAccessibilityLabel={confirmPasswordVisible ? "Скрыть повтор пароля" : "Показать повтор пароля"}
            onRightIconPress={() => setConfirmPasswordVisible((visible) => !visible)}
            secureTextEntry={!confirmPasswordVisible}
            value={confirmPassword}
          />
        ) : null}
        <PrimaryButton
          title={emailLoading ? (isSignUp ? "Создаём…" : "Входим…") : isSignUp ? "Продолжить с Email" : "Войти"}
          disabled={emailLoading}
          onPress={continueWithEmail}
          variant="entry"
        />
        {submitError ? <Text accessibilityRole="alert" style={styles.submitError}>{submitError}</Text> : null}
      </Surface>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>или</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.socialButtons}>
        <SocialButton
          provider="Google"
          title={isSignUp ? "Продолжить с Google" : "Войти с Google"}
          loading={socialLoading === "Google"}
          disabled={socialLoading !== null}
          onPress={() => continueWithSocial("Google")}
        />
        <SocialButton
          provider="Apple"
          title={isSignUp ? "Продолжить с Apple" : "Войти с Apple"}
          loading={socialLoading === "Apple"}
          disabled={socialLoading !== null}
          onPress={() => continueWithSocial("Apple")}
        />
        {socialError ? <Text accessibilityRole="alert" style={styles.socialError}>{socialError}</Text> : null}
      </View>

      <Pressable
        style={styles.switchMode}
        onPress={() => {
          setMode(isSignUp ? "signIn" : "signUp");
          setError("");
          setPasswordError("");
          setConfirmPasswordError("");
          setPasswordVisible(false);
          setConfirmPasswordVisible(false);
          setSubmitError("");
        }}
      >
        <Text style={styles.switchModeMuted}>{isSignUp ? "Уже есть аккаунт?" : "Нет аккаунта?"} </Text>
        <Text style={styles.switchModeLink}>{isSignUp ? "Войти" : "Зарегистрироваться"}</Text>
      </Pressable>

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
        : provider === "Google"
          ? <GoogleMark />
          : <Ionicons name="logo-apple" size={28} color="#111" />}
      <Text style={styles.socialButtonText}>{title}</Text>
    </Pressable>
  );
}

function GoogleMark() {
  return (
    <Svg accessibilityLabel="Google" width={27} height={27} viewBox="0 0 24 24">
      <Path d="M21.6 12.227c0-.709-.064-1.391-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.995 3.018v2.509h3.232c1.891-1.741 2.981-4.305 2.981-7.35Z" fill="#4285F4" />
      <Path d="M12 22c2.7 0 4.968-.895 6.618-2.423l-3.232-2.509c-.895.6-2.041.955-3.386.955-2.605 0-4.809-1.759-5.595-4.123H3.064v2.591A9.997 9.997 0 0 0 12 22Z" fill="#34A853" />
      <Path d="M6.405 13.9A6.018 6.018 0 0 1 6.091 12c0-.659.114-1.3.314-1.9V7.509H3.064A9.997 9.997 0 0 0 2 12c0 1.614.386 3.141 1.064 4.491L6.405 13.9Z" fill="#FBBC05" />
      <Path d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.964 2.995 14.695 2 12 2a9.997 9.997 0 0 0-8.936 5.509L6.405 10.1C7.191 7.736 9.395 5.977 12 5.977Z" fill="#EA4335" />
    </Svg>
  );
}

export function VerificationScreen({
  email,
  mode,
  developmentCode,
  onBack,
  onChangeEmail,
  onConfirm,
  onResend
}: {
  email: string;
  mode: AuthMode;
  developmentCode?: string;
  onBack: () => void;
  onChangeEmail: () => void;
  onConfirm: (code: string) => Promise<void>;
  onResend: () => Promise<VerificationResult>;
}) {
  const { height } = useWindowDimensions();
  const isCompact = height < 650;
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(32);
  const [verificationError, setVerificationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [localCode, setLocalCode] = useState(developmentCode);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  const resend = async () => {
    if (seconds > 0) return;
    setResending(true);
    setVerificationError("");
    try {
      const result = await onResend();
      setLocalCode(result.verificationCode);
      setCode("");
      setSeconds(32);
      Alert.alert("Код отправлен", `Новый код отправлен на ${maskEmail(email)}`);
      inputRef.current?.focus();
    } catch (resendFailure) {
      setVerificationError(getErrorMessage(resendFailure, "Не удалось отправить новый код."));
    } finally {
      setResending(false);
    }
  };

  const confirm = async () => {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setVerificationError("");
    try {
      await onConfirm(code);
    } catch (confirmationFailure) {
      setVerificationError(getErrorMessage(confirmationFailure, "Не удалось подтвердить код."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScaffold
      contentStyle={[styles.entryContent, isCompact && styles.entryContentCompact]}
      decorVariant="entry"
    >
      <View style={styles.entryLogo}>
        <View style={styles.entryBack}><BackButton onPress={onBack} /></View>
        <AxMedLogo compact />
      </View>

      <Text style={styles.verifyTitle}>Подтверждение Email</Text>
      <Text style={styles.verifySubtitle}>
        Мы отправили одноразовый код для входа или регистрации
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
            onChangeText={(value) => {
              setCode(value.replace(/\D/g, ""));
              if (verificationError) setVerificationError("");
            }}
            style={styles.hiddenCodeInput}
            value={code}
          />
        </Pressable>
        <Text style={styles.codeHint}>Введите код из письма</Text>
        {localCode ? <Text style={styles.developmentCode}>Локальный код: {localCode}</Text> : null}
        {verificationError ? <Text accessibilityRole="alert" style={styles.submitError}>{verificationError}</Text> : null}
        <View style={styles.codeSeparator} />
        <View style={styles.resendTimer}>
          <Ionicons name="time-outline" size={22} color={authColors.greenDark} />
          <Text style={styles.resendTimerText}>
            {seconds > 0 ? `Повторная отправка через 00:${seconds.toString().padStart(2, "0")}` : "Код можно отправить повторно"}
          </Text>
        </View>
      </Surface>

      <View style={styles.verifyActions}>
        <PrimaryButton title={loading ? "Проверяем…" : mode === "signUp" ? "Подтвердить" : "Войти"} disabled={code.length !== 6 || loading} onPress={confirm} variant="entry" />
        <LinkButton title={resending ? "Отправляем…" : "Отправить код снова"} icon="refresh-outline" onPress={resend} />
        <LinkButton title="Изменить email" icon="mail-outline" onPress={onChangeEmail} />
      </View>

      <View style={styles.secureFooter}>
        <MaterialCommunityIcons name="shield-lock-outline" size={27} color={authColors.greenDark} />
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const styles = StyleSheet.create({
  welcomeContent: { paddingHorizontal: 40, paddingTop: 86, paddingBottom: 84 },
  welcomeContentCompact: { paddingTop: 54, paddingBottom: 18 },
  welcomeTop: { alignItems: "center", marginHorizontal: -16 },
  welcomeTitle: { color: authColors.ink, fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -1, textAlign: "center", marginTop: 22 },
  welcomeSubtitle: { color: "#53617A", fontSize: 15, lineHeight: 21, textAlign: "center", marginTop: 11, maxWidth: 326, alignSelf: "center" },
  illustration: { height: 246, marginHorizontal: -31, marginTop: 6, marginBottom: -8, alignItems: "center", justifyContent: "center" },
  illustrationCompact: { height: 194, marginTop: 1, marginBottom: 2 },
  healthHeroImage: { width: "100%", height: "100%" },
  welcomeActions: { gap: 10, marginTop: "auto" },
  entryContent: { paddingHorizontal: 32, paddingTop: 62, paddingBottom: 22 },
  entryContentCompact: { paddingTop: 18, paddingBottom: 14 },
  entryLogo: { minHeight: 150, alignItems: "center", justifyContent: "flex-start" },
  entryBack: { position: "absolute", left: 0, top: 4, zIndex: 2 },
  authTitle: { color: authColors.ink, fontSize: 30, lineHeight: 37, fontWeight: "800", textAlign: "center", letterSpacing: -0.6 },
  emailCard: { gap: 10, padding: 12, marginTop: 20 },
  submitError: { color: "#B42318", fontSize: 12, lineHeight: 17, textAlign: "center", paddingHorizontal: 4 },
  divider: { flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 12, paddingHorizontal: 34 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#9BDCCB" },
  dividerText: { color: authColors.greenDark, fontSize: 17, fontWeight: "600" },
  socialButtons: { gap: 11 },
  socialButton: { minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderColor: authColors.green, backgroundColor: "rgba(255,255,255,0.92)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 18 },
  socialButtonText: { color: authColors.ink, fontSize: 16, fontWeight: "700" },
  appleButtonContainer: { width: "100%", height: 44 },
  appleButton: { width: "100%", height: 44 },
  appleLoading: { position: "absolute", inset: 0, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  socialError: { color: "#B42318", fontSize: 12, lineHeight: 17, textAlign: "center", paddingHorizontal: 8 },
  switchMode: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 10, minHeight: 26 },
  switchModeMuted: { color: authColors.text, fontSize: 14 },
  switchModeLink: { color: authColors.greenDark, fontSize: 14, fontWeight: "700" },
  secureFooter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 8 },
  buttonPressed: { opacity: 0.76 },
  buttonDisabled: { opacity: 0.62 },
  verifyTitle: { color: authColors.ink, fontSize: 30, lineHeight: 37, fontWeight: "800", textAlign: "center" },
  verifySubtitle: { color: authColors.text, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 4, paddingHorizontal: 18 },
  maskedEmail: { color: authColors.greenDark, fontSize: 17, fontWeight: "700", textAlign: "center", marginTop: 9, marginBottom: 11 },
  codeCard: { padding: 18 },
  codeBoxes: { flexDirection: "row", gap: 9, justifyContent: "center", position: "relative" },
  codeBox: { flex: 1, maxWidth: 58, aspectRatio: 0.82, borderRadius: 13, borderWidth: 1.5, borderColor: "#B8E7DB", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  codeBoxActive: { borderColor: authColors.green, borderWidth: 2 },
  codeDigit: { color: authColors.greenDark, fontSize: 28, fontWeight: "700" },
  hiddenCodeInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  codeHint: { color: authColors.greenDark, fontSize: 15, textAlign: "center", marginTop: 16 },
  developmentCode: { color: authColors.muted, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 6 },
  codeSeparator: { height: 1, backgroundColor: "#D1EDE6", marginVertical: 11 },
  resendTimer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  resendTimerText: { color: authColors.greenDark, fontSize: 14, textAlign: "center" },
  verifyActions: { gap: 2, marginTop: 20 }
});
