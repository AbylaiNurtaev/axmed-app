import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type ProfileNotificationKey = "notificationGoals" | "notificationTasks" | "notificationHabits" | "notificationMeasurements" | "notificationBracelet" | "notificationScale" | "notificationWeeklyReport" | "notificationMarketing";
export type ProfileNotificationSettings = Record<ProfileNotificationKey, boolean> & { notificationTime: string; notificationDays: number[] };

const prefix = "axmed.profile-notifications.";
const channelId = "axmed-wellness-reminders";
const scheduled: ReadonlyArray<{ key: Exclude<ProfileNotificationKey, "notificationMarketing">; title: string; body: string }> = [
  { key: "notificationGoals", title: "Ваши цели", body: "Небольшой шаг сегодня поддержит движение к цели." },
  { key: "notificationTasks", title: "Задачи на сегодня", body: "Проверьте ближайшее действие в плане AxMed." },
  { key: "notificationHabits", title: "Мягкое напоминание", body: "Отметьте привычку, когда вам будет удобно." },
  { key: "notificationMeasurements", title: "Время измерения", body: "Если удобно, обновите показатели здоровья." },
  { key: "notificationBracelet", title: "Синхронизация браслета", body: "Подключите браслет, чтобы обновить активность и сон." },
  { key: "notificationScale", title: "Умные весы", body: "Регулярное измерение помогает видеть спокойную динамику." },
  { key: "notificationWeeklyReport", title: "Недельный отчёт готов", body: "Посмотрите изменения показателей за неделю." }
];

export async function ensureProfileNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function profileNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  return current.granted ? "granted" as const : current.canAskAgain ? "undetermined" as const : "denied" as const;
}

export async function syncProfileNotifications(userId: string, settings: ProfileNotificationSettings) {
  await clearProfileNotifications(userId);
  if (!scheduled.some(item => settings[item.key])) return;
  await ensureChannel();
  const [hour, minute] = settings.notificationTime.split(":").map(Number);
  const ids: string[] = [];
  for (const item of scheduled) {
    if (!settings[item.key]) continue;
    const days = item.key === "notificationWeeklyReport" ? [1] : settings.notificationDays;
    for (const day of days) {
      ids.push(await Notifications.scheduleNotificationAsync({
        content: { title: item.title, body: item.body, data: { screen: item.key.includes("Goal") || item.key.includes("Task") || item.key.includes("Habit") ? "plan" : "health", ownerId: userId, kind: item.key } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: isoToExpo(day), hour, minute, channelId }
      }));
    }
  }
  await SecureStore.setItemAsync(`${prefix}${userId}`, JSON.stringify(ids));
}

export async function clearProfileNotifications(userId: string) {
  const raw = await SecureStore.getItemAsync(`${prefix}${userId}`);
  const ids = parseIds(raw);
  await Promise.allSettled(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
  await SecureStore.deleteItemAsync(`${prefix}${userId}`);
}

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(channelId, {
    name: "Напоминания AxMed",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 160],
    lightColor: "#237354"
  });
}

function parseIds(raw: string | null) {
  if (!raw) return [] as string[];
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
  catch { return [] as string[]; }
}
function isoToExpo(day: number) { return day === 7 ? 1 : day + 1; }
