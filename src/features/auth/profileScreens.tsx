import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Gender } from "./types";
import {
  AuthScaffold,
  InfoBanner,
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
      <StepHeader current={1} labelTotal={4} onBack={onBack} />
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
      <Text style={styles.helper}>Вы должны быть старше 18 лет</Text>

      <Text style={[styles.fieldLabel, styles.genderLabel]}>Пол при рождении</Text>
      <View style={styles.genderRow}>
        <GenderCard label="Мужской" icon="gender-male" selected={gender === "male"} onPress={() => setGender("male")} />
        <GenderCard label="Женский" icon="gender-female" selected={gender === "female"} onPress={() => setGender("female")} />
      </View>

      <View style={styles.flexSpacer} />
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
  documentText: string;
}[] = [
  {
    key: "terms",
    icon: "file-document-outline",
    title: "Условия сервиса",
    description: "Правила использования AxMed",
    link: "Условия сервиса",
    documentText: "AxMed помогает отслеживать показатели здоровья и получать персональные рекомендации.\n\nИспользуя приложение, вы соглашаетесь предоставлять данные, необходимые для работы сервиса, и использовать его только в законных целях.\n\nНе передавайте доступ к аккаунту другим людям. Условия могут обновляться — о важных изменениях мы сообщим в приложении."
  },
  {
    key: "privacy",
    icon: "lock-outline",
    title: "Политика конфиденциальности",
    description: "Как мы защищаем ваши данные",
    link: "Политика конфиденциальности",
    documentText: "Мы собираем данные, которые вы указываете в приложении, чтобы сохранять профиль, анализировать показатели и показывать рекомендации.\n\nМы не продаём персональные данные и не передаём их третьим лицам без законного основания или вашего согласия. Доступ к данным ограничен и защищён.\n\nВы можете запросить исправление или удаление своих данных через службу поддержки."
  },
  {
    key: "health",
    icon: "heart-pulse",
    title: "Обработка данных о здоровье",
    description: "Согласие на анализ данных о здоровье",
    link: "Обработка данных о здоровье",
    documentText: "Вы разрешаете AxMed обрабатывать сведения о самочувствии, измерениях и ответах в анкете для анализа динамики и подготовки персональных рекомендаций.\n\nРекомендации приложения не заменяют консультацию врача. При плохом самочувствии или резком ухудшении состояния обратитесь к медицинскому специалисту.\n\nСогласие можно отозвать через настройки профиля или службу поддержки."
  }
];

