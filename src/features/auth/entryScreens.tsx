import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View
} from "react-native";
import type { VerificationResult } from "./authApi";
import { AuthMode } from "./types";
import { AuthScaffold, AuthHeader, CodeInput, PageTitle, PrimaryButton, LinkButton, authColors } from "./onboardingUi";

export { WelcomeScreen } from "./WelcomeScreen";
export { AuthChoiceScreen } from "./AuthChoiceScreen";

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
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(32);
  const [verificationError, setVerificationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [localCode, setLocalCode] = useState(developmentCode);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  const resend = async () => {
    if (seconds > 0 || resending || loading) return;
    setResending(true);
    setVerificationError("");
    try {
      const result = await onResend();
      setLocalCode(result.verificationCode);
      setCode("");
      setSeconds(32);
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
    <AuthScaffold>
      <AuthHeader onBack={onBack} />
      <PageTitle title="Подтвердите почту" subtitle="Введите шестизначный код, который мы отправили на ваш email." />
      <Text allowFontScaling selectable style={styles.email}>{email}</Text>

      <View style={styles.codeSection}>
        <Text allowFontScaling style={styles.codeLabel}>Код из письма</Text>
        <CodeInput value={code} onChangeText={value => { setCode(value); if (verificationError) setVerificationError(""); }}
          editable={!loading && !resending} error={!!verificationError} onSubmitEditing={confirm} />
        {localCode ? <Text style={styles.developmentCode}>Локальный код: {localCode}</Text> : null}
        {verificationError ? <Text allowFontScaling accessibilityRole="alert" style={styles.error}>{verificationError}</Text> : null}
      </View>

      <PrimaryButton title={loading ? "Проверяем…" : mode === "signUp" ? "Подтвердить" : "Войти"}
        disabled={code.length !== 6 || loading || resending} onPress={confirm} />
      <View style={styles.resend}>
        <Text allowFontScaling accessibilityLiveRegion="polite" style={styles.timer}>
          {seconds > 0 ? 'Повторная отправка через 00:' + seconds.toString().padStart(2, "0") : "Не получили письмо?"}
        </Text>
        <LinkButton title={resending ? "Отправляем…" : "Отправить код снова"} icon="refresh-outline"
          disabled={seconds > 0 || resending || loading} onPress={resend} />
      </View>
      <View style={styles.footer}>
        <LinkButton title="Изменить email" icon="mail-outline" disabled={loading || resending} onPress={onChangeEmail} />
      </View>
    </AuthScaffold>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const styles = StyleSheet.create({
  email: { color: authColors.ink, fontSize: 14, lineHeight: 21, padding: 15, borderRadius: 17,
    backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: authColors.line },
  codeSection: { marginTop: 30, marginBottom: 26 },
  codeLabel: { color: authColors.ink, fontSize: 12, fontWeight: "500", marginBottom: 10 },
  developmentCode: { color: authColors.muted, fontSize: 12, marginTop: 10 },
  error: { color: authColors.danger, fontSize: 13, lineHeight: 19, marginTop: 12 },
  resend: { marginTop: 22 },
  timer: { color: authColors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  footer: { marginTop: "auto", paddingTop: 24 }
});
