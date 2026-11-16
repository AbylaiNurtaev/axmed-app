import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { AxBottomSheet } from "../../ui/feedback";
import { AxButton, AxPressable } from "../../ui/primitives";
import { useAxTheme } from "../../ui/theme";
import { deleteMyAccount, loadAccountDeletionInfo, type AccountDeletionInfo } from "../auth/authApi";
import { signInWithSocialProvider, SocialAuthError } from "../auth/socialAuth";

export function DeleteAccountSection({ email, onDeleted }: { email: string | null; onDeleted: () => void }) {
  const { colors } = useAxTheme();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<AccountDeletionInfo>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setInfo(undefined); setError(undefined);
    void loadAccountDeletionInfo(controller.signal).then(value => { if (!controller.signal.aborted) setInfo(value); }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Не удалось загрузить настройки удаления.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, attempt]);
  const apple = info?.providers.includes("apple") === true;
  const usePassword = Boolean(info?.hasPassword && !apple);
  const close = () => { if (!submitting.current) { setOpen(false); setPassword(""); setAccepted(false); setError(undefined); } };
  const remove = async () => {
    if (submitting.current || !info || !accepted) return;
    submitting.current = true; setBusy(true); setError(undefined);
    try {
      if (usePassword) {
        await deleteMyAccount({ method: "password", password });
      } else {
        const credential = await signInWithSocialProvider(apple ? "Apple" : "Google");
        if (credential.provider === "apple") {
          if (!credential.authorizationCode) throw new Error("Apple не вернул код подтверждения. Повторите попытку.");
          await deleteMyAccount({ method: "apple", idToken: credential.idToken, authorizationCode: credential.authorizationCode });
        } else {
          await deleteMyAccount({ method: "google", idToken: credential.idToken });
          // Remove Google's on-device grant as well as AxMed's own credentials.
          try { const { GoogleSignin } = await import("@react-native-google-signin/google-signin"); await GoogleSignin.revokeAccess(); await GoogleSignin.signOut(); } catch { /* Account data has already been deleted on the server. */ }
        }
      }
      if (mounted.current) { setPassword(""); onDeleted(); }
    } catch (reason) {
      if (mounted.current && !(reason instanceof SocialAuthError && reason.code === "cancelled")) {
        setError(reason instanceof Error ? reason.message : "Аккаунт не удалён. Повторите попытку.");
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const supported = info && (usePassword || apple || info.providers.includes("google"));
  return <>
    <View style={[styles.section, { borderColor: colors.line }]}>
      <Text style={[styles.title, { color: colors.ink }]}>Удаление аккаунта</Text>
      <Text style={[styles.copy, { color: colors.muted }]}>Удалить профиль и связанные с ним данные AxMed.</Text>
      <AxButton label="Удалить аккаунт" icon="trash-outline" variant="danger" onPress={() => setOpen(true)} />
    </View>
    <AxBottomSheet visible={open} title="Удалить аккаунт навсегда?" subtitle={email ?? "Ваш аккаунт AxMed"} onClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
        <Text style={[styles.copy, { color: colors.text }]}>Будут удалены профиль, сохранённые замеры, привязки устройств, цели, задачи и привычки. Все сеансы входа завершатся. Восстановить данные нельзя.</Text>
        {loading ? <ActivityIndicator color={colors.ink} accessibilityLabel="Загружаем настройки удаления" /> : null}
        {info && usePassword ? <View style={styles.field}>
          <Text style={[styles.copy, { color: colors.ink }]}>Подтвердите текущий пароль</Text>
          <TextInput accessibilityLabel="Пароль для удаления аккаунта" secureTextEntry autoCapitalize="none" autoCorrect={false}
            textContentType="password" value={password} editable={!busy} onChangeText={setPassword}
            style={[styles.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]} />
        </View> : null}
        {apple ? <Text style={[styles.copy, { color: colors.muted }]}>Apple попросит подтвердить связанный Apple ID. Его привязка к AxMed тоже будет удалена.</Text> : null}
        {apple && !info?.appleRevocationReady ? <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>Удаление привязки Apple временно недоступно. Попробуйте позже.</Text> : null}
        {info ? <AxPressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted, disabled: busy }}
          accessibilityLabel="Понимаю, что данные нельзя восстановить" disabled={busy} onPress={() => setAccepted(value => !value)} style={styles.acknowledgement}>
          <Ionicons name={accepted ? "checkbox" : "square-outline"} size={24} color={colors.ink} />
          <Text style={[styles.copy, styles.flex, { color: colors.text }]}>Понимаю, что данные нельзя восстановить</Text>
        </AxPressable> : null}
        {error ? <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>{error}</Text> : null}
        {!loading && !info ? <AxButton label="Повторить" variant="secondary" onPress={() => setAttempt(value => value + 1)} /> : null}
        <AxButton label={usePassword ? "Удалить аккаунт навсегда" : apple ? "Подтвердить с Apple и удалить" : "Подтвердить с Google и удалить"}
          variant="danger" loading={busy} disabled={!supported || !accepted || (usePassword && !password) || (apple && !info?.appleRevocationReady)} onPress={() => void remove()} />
        <AxButton label="Сохранить аккаунт" variant="secondary" disabled={busy} onPress={close} />
      </KeyboardAvoidingView>
    </AxBottomSheet>
  </>;
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, paddingTop: 24, marginTop: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: "700" }, copy: { fontSize: 14, lineHeight: 21 },
  sheet: { gap: 16 }, field: { gap: 8 }, flex: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, fontSize: 16 },
  acknowledgement: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }
});