export function ConsentsScreen({ onBack, onContinue }: { onBack: () => void; onContinue: () => void; onExit: () => void }) {
  const [checked, setChecked] = useState<Record<ConsentKey, boolean>>({ terms: true, privacy: true, health: true });
  const [activeDocument, setActiveDocument] = useState<(typeof consentItems)[number] | null>(null);
  const allChecked = consentItems.every((item) => checked[item.key]);

  const toggle = (key: ConsentKey) => setChecked((current) => ({ ...current, [key]: !current[key] }));
  const toggleAll = () => setChecked({ terms: !allChecked, privacy: !allChecked, health: !allChecked });
  const openDocument = (item: (typeof consentItems)[number]) => setActiveDocument(item);

  return (
    <AuthScaffold>
      <StepHeader current={2} onBack={onBack} />
      <View style={styles.consentHeading}>
        <PageTitle
          title="Согласия"
          subtitle="Примите документы, чтобы продолжить."
        />
      </View>

      <View style={styles.consentList}>
        {consentItems.map((item) => (
          <Surface key={item.key} style={styles.consentCard}>
            <View style={styles.consentRow}>
              <View style={styles.consentToggle}>
                <Pressable
                  accessibilityLabel={`Открыть документ: ${item.title}`}
                  accessibilityRole="link"
                  onPress={() => openDocument(item)}
                  style={styles.consentDocument}
                >
                  <View style={styles.consentIcon}>
                    <MaterialCommunityIcons name={item.icon} size={25} color={authColors.greenDark} />
                  </View>
                  <View style={styles.consentCopy}>
                    <Text style={styles.consentTitle}>{item.title}</Text>
                    <Text style={styles.consentDescription}>{item.description}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Согласие: ${item.title}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: checked[item.key] }}
                  aria-checked={checked[item.key]}
                  hitSlop={8}
                  onPress={() => toggle(item.key)}
                  style={styles.checkboxButton}
                >
                  <Checkbox checked={checked[item.key]} />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel={`Открыть документ: ${item.link}`}
                accessibilityRole="link"
                hitSlop={8}
                onPress={() => openDocument(item)}
                style={styles.consentDetails}
              >
                <Ionicons name="chevron-forward" size={22} color={authColors.text} />
              </Pressable>
            </View>
          </Surface>
        ))}
      </View>

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allChecked }} aria-checked={allChecked} onPress={toggleAll} style={styles.acceptAll}>
        <Checkbox checked={allChecked} />
        <Text style={styles.acceptAllText}>Я принимаю все документы и согласен на обработку данных.</Text>
      </Pressable>

      <View style={styles.consentActions}>
        <PrimaryButton title="Продолжить" disabled={!allChecked} onPress={onContinue} />
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setActiveDocument(null)}
        transparent
        visible={!!activeDocument}
      >
        <View style={styles.documentOverlay}>
          <Pressable
            accessibilityLabel="Закрыть документ"
            onPress={() => setActiveDocument(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.documentSheet}>
            <View style={styles.documentHandle} />
            <View style={styles.documentHeader}>
              <Text style={styles.documentTitle}>{activeDocument?.title}</Text>
              <Pressable
                accessibilityLabel="Закрыть"
                hitSlop={10}
                onPress={() => setActiveDocument(null)}
                style={styles.documentClose}
              >
                <Ionicons name="close" size={25} color={authColors.ink} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.documentBody}>{activeDocument?.documentText}</Text>
            </ScrollView>
            <View style={styles.documentAction}>
              <PrimaryButton title="Понятно" onPress={() => setActiveDocument(null)} />
            </View>
          </View>
        </View>
      </Modal>
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
  fieldLabel: { color: authColors.ink, fontSize: 18, fontWeight: "700", marginBottom: 14 },
  dateField: { height: 58, borderWidth: 1.5, borderColor: authColors.line, borderRadius: 15, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: "rgba(255,255,255,0.96)" },
  dateFieldError: { borderColor: authColors.danger },
  dateInput: { flex: 1, height: "100%", color: authColors.ink, fontSize: 20 },
  error: { color: authColors.danger, fontSize: 13, marginTop: 7 },
  helper: { color: authColors.muted, fontSize: 14, marginTop: 12 },
  genderLabel: { marginTop: 42 },
  genderRow: { flexDirection: "row", gap: 14 },
  genderCard: { flex: 1, minHeight: 138, borderWidth: 1.5, borderColor: authColors.line, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center", gap: 10 },
  genderCardSelected: { borderColor: authColors.green, backgroundColor: "#F2FBF8" },
  genderText: { color: "#565E6B", fontSize: 18 },
  genderTextSelected: { color: authColors.greenDark, fontWeight: "600" },
  flexSpacer: { flex: 1, minHeight: 28 },
  bottomAction: { marginTop: 20 },
  restrictionContent: { justifyContent: "space-between", paddingTop: 72 },
  restrictionMain: { alignItems: "stretch" },
  restrictionIcon: { width: 126, height: 126, borderRadius: 63, backgroundColor: authColors.dangerSoft, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 30 },
  restrictionActions: { gap: 14 },
  consentHeading: { marginBottom: -6 },
  consentList: { gap: 8, marginBottom: 14 },
  consentCard: { padding: 12, borderRadius: 16 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  consentToggle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  consentDocument: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  consentIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: authColors.soft, alignItems: "center", justifyContent: "center" },
  consentCopy: { flex: 1, minWidth: 0 },
  consentTitle: { color: authColors.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" },
  consentDescription: { color: authColors.text, fontSize: 12, lineHeight: 16, marginTop: 2 },
  checkboxButton: { width: 32, height: 42, alignItems: "center", justifyContent: "center" },
  consentDetails: { width: 28, height: 42, alignItems: "center", justifyContent: "center", marginRight: -5 },
  checkbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 1.5, borderColor: "#AEB6C1", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: authColors.greenDark, borderColor: authColors.greenDark },
  acceptAll: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 18, marginBottom: 16, paddingHorizontal: 2 },
  acceptAllText: { flex: 1, color: authColors.ink, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  consentActions: { gap: 6 },
  documentOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7,18,37,0.35)" },
  documentSheet: { maxHeight: "82%", borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: authColors.white, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 24 },
  documentHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#D6DCE2", alignSelf: "center", marginBottom: 16 },
  documentHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  documentTitle: { flex: 1, color: authColors.ink, fontSize: 22, lineHeight: 28, fontWeight: "800" },
  documentClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: authColors.soft, alignItems: "center", justifyContent: "center" },
  documentBody: { color: authColors.text, fontSize: 15, lineHeight: 23, paddingBottom: 4 },
  documentAction: { marginTop: 16 }
});
