import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import type { VerificationResult } from "./authApi";
import { AuthMode } from "./types";
import {
  AuthScaffold,
  AxMedLogo,
  BackButton,
  LinkButton,
  PrimaryButton,
  Surface,
  authColors
} from "./ui";

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
      Alert.alert("Код отправлен", `Новый код отправлен на ${email}`);
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
      <Text selectable numberOfLines={2} style={styles.verificationEmail}>{email}</Text>

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

    </AuthScaffold>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const styles = StyleSheet.create({
  entryContent: { paddingHorizontal: 32, paddingTop: 62, paddingBottom: 22 },
  entryContentCompact: { paddingTop: 18, paddingBottom: 14 },
  entryLogo: { minHeight: 150, alignItems: "center", justifyContent: "flex-start" },
  entryBack: { position: "absolute", left: 0, top: 4, zIndex: 2 },
  submitError: { color: "#B42318", fontSize: 12, lineHeight: 17, textAlign: "center", paddingHorizontal: 4 },
  verifyTitle: { color: authColors.ink, fontSize: 30, lineHeight: 37, fontWeight: "800", textAlign: "center" },
  verifySubtitle: { color: authColors.text, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 4, paddingHorizontal: 18 },
  verificationEmail: { color: authColors.greenDark, fontSize: 17, fontWeight: "700", textAlign: "center", marginTop: 9, marginBottom: 11, paddingHorizontal: 12 },
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
