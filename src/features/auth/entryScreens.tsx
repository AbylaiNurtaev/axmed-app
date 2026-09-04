import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
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

export function WelcomeScreen({ onCreateAccount, onSignIn }: { onCreateAccount: () => void; onSignIn: () => void }) {
  return (
    <AuthScaffold contentStyle={styles.welcomeContent}>
      <View style={styles.welcomeTop}>
        <AxMedLogo />
        <Text style={styles.welcomeTitle}>Добро пожаловать</Text>
        <Text style={styles.welcomeSubtitle}>
          AxMed помогает отслеживать важные показатели здоровья, понимать изменения и получать понятные рекомендации.
        </Text>
      </View>

      <HealthIllustration />

      <View style={styles.welcomeActions}>
        <PrimaryButton title="Создать аккаунт" onPress={onCreateAccount} />
        <SecondaryButton title="Войти" onPress={onSignIn} />
        <View style={styles.safetyLine}>
          <Ionicons name="lock-closed-outline" size={20} color={authColors.greenDark} />
          <Text style={styles.safetyText}>Безопасно. Конфиденциально. Для пользователей 18+</Text>
        </View>
      </View>
    </AuthScaffold>
  );
}

function HealthIllustration() {
  return (
    <View style={styles.illustration}>
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
        <View style={styles.phoneMetricRow}>
          <Text style={styles.phoneMiniMetric}>98% SpO₂</Text>
          <Text style={styles.phoneMiniMetric}>♥ 72</Text>
        </View>
      </View>
      <View style={styles.chartBubble}>
        <View style={[styles.chartBar, { height: 30 }]} />
        <View style={[styles.chartBar, { height: 43 }]} />
        <View style={[styles.chartBar, { height: 35 }]} />
        <View style={[styles.chartBar, { height: 55 }]} />
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
  onSocialContinue: (mode: AuthMode, provider: "Google" | "Apple") => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

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

  return (
    <AuthScaffold>
      <View style={styles.authTopRow}>
        <BackButton onPress={onBack} />
        <AxMedLogo compact />
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.authTabs}>
        <Pressable onPress={() => { setMode("signUp"); setError(""); }} style={[styles.authTab, isSignUp && styles.authTabActive]}>
          <Text style={[styles.authTabText, isSignUp && styles.authTabTextActive]}>Регистрация</Text>
        </Pressable>
        <Pressable onPress={() => { setMode("signIn"); setError(""); }} style={[styles.authTab, !isSignUp && styles.authTabActive]}>
          <Text style={[styles.authTabText, !isSignUp && styles.authTabTextActive]}>Вход</Text>
        </Pressable>
      </View>

      <Text style={styles.authTitle}>{isSignUp ? "Регистрация" : "Вход"}</Text>
      <Text style={styles.authSubtitle}>
        {isSignUp
          ? "Выберите удобный способ, чтобы создать аккаунт в AxMed."
          : "Войдите в AxMed удобным способом, чтобы продолжить."}
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
        <SocialButton provider="Google" title={`${isSignUp ? "Продолжить" : "Войти"} с Google`} onPress={() => onSocialContinue(mode, "Google")} />
        <SocialButton provider="Apple" title={`${isSignUp ? "Продолжить" : "Войти"} с Apple`} onPress={() => onSocialContinue(mode, "Apple")} />
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

function SocialButton({ provider, title, onPress }: { provider: "Google" | "Apple"; title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.socialButton, pressed && styles.buttonPressed]} onPress={onPress}>
      <Ionicons name={provider === "Google" ? "logo-google" : "logo-apple"} size={28} color={provider === "Google" ? "#4285F4" : "#111"} />
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
    <AuthScaffold>
      <View style={styles.authTopRow}>
        <BackButton onPress={onBack} />
        <AxMedLogo compact />
        <View style={styles.topSpacer} />
      </View>

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
  welcomeContent: { justifyContent: "space-between", paddingTop: 34 },
  welcomeTop: { alignItems: "center" },
  welcomeTitle: { color: authColors.ink, fontSize: 34, lineHeight: 41, fontWeight: "800", textAlign: "center", marginTop: 28 },
  welcomeSubtitle: { color: authColors.text, fontSize: 17, lineHeight: 26, textAlign: "center", marginTop: 12, maxWidth: 460 },
  illustration: { height: 300, marginTop: 16, marginBottom: 12, alignItems: "center", justifyContent: "center" },
  phone: { width: 145, height: 250, borderRadius: 28, borderWidth: 7, borderColor: "#D7EDE7", backgroundColor: "#F9FFFD", padding: 16, transform: [{ rotate: "4deg" }], shadowColor: authColors.greenDark, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 4 },
  phoneSpeaker: { width: 36, height: 5, borderRadius: 3, backgroundColor: "#C8E6DE", alignSelf: "center", marginBottom: 18 },
  phonePulse: { height: 54, borderRadius: 13, backgroundColor: authColors.soft, alignItems: "center", justifyContent: "center" },
  phoneMetric: { marginTop: 12, borderRadius: 12, backgroundColor: "#fff", padding: 10, borderWidth: 1, borderColor: "#E4F2EE" },
  phoneMetricValue: { color: authColors.ink, fontSize: 18, fontWeight: "800" },
  phoneMetricUnit: { color: authColors.greenDark, fontSize: 10 },
  phoneMetricRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 13 },
  phoneMiniMetric: { color: authColors.greenDark, fontSize: 10, fontWeight: "700" },
  shieldBubble: { position: "absolute", zIndex: 2, left: "9%", top: 118, width: 94, height: 94, borderRadius: 47, backgroundColor: "#E8F8F3", alignItems: "center", justifyContent: "center" },
  chartBubble: { position: "absolute", right: "6%", top: 62, width: 112, height: 104, borderRadius: 20, backgroundColor: "#fff", flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, paddingBottom: 20, shadowColor: authColors.greenDark, shadowOpacity: 0.1, shadowRadius: 16, elevation: 3 },
  chartBar: { width: 13, borderRadius: 7, backgroundColor: authColors.greenLight },
  heartBubble: { position: "absolute", right: "16%", bottom: 12, width: 88, height: 88, borderRadius: 44, backgroundColor: authColors.green, alignItems: "center", justifyContent: "center" },
  welcomeActions: { gap: 14 },
  safetyLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  safetyText: { color: authColors.text, fontSize: 13, flexShrink: 1, textAlign: "center" },
  authTopRow: { minHeight: 122, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  topSpacer: { width: 38 },
  authTabs: { height: 49, flexDirection: "row", borderWidth: 1.5, borderColor: authColors.green, borderRadius: 25, marginBottom: 28, overflow: "hidden" },
  authTab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  authTabActive: { backgroundColor: authColors.soft, borderWidth: 1, borderColor: authColors.green },
  authTabText: { color: authColors.muted, fontSize: 16, fontWeight: "600" },
  authTabTextActive: { color: authColors.greenDark, fontWeight: "700" },
  authTitle: { color: authColors.ink, fontSize: 34, lineHeight: 41, fontWeight: "800", textAlign: "center" },
  authSubtitle: { color: authColors.text, fontSize: 17, lineHeight: 25, textAlign: "center", marginTop: 10, marginBottom: 25, paddingHorizontal: 8 },
  emailCard: { gap: 18, padding: 20 },
  divider: { flexDirection: "row", alignItems: "center", gap: 16, marginVertical: 24, paddingHorizontal: 34 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#9BDCCB" },
  dividerText: { color: authColors.greenDark, fontSize: 17, fontWeight: "600" },
  socialButtons: { gap: 13 },
  socialButton: { minHeight: 58, borderRadius: 15, borderWidth: 1.5, borderColor: authColors.green, backgroundColor: "rgba(255,255,255,0.9)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 18 },
  socialButtonText: { color: authColors.ink, fontSize: 18, fontWeight: "700" },
  switchMode: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 24, minHeight: 36 },
  switchModeMuted: { color: authColors.text, fontSize: 16 },
  switchModeLink: { color: authColors.greenDark, fontSize: 16, fontWeight: "700" },
  secureFooter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, marginTop: 12 },
  secureFooterText: { color: authColors.text, fontSize: 13, flexShrink: 1 },
  buttonPressed: { opacity: 0.76 },
  verifyTitle: { color: authColors.ink, fontSize: 34, lineHeight: 41, fontWeight: "800", textAlign: "center", marginTop: 10 },
  verifySubtitle: { color: authColors.text, fontSize: 17, lineHeight: 25, textAlign: "center", marginTop: 14, paddingHorizontal: 30 },
  maskedEmail: { color: authColors.greenDark, fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 16, marginBottom: 24 },
  codeCard: { padding: 22 },
  codeBoxes: { flexDirection: "row", gap: 9, justifyContent: "center", position: "relative" },
  codeBox: { flex: 1, maxWidth: 58, aspectRatio: 0.76, borderRadius: 13, borderWidth: 1.5, borderColor: "#B8E7DB", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  codeBoxActive: { borderColor: authColors.green, borderWidth: 2 },
  codeDigit: { color: authColors.greenDark, fontSize: 28, fontWeight: "700" },
  hiddenCodeInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  codeHint: { color: authColors.greenDark, fontSize: 16, textAlign: "center", marginTop: 19 },
  codeSeparator: { height: 1, backgroundColor: "#D1EDE6", marginVertical: 18 },
  resendTimer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  resendTimerText: { color: authColors.greenDark, fontSize: 14, textAlign: "center" },
  verifyActions: { gap: 4, marginTop: 24 }
});
