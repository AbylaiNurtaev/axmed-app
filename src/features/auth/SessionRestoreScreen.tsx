import { useAuthStyles, type AuthColors } from "./authTheme";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AuthHeader, AuthScaffold, PageTitle, PrimaryButton } from "./onboardingUi";
import { AuthApiError } from "./authApi";

export function SessionRestoreScreen({ failed, error, onRetry }: { failed: boolean; error?: unknown; onRetry: () => void }) {
  const { styles, authColors } = useAuthStyles(createStyles);
  const connectionError = error instanceof AuthApiError
    && (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT");
  const serverError = error instanceof AuthApiError && error.status >= 500;
  const title = connectionError ? "Нет связи с сервером"
    : serverError ? "Сервер временно недоступен" : "Не удалось проверить вход";
  const description = connectionError
    ? (__DEV__
      ? "Убедитесь, что бэкенд запущен на компьютере, а телефон и компьютер подключены к одной сети Wi-Fi. Затем нажмите «Повторить»."
      : "Не удалось подключиться к AxMed. Проверьте соединение и попробуйте ещё раз.")
    : serverError
      ? "Не удалось получить ответ от AxMed. Попробуйте ещё раз чуть позже."
      : "Попробуйте ещё раз. Если ошибка повторяется, закройте и снова откройте приложение.";
  return (
    <AuthScaffold>
      <AuthHeader />
      <View style={styles.main} accessibilityLiveRegion="polite">
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon}>
          {failed
            ? <Ionicons name="cloud-offline-outline" size={40} color={authColors.ink} />
            : <ActivityIndicator size="large" color={authColors.ink} />}
        </View>
        <PageTitle centered
          title={failed ? title : "Проверяем вход"}
          subtitle={failed
            ? description
            : "Открываем ваш AxMed…"} />
      </View>
      {failed ? <PrimaryButton title="Повторить" icon="refresh-outline" onPress={onRetry} /> : null}
    </AuthScaffold>
  );
}

const createStyles = (authColors: AuthColors) => StyleSheet.create({
  main: { flexGrow: 1, justifyContent: "center", paddingVertical: 36 },
  icon: { width: 96, height: 96, borderRadius: 30, backgroundColor: authColors.soft,
    alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 28 }
});
