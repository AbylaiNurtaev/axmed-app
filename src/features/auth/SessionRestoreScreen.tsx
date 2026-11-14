import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AuthHeader, AuthScaffold, PageTitle, PrimaryButton, authColors } from "./onboardingUi";

export function SessionRestoreScreen({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
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
          title={failed ? "Не удалось проверить вход" : "Проверяем вход"}
          subtitle={failed
            ? "Проверьте интернет и попробуйте ещё раз. Если соединение есть, повторите попытку чуть позже."
            : "Открываем ваш AxMed…"} />
      </View>
      {failed ? <PrimaryButton title="Повторить" icon="refresh-outline" onPress={onRetry} /> : null}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  main: { flexGrow: 1, justifyContent: "center", paddingVertical: 36 },
  icon: { width: 96, height: 96, borderRadius: 30, backgroundColor: authColors.soft,
    alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 28 }
});
