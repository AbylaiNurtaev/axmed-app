import { useAuthStyles, type AuthColors } from "./authTheme";
import { Ionicons } from "@expo/vector-icons";
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType
} from "expo-apple-authentication";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView,
  StyleSheet, Text, TextInput, useWindowDimensions, View
} from "react-native";
import type { TextInputProps } from "react-native";
import { AuthApiError } from "./authApi";
import { SocialAuthError } from "./socialAuth";
import type { SocialProvider } from "./socialAuth";
import type { AuthMode } from "./types";
import { countdownLabel, useSecondsRemaining } from "./useSecondsRemaining";

const emailPattern = /^(?=.{3,254}$)(?=.{1,64}@)[a-z0-9]+(?:[._%+-][a-z0-9]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function AuthChoiceScreen({
  mode,
  onModeChange,
  initialEmail = "",
  notice,
  onForgotPassword,
  onBack,
  onContinueEmail,
  onSocialContinue
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  initialEmail?: string;
  notice?: string;
  onForgotPassword: (email: string) => void;
  onBack: () => void;
  onContinueEmail: (email: string, mode: AuthMode, password: string) => Promise<void> | void;
  onSocialContinue: (mode: AuthMode, provider: SocialProvider) => Promise<void>;
}) {
  const { styles, colors, dark } = useAuthStyles(createStyles);
  const { height, width } = useWindowDimensions();
  const isCompact = height < 740;
  const narrow = width < 375;
  const [email, setEmail] = useState(initialEmail);
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
  const [loginPauses, setLoginPauses] = useState<Record<string, number>>({});
  const pendingEmail = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  const confirmationInput = useRef<TextInput>(null);
  const busy = emailLoading || socialLoading !== null;
  const pauseSeconds = useSecondsRemaining(loginPauses[email.trim().toLowerCase()] ?? 0);

  useEffect(() => {
    setError("");
    setPasswordError("");
    setConfirmPasswordError("");
    setPasswordVisible(false);
    setConfirmPasswordVisible(false);
    setSubmitError("");
    setSocialError("");
  }, [mode]);

  const showExistingAccount = () => {
    const title = "Аккаунт уже существует";
    const message = "Этот аккаунт уже зарегистрирован в AxMed. Войдите в существующий аккаунт.";
    if (Platform.OS === "web") {
      if (globalThis.confirm(`${title}\n\n${message}\n\nПерейти ко входу?`)) onModeChange("signIn");
    } else {
      Alert.alert(title, message, [
        { text: "Отмена", style: "cancel" },
        { text: "Войти", onPress: () => onModeChange("signIn") }
      ]);
    }
  };

  const continueWithEmail = async () => {
    if (pendingEmail.current || (mode === "signIn" && pauseSeconds > 0)) return;
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
    pendingEmail.current = true;
    setEmailLoading(true);
    try {
      await onContinueEmail(normalizedEmail, mode, password);
    } catch (submitFailure) {
      if (isSignUp && submitFailure instanceof AuthApiError && submitFailure.code === "ACCOUNT_EXISTS") {
        showExistingAccount();
        return;
      }
      if (mode === "signIn" && submitFailure instanceof AuthApiError && submitFailure.retryAfterSeconds) {
        setLoginPauses(current => ({ ...current, [normalizedEmail]: Date.now() + submitFailure.retryAfterSeconds! * 1000 }));
        setSubmitError("");
        return;
      }
      setSubmitError(getErrorMessage(
        submitFailure,
        isSignUp
          ? "Не удалось создать аккаунт. Попробуйте снова."
          : "Неверный email или пароль. Проверьте данные и попробуйте снова."
      ));
    } finally {
      pendingEmail.current = false;
      setEmailLoading(false);
    }
  };

  const isSignUp = mode === "signUp";
  const submitTitle = emailLoading ? (isSignUp ? "Создаём…" : "Входим…") : isSignUp ? "Создать аккаунт"
    : pauseSeconds > 0 ? `Повторить через ${countdownLabel(pauseSeconds)}` : "Войти";

  const continueWithSocial = async (provider: SocialProvider) => {
    if (socialLoading) return;
    setSocialError("");
    setSocialLoading(provider);

    try {
      await onSocialContinue(mode, provider);
    } catch (socialAuthError) {
      if (socialAuthError instanceof SocialAuthError && socialAuthError.code === "cancelled") return;
      if (mode === "signUp" && socialAuthError instanceof AuthApiError && socialAuthError.code === "ACCOUNT_EXISTS") {
        showExistingAccount();
        return;
      }
      if (socialAuthError instanceof AuthApiError && socialAuthError.code === "ACCOUNT_NOT_FOUND") {
        const title = "Аккаунт не найден";
        const message = `В AxMed нет аккаунта, связанного с выбранным аккаунтом ${provider}. Сначала зарегистрируйтесь.`;
        if (Platform.OS === "web") globalThis.alert(`${title}\n\n${message}`);
        else Alert.alert(title, message, [{ text: "Понятно" }]);
        return;
      }
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
    <SafeAreaView style={styles.safe}>
      <StatusBar style={dark ? "light" : "dark"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <View style={[styles.content, isCompact && styles.contentCompact]}>
            <View style={styles.header}>
              <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={onBack}
                style={({ pressed }) => [styles.backButton, pressed && styles.surfacePressed]}>
                <Ionicons name="arrow-back" size={21} color={colors.ink} />
              </Pressable>
              <View accessible accessibilityLabel="AxMed" style={styles.brand}>
                <Text style={styles.wordmark}>AxMed</Text>
              </View>
            </View>

            <View style={[styles.introduction, isCompact && styles.introductionCompact]}>
              <Text allowFontScaling accessibilityRole="header" style={[styles.title, narrow && styles.titleNarrow]}>
                {isSignUp ? "Регистрация" : "Вход"}
              </Text>
            </View>

            {notice && !isSignUp ? (
              <View accessibilityLiveRegion="polite" style={styles.notice}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.ink} />
                <Text allowFontScaling style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            <View style={styles.fields}>
              <EntryField label="Email" accessibilityLabel="Email"
                autoCapitalize="none" autoComplete="email" keyboardType="email-address"
                editable={!busy} error={error} placeholder="name@example.com"
                onChangeText={value => { setEmail(value); setSubmitError(""); if (error) setError(""); }}
                onSubmitEditing={() => passwordInput.current?.focus()}
                returnKeyType="next" submitBehavior="submit" value={email} />
              <EntryField inputRef={passwordInput} label="Пароль" accessibilityLabel="Пароль"
                autoCapitalize="none" autoComplete={isSignUp ? "new-password" : "current-password"}
                editable={!busy} error={passwordError}
                placeholder={isSignUp ? "Придумайте пароль" : "Введите пароль"}
                hint={isSignUp ? "Не менее 8 символов, буквы и цифры" : undefined}
                onChangeText={value => {
                  setPassword(value);
                  if (passwordError) setPasswordError("");
                  if (submitError) setSubmitError("");
                }}
                onSubmitEditing={isSignUp ? () => confirmationInput.current?.focus() : continueWithEmail}
                returnKeyType={isSignUp ? "next" : "go"}
                submitBehavior={isSignUp ? "submit" : "blurAndSubmit"}
                secureTextEntry={!passwordVisible} value={password}
                rightIcon={passwordVisible ? "eye-off-outline" : "eye-outline"}
                rightIconLabel={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                onRightIconPress={() => setPasswordVisible(visible => !visible)} />
              {isSignUp ? (
                <EntryField inputRef={confirmationInput} label="Повтор пароля" accessibilityLabel="Повтор пароля"
                  autoCapitalize="none" autoComplete="new-password" editable={!busy} error={confirmPasswordError}
                  placeholder="Введите пароль ещё раз"
                  onChangeText={value => {
                    setConfirmPassword(value);
                    if (confirmPasswordError) setConfirmPasswordError("");
                    if (submitError) setSubmitError("");
                  }}
                  onSubmitEditing={continueWithEmail} returnKeyType="go"
                  secureTextEntry={!confirmPasswordVisible} value={confirmPassword}
                  rightIcon={confirmPasswordVisible ? "eye-off-outline" : "eye-outline"}
                  rightIconLabel={confirmPasswordVisible ? "Скрыть повтор пароля" : "Показать повтор пароля"}
                  onRightIconPress={() => setConfirmPasswordVisible(visible => !visible)} />
              ) : null}
            </View>

            {!isSignUp ? (
              <Pressable accessibilityRole="button" onPress={() => onForgotPassword(email.trim().toLowerCase())}
                disabled={busy} style={({ pressed }) => [styles.forgotPassword, pressed && styles.linkPressed]}>
                <Text allowFontScaling style={styles.forgotPasswordText}>Забыли пароль?</Text>
              </Pressable>
            ) : null}

            <View style={[styles.submit, !isSignUp && styles.submitSignIn]}>
              <Pressable accessibilityRole="button" accessibilityLabel={submitTitle}
                accessibilityState={{ disabled: busy || (!isSignUp && pauseSeconds > 0), busy: emailLoading }}
                disabled={busy || (!isSignUp && pauseSeconds > 0)} onPress={continueWithEmail}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed,
                  (busy || (!isSignUp && pauseSeconds > 0)) && styles.disabled]}>
                <Text allowFontScaling style={styles.primaryButtonText}>
                  {submitTitle}
                </Text>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.buttonArrow}>
                  {emailLoading ? <ActivityIndicator size="small" color={colors.onAccent} />
                    : <Ionicons name="arrow-forward" size={20} color={colors.onAccent} />}
                </View>
              </Pressable>
              {submitError && (isSignUp || pauseSeconds === 0) ? <InlineError message={submitError} /> : null}
              {!isSignUp && pauseSeconds > 0 ? (
                <InlineError message={'Слишком много попыток. Повторите через ' + countdownLabel(pauseSeconds) + ' или восстановите пароль.'} />
              ) : null}
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text allowFontScaling style={styles.dividerText}>или</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtons}>
              <SocialButton provider="Google" title={isSignUp ? "Продолжить с Google" : "Войти с Google"}
                loading={socialLoading === "Google"} disabled={busy} onPress={() => continueWithSocial("Google")} />
              <SocialButton provider="Apple" title={isSignUp ? "Продолжить с Apple" : "Войти с Apple"}
                loading={socialLoading === "Apple"} disabled={busy} onPress={() => continueWithSocial("Apple")} />
              {socialError ? <InlineError message={socialError} /> : null}
            </View>

            <View style={styles.footer}>
              <Text allowFontScaling style={styles.footerHint}>{isSignUp ? "Уже есть аккаунт?" : "Нет аккаунта?"}</Text>
              <Pressable accessibilityRole="button" disabled={busy}
                style={({ pressed }) => [styles.switchMode, pressed && styles.linkPressed, busy && styles.disabled]}
                onPress={() => onModeChange(isSignUp ? "signIn" : "signUp")}>
                <Text allowFontScaling style={styles.switchModeText}>{isSignUp ? "Войти" : "Зарегистрироваться"}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EntryField({ label, inputRef, error, hint, rightIcon, rightIconLabel, onRightIconPress, ...props }: TextInputProps & {
  label: string;
  inputRef?: RefObject<TextInput | null>;
  error?: string;
  hint?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightIconLabel?: string;
  onRightIconPress?: () => void;
}) {
  const { styles, colors, dark } = useAuthStyles(createStyles);
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text allowFontScaling style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        <TextInput keyboardAppearance={dark ? "dark" : "light"} {...props} ref={inputRef} allowFontScaling autoCorrect={false}
          placeholderTextColor={colors.muted} selectionColor={colors.ink}
          onFocus={event => { setFocused(true); props.onFocus?.(event); }}
          onBlur={event => { setFocused(false); props.onBlur?.(event); }}
          style={[styles.input, props.style]} />
        {rightIcon ? (
          <Pressable accessibilityRole="button" accessibilityLabel={rightIconLabel} disabled={props.editable === false}
            onPress={onRightIconPress} style={({ pressed }) => [styles.eyeButton, pressed && styles.linkPressed]}>
            <Ionicons name={rightIcon} size={21} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <InlineError message={error} /> : hint ? <Text allowFontScaling style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function InlineError({ message }: { message: string }) {
  const { styles, colors } = useAuthStyles(createStyles);
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.ink} />
      <Text allowFontScaling style={styles.errorText}>{message}</Text>
    </View>
  );
}

function SocialButton({ provider, title, loading, disabled, onPress }: {
  provider: SocialProvider;
  title: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { styles, colors, dark } = useAuthStyles(createStyles);
  if (provider === "Apple" && Platform.OS === "ios") {
    return (
      <View pointerEvents={disabled ? "none" : "auto"} style={[styles.appleContainer, disabled && styles.disabled]}>
        <AppleAuthenticationButton buttonType={AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={dark ? AppleAuthenticationButtonStyle.BLACK : AppleAuthenticationButtonStyle.WHITE_OUTLINE} cornerRadius={27}
          onPress={onPress} style={styles.appleButton} />
        {loading ? <View style={styles.appleLoading}><ActivityIndicator size="small" color={colors.ink} /></View> : null}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ busy: loading, disabled }} disabled={disabled}
      style={({ pressed }) => [styles.socialButton, pressed && styles.surfacePressed, disabled && styles.disabled]}
      onPress={onPress}>
      {loading ? <ActivityIndicator size="small" color={colors.ink} />
        : <Ionicons name={provider === "Google" ? "logo-google" : "logo-apple"} size={21} color={colors.ink} />}
      <Text allowFontScaling style={styles.socialButtonText}>{title}</Text>
    </Pressable>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const createStyles = (colors: AuthColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center" },
  content: { width: "100%", maxWidth: 480, flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 10 },
  contentCompact: { paddingTop: 14, paddingBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  wordmark: { fontSize: 24, fontWeight: "600", color: colors.ink, letterSpacing: -1.1 },
  introduction: { marginTop: 28, marginBottom: 25 },
  introductionCompact: { marginTop: 22, marginBottom: 22 },
  title: { color: colors.ink, fontSize: 39, lineHeight: 47, fontWeight: "500", letterSpacing: -1.8 },
  titleNarrow: { fontSize: 33, lineHeight: 41, letterSpacing: -1.5 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 20 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.ink },
  fields: { gap: 14 },
  fieldLabel: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: "500", marginBottom: 7 },
  field: { minHeight: 54, borderRadius: 17, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 6 },
  fieldFocused: { borderColor: colors.ink },
  fieldError: { borderColor: colors.ink, backgroundColor: colors.soft },
  input: { minWidth: 0, flex: 1, minHeight: 52, paddingVertical: 12, paddingRight: 10,
    fontSize: 15, color: colors.ink, ...Platform.select({ web: { outlineWidth: 0 } }) },
  eyeButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  fieldHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  forgotPassword: { minHeight: 44, alignItems: "flex-end", justifyContent: "center", alignSelf: "flex-end" },
  forgotPasswordText: { color: colors.ink, fontSize: 13, fontWeight: "500" },
  submit: { marginTop: 23 },
  submitSignIn: { marginTop: 8 },
  primaryButton: { minHeight: 58, paddingLeft: 23, paddingRight: 10, paddingVertical: 9, borderRadius: 30,
    backgroundColor: colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
    shadowColor: "#000000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.09, shadowRadius: 10, elevation: 2 },
  primaryButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: "500", flexShrink: 1 },
  primaryPressed: { backgroundColor: colors.greenPressed },
  buttonArrow: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line,
    alignItems: "center", justifyContent: "center" },
  error: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 8 },
  errorText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17 },
  divider: { flexDirection: "row", alignItems: "center", gap: 15, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.soft },
  dividerText: { color: colors.muted, fontSize: 11 },
  socialButtons: { gap: 10 },
  socialButton: { minHeight: 52, borderRadius: 27, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingHorizontal: 18, paddingVertical: 10 },
  socialButtonText: { color: colors.ink, fontSize: 14, fontWeight: "500", flexShrink: 1 },
  appleContainer: { width: "100%", height: 52 },
  appleButton: { width: "100%", height: 52 },
  appleLoading: { position: "absolute", inset: 0, borderRadius: 27, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center" },
  footer: { marginTop: "auto", paddingTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" },
  footerHint: { fontSize: 13, color: colors.muted },
  switchMode: { minHeight: 44, justifyContent: "center", paddingHorizontal: 5 },
  switchModeText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  surfacePressed: { backgroundColor: colors.soft },
  linkPressed: { opacity: 0.55 },
  disabled: { opacity: 0.5, shadowOpacity: 0 }
});
