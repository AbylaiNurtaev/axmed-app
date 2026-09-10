import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Gender } from "./types";
import {
  AuthScaffold,
  InfoBanner,
  LinkButton,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
  StepHeader,
  Surface,
  authColors
} from "./ui";

export function AboutScreen({
  onBack,
  onContinue,
  onUnderAge
}: {
  onBack: () => void;
  onContinue: (birthDate: string, gender: Gender) => void;
  onUnderAge: () => void;
}) {
  const [birthDate, setBirthDate] = useState("15.04.1990");
  const [gender, setGender] = useState<Gender>("male");
  const [error, setError] = useState("");

  const continueFlow = () => {
    const age = calculateAge(birthDate);
    if (age === null) {
      setError("Введите дату в формате ДД.ММ.ГГГГ");
      return;
    }
    if (age < 18) {
      setError("");
      onUnderAge();
      return;
    }
    setError("");
    onContinue(birthDate, gender);
  };

  return (
    <AuthScaffold>
      <StepHeader current={1} onBack={onBack} />
      <PageTitle
        title="О вас"
        subtitle="Эти данные помогут нам точнее анализировать ваши показатели и давать персональные рекомендации."
      />

      <Text style={styles.fieldLabel}>Дата рождения</Text>
      <View style={[styles.dateField, !!error && styles.dateFieldError]}>
        <Ionicons name="calendar-outline" size={27} color={authColors.text} />
        <TextInput
          accessibilityLabel="Дата рождения"
          keyboardType="number-pad"
          maxLength={10}
          onChangeText={(value) => { setBirthDate(formatBirthDate(value)); if (error) setError(""); }}
          placeholder="ДД.ММ.ГГГГ"
          placeholderTextColor="#A6AEBA"
          style={styles.dateInput}
          value={birthDate}
        />
        {!!birthDate && (
          <Pressable accessibilityLabel="Очистить дату" hitSlop={10} onPress={() => setBirthDate("")}>
            <Ionicons name="close-circle" size={26} color="#C9CDD3" />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.helper}>Вам должно быть 18 лет или больше</Text>

      <Text style={[styles.fieldLabel, styles.genderLabel]}>Пол при рождении</Text>
      <View style={styles.genderRow}>
        <GenderCard label="Мужской" icon="gender-male" selected={gender === "male"} onPress={() => setGender("male")} />
        <GenderCard label="Женский" icon="gender-female" selected={gender === "female"} onPress={() => setGender("female")} />
      </View>

      <View style={styles.flexSpacer} />
      <InfoBanner
        title="Ваши данные под защитой"
        text="Мы используем эти данные только для анализа вашего здоровья и не передаём третьим лицам без вашего согласия."
      />
      <View style={styles.bottomAction}>
        <PrimaryButton title="Продолжить" onPress={continueFlow} />
      </View>
    </AuthScaffold>
  );
}

function GenderCard({
  label,
  icon,
  selected,
  onPress
}: {
  label: string;
  icon: "gender-male" | "gender-female";
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={[styles.genderCard, selected && styles.genderCardSelected]}
    >
      <MaterialCommunityIcons name={icon} size={63} color={selected ? authColors.greenDark : "#565E6B"} />
      <Text style={[styles.genderText, selected && styles.genderTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function AgeRestrictionScreen({ onFixDate, onExit }: { onFixDate: () => void; onExit: () => void }) {
  return (
    <AuthScaffold contentStyle={styles.restrictionContent}>
      <View style={styles.restrictionMain}>
        <View style={styles.restrictionIcon}>
          <MaterialCommunityIcons name="account-lock-outline" size={62} color={authColors.danger} />
        </View>
        <PageTitle
          centered
          title="Ограничение 18+"
          subtitle="AxMed пока доступен пользователям от 18 лет. Проверьте указанную дату рождения."
        />
        <InfoBanner
          danger
          icon="information-outline"
          title="Почему действует ограничение"
          text="В первой версии используются рекомендации и диапазоны, предназначенные только для взрослых пользователей."
        />
      </View>
      <View style={styles.restrictionActions}>
        <PrimaryButton title="Исправить дату рождения" onPress={onFixDate} />
        <SecondaryButton title="Выйти из аккаунта" onPress={onExit} />
      </View>
    </AuthScaffold>
  );
}

type ConsentKey = "terms" | "privacy" | "health";

const consentItems: {
  key: ConsentKey;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
  link: string;
}[] = [
  {
    key: "terms",
    icon: "file-document-outline",
    title: "Условия сервиса",
    description: "Я принимаю Условия использования приложения AxMed.",
    link: "Читать Условия сервиса"
  },
  {
    key: "privacy",
    icon: "lock-outline",
    title: "Политика конфиденциальности",
    description: "Я ознакомлен и согласен с Политикой конфиденциальности.",
    link: "Читать Политику конфиденциальности"
  },
  {
    key: "health",
    icon: "heart-pulse",
    title: "Обработка данных о здоровье",
    description: "Я даю согласие на обработку данных о здоровье для анализа и персональных рекомендаций.",
    link: "Подробнее об обработке данных"
  }
];

export function ConsentsScreen({ onBack, onContinue, onExit }: { onBack: () => void; onContinue: () => void; onExit: () => void }) {
  const [checked, setChecked] = useState<Record<ConsentKey, boolean>>({ terms: false, privacy: false, health: false });
  const allChecked = consentItems.every((item) => checked[item.key]);

  const toggle = (key: ConsentKey) => setChecked((current) => ({ ...current, [key]: !current[key] }));
  const toggleAll = () => setChecked({ terms: !allChecked, privacy: !allChecked, health: !allChecked });

  return (
    <AuthScaffold>
      <StepHeader current={2} onBack={onBack} />
      <PageTitle
        title="Согласия"
        subtitle="Для работы AxMed необходимо ваше согласие на обработку данных и использование функций приложения."
      />

      <View style={styles.consentList}>
        {consentItems.map((item) => (
          <Surface key={item.key} style={styles.consentCard}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: checked[item.key] }}
              aria-checked={checked[item.key]}
              onPress={() => toggle(item.key)}
              style={styles.consentTop}
            >
              <View style={styles.consentIcon}>
                <MaterialCommunityIcons name={item.icon} size={28} color={authColors.greenDark} />
              </View>
              <View style={styles.consentCopy}>
                <Text style={styles.consentTitle}>{item.title}</Text>
                <Text style={styles.consentDescription}>{item.description}</Text>
              </View>
              <Checkbox checked={checked[item.key]} />
              <Ionicons name="chevron-forward" size={22} color={authColors.text} />
            </Pressable>
            <View style={styles.consentDivider} />
            <Pressable accessibilityRole="link" onPress={() => Alert.alert(item.title, "Документ будет загружен с сервера перед production-релизом.")}>
              <Text style={styles.consentLink}>{item.link}</Text>
            </Pressable>
          </Surface>
        ))}
      </View>

      <InfoBanner
        title="Ваши данные защищены"
        text="Мы используем современные методы шифрования и не передаём ваши данные без согласия."
      />

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allChecked }} aria-checked={allChecked} onPress={toggleAll} style={styles.acceptAll}>
        <Checkbox checked={allChecked} />
        <Text style={styles.acceptAllText}>Я прочитал и принимаю все указанные документы и даю согласие на обработку данных.</Text>
      </Pressable>

      <View style={styles.consentActions}>
        <PrimaryButton title="Принять и продолжить" disabled={!allChecked} onPress={onContinue} />
        <LinkButton title="Выйти" onPress={onExit} />
      </View>
    </AuthScaffold>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && <Ionicons name="checkmark" size={19} color="#fff" />}
    </View>
  );
}

function formatBirthDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function calculateAge(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const birthDate = new Date(year, month - 1, day);
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) return null;
  const today = new Date();
  if (birthDate > today) return null;
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

const styles = StyleSheet.create({
  fieldLabel: { color: authColors.ink, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  dateField: { height: 58, borderWidth: 1.5, borderColor: authColors.line, borderRadius: 15, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: "rgba(255,255,255,0.96)" },
  dateFieldError: { borderColor: authColors.danger },
  dateInput: { flex: 1, height: "100%", color: authColors.ink, fontSize: 20 },
  error: { color: authColors.danger, fontSize: 13, marginTop: 7 },
  helper: { color: authColors.muted, fontSize: 14, marginTop: 10 },
  genderLabel: { marginTop: 28 },
  genderRow: { flexDirection: "row", gap: 14 },
  genderCard: { flex: 1, minHeight: 148, borderWidth: 1.5, borderColor: authColors.line, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center", gap: 10 },
  genderCardSelected: { borderColor: authColors.green, backgroundColor: "#F2FBF8" },
  genderText: { color: "#565E6B", fontSize: 18 },
  genderTextSelected: { color: authColors.greenDark, fontWeight: "600" },
  flexSpacer: { flex: 1, minHeight: 28 },
  bottomAction: { marginTop: 20 },
  restrictionContent: { justifyContent: "space-between", paddingTop: 72 },
  restrictionMain: { alignItems: "stretch" },
  restrictionIcon: { width: 126, height: 126, borderRadius: 63, backgroundColor: authColors.dangerSoft, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 30 },
  restrictionActions: { gap: 14 },
  consentList: { gap: 7, marginBottom: 11 },
  consentCard: { padding: 10 },
  consentTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  consentIcon: { width: 35, height: 35, borderRadius: 10, backgroundColor: authColors.soft, alignItems: "center", justifyContent: "center" },
  consentCopy: { flex: 1 },
  consentTitle: { color: authColors.ink, fontSize: 13, lineHeight: 16, fontWeight: "700" },
  consentDescription: { color: authColors.text, fontSize: 11, lineHeight: 14, marginTop: 2 },
  consentDivider: { height: 1, backgroundColor: authColors.line, marginVertical: 6 },
  consentLink: { color: authColors.greenDark, fontSize: 11.5, lineHeight: 15, fontWeight: "600" },
  checkbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 1.5, borderColor: "#AEB6C1", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: authColors.greenDark, borderColor: authColors.greenDark },
  acceptAll: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginTop: 14, marginBottom: 13, paddingHorizontal: 2 },
  acceptAllText: { flex: 1, color: authColors.ink, fontSize: 12.5, lineHeight: 17, fontWeight: "600" },
  consentActions: { gap: 6 }
});
