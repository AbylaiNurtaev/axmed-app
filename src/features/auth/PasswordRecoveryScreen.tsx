import { useAuthStyles, type AuthColors } from "./authTheme";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AuthApiError, completePasswordReset, requestPasswordReset, verifyPasswordResetCode } from "./authApi";
import { AuthScaffold, AuthHeader, CodeInput, FormField, PageTitle, PrimaryButton } from "./onboardingUi";
import { countdownLabel, useSecondsRemaining } from "./useSecondsRemaining";

type Stage = "email" | "code" | "password";
const emailPattern = /^(?=.{3,254}$)(?=.{1,64}@)[a-z0-9]+(?:[._%+-][a-z0-9]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function PasswordRecoveryScreen({ initialEmail, onBack, onComplete }: {
  initialEmail: string; onBack: () => void; onComplete: (email: string) => void;
}) {
  const { styles } = useAuthStyles(createStyles);
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [verifyUntil, setVerifyUntil] = useState(0);
  const [codeExhausted, setCodeExhausted] = useState(false);
  const [grantExpiresAt, setGrantExpiresAt] = useState(0);
  const grant = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const normalizedEmail = email.trim().toLowerCase();
  const resendSeconds = useSecondsRemaining(cooldowns[normalizedEmail] ?? 0);
  const verifySeconds = useSecondsRemaining(verifyUntil);
  const grantSeconds = useSecondsRemaining(grantExpiresAt);
  useEffect(() => () => { request.current?.abort(); grant.current = null; }, []);

  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(""); setInfo("");
    try { await action(controller.signal); }
    catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "Не удалось выполнить запрос. Попробуйте снова.");
      if (failure instanceof AuthApiError) {
        if (failure.code === "RESET_CODE_ATTEMPTS_EXCEEDED") setCodeExhausted(true);
        if (failure.code === "INVALID_RESET_TOKEN") { grant.current = null; setGrantExpiresAt(0); }
        if (failure.retryAfterSeconds) {
          const until = Date.now() + failure.retryAfterSeconds * 1000;
          if (stage === "password" || (stage === "code" && failure.code === "TOO_MANY_REQUESTS")) setVerifyUntil(until);
          else setCooldowns(current => ({ ...current, [normalizedEmail]: until }));
        }
      }
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  }
  function sendCode() {
    if (resendSeconds > 0) return;
    if (!emailPattern.test(normalizedEmail)) { setError("Введите корректный email."); return; }
    void perform(async signal => {
      const result = await requestPasswordReset(normalizedEmail, signal);
      if (signal.aborted) return;
      setEmail(normalizedEmail); setCode(""); setCodeExhausted(false); setVerifyUntil(0);
      grant.current = null; setGrantExpiresAt(0); setStage("code"); setInfo(result.message);
      setCooldowns(current => ({ ...current, [normalizedEmail]: Date.now() + result.resendAfter * 1000 }));
    });
  }
  function verifyCode() {
    if (code.length !== 6 || codeExhausted || verifySeconds > 0) return;
    void perform(async signal => {
      const result = await verifyPasswordResetCode(normalizedEmail, code, signal);
      if (signal.aborted) return;
      grant.current = result.resetToken; setGrantExpiresAt(Date.now() + result.expiresIn * 1000);
      setCode(""); setStage("password");
    });
  }
  function savePassword() {
    if (!grant.current || grantSeconds === 0 || verifySeconds > 0) return;
    if (password.length < 8 || password.length > 128 || !/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
      setError("Пароль должен содержать от 8 до 128 символов, хотя бы одну букву и одну цифру."); return;
    }
    if (password !== confirmation) { setError("Пароли не совпадают."); return; }
    const token = grant.current;
    void perform(async signal => {
      await completePasswordReset(normalizedEmail, token, password, signal);
      if (signal.aborted) return;
      grant.current = null; setPassword(""); setConfirmation(""); onComplete(normalizedEmail);
    });
  }
  const title = stage === "email" ? "Забыли пароль?" : stage === "code" ? "Введите код" : "Новый пароль";
  const subtitle = stage === "email" ? "Укажите email вашего аккаунта. Мы отправим код для восстановления."
    : stage === "code" ? "Введите шестизначный код из письма. Он действует 10 минут."
    : "Придумайте новый пароль. После сохранения войдите в аккаунт заново.";
  return <AuthScaffold>
    <AuthHeader onBack={onBack} />
    <PageTitle title={title} subtitle={subtitle} />
    <View style={styles.card}>
      {stage === "email" ? <>
        <FormField label="Email" icon="mail-outline" accessibilityLabel="Email для восстановления" value={email} autoCapitalize="none"
          autoComplete="email" keyboardType="email-address" editable={!busy} placeholder="Введите email"
          onChangeText={value => { setEmail(value); setError(""); }} onSubmitEditing={sendCode} returnKeyType="send" />
        <PrimaryButton title={busy ? "Отправляем…" : resendSeconds > 0 ? `Повторить через ${countdownLabel(resendSeconds)}` : "Получить код"}
          disabled={busy || resendSeconds > 0} onPress={sendCode} variant="entry" />
      </> : stage === "code" ? <>
        <Text allowFontScaling selectable style={styles.email}>{email}</Text>
        <CodeInput label="Шестизначный код восстановления" value={code}
          onChangeText={value => { setCode(value); setError(""); }} editable={!busy && !codeExhausted}
          error={!!error} onSubmitEditing={verifyCode} />
        <PrimaryButton title={busy ? "Проверяем…" : verifySeconds > 0 ? `Повторить через ${countdownLabel(verifySeconds)}` : "Подтвердить код"}
          disabled={busy || code.length !== 6 || codeExhausted || verifySeconds > 0} onPress={verifyCode} variant="entry" />
        <Pressable accessibilityRole="button" disabled={busy || resendSeconds > 0} onPress={sendCode} style={styles.link}>
          <Text style={styles.linkText}>{resendSeconds > 0 ? `Отправить снова через ${countdownLabel(resendSeconds)}` : "Отправить код ещё раз"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setStage("email"); setError(""); setInfo(""); }} style={styles.link}>
          <Text style={styles.linkText}>Изменить email</Text>
        </Pressable>
      </> : <>
        <FormField label="Новый пароль" icon="lock-closed-outline" accessibilityLabel="Новый пароль" value={password} autoCapitalize="none" autoComplete="new-password"
          maxLength={128} secureTextEntry={!visible} editable={!busy} placeholder="Новый пароль"
          onChangeText={value => { setPassword(value); setError(""); }} rightIcon={visible ? "eye-off-outline" : "eye-outline"}
          rightIconAccessibilityLabel={visible ? "Скрыть новый пароль" : "Показать новый пароль"} onRightIconPress={() => setVisible(value => !value)} />
        <FormField label="Повтор пароля" icon="lock-closed-outline" accessibilityLabel="Повтор нового пароля" value={confirmation} autoCapitalize="none" autoComplete="new-password"
          maxLength={128} secureTextEntry={!confirmationVisible} editable={!busy} placeholder="Повторите пароль"
          onChangeText={value => { setConfirmation(value); setError(""); }} rightIcon={confirmationVisible ? "eye-off-outline" : "eye-outline"}
          rightIconAccessibilityLabel={confirmationVisible ? "Скрыть повтор пароля" : "Показать повтор пароля"}
          onRightIconPress={() => setConfirmationVisible(value => !value)} onSubmitEditing={savePassword} returnKeyType="done" />
        <Text style={styles.help}>От 8 до 128 символов, хотя бы одна буква и одна цифра.</Text>
        <PrimaryButton title={busy ? "Сохраняем…" : verifySeconds > 0 ? `Повторить через ${countdownLabel(verifySeconds)}` : "Сохранить пароль"}
          disabled={busy || grantSeconds === 0 || verifySeconds > 0} onPress={savePassword} variant="entry" />
        {grantSeconds === 0 ? <><Text style={styles.error}>Время восстановления истекло. Запросите новый код.</Text>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.link} onPress={() => { setStage("code"); setError(""); }}>
            <Text style={styles.linkText}>Запросить новый код</Text></Pressable></> : null}
      </>}
      {info ? <Text accessibilityLiveRegion="polite" style={styles.help}>{info}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  </AuthScaffold>;
}

const createStyles = (authColors: AuthColors) => StyleSheet.create({
  card: { gap: 18 },
  email: { color: authColors.ink, fontSize: 14, lineHeight: 21, padding: 14, borderRadius: 16,
    backgroundColor: authColors.surface, borderWidth: 1, borderColor: authColors.line },
  help: { color: authColors.muted, fontSize: 12, lineHeight: 19 },
  error: { color: authColors.danger, fontSize: 13, lineHeight: 20, padding: 14,
    borderRadius: 16, backgroundColor: authColors.soft },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  linkText: { color: authColors.ink, fontSize: 13, lineHeight: 19, fontWeight: "500", textAlign: "center" }
});
