import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { PlanHabit, PlanTask } from "../auth/authApi";

const registryPrefix = "axmed.plan-reminders.";
const channelId = "plan-reminders";

export async function scheduleTaskReminder(userId: string, task: Pick<PlanTask, "id" | "title" | "dueAt" | "recurrence" | "recurrenceDays" | "reminderEnabled" | "reminderMinutesBefore">) {
  await cancelPlanReminder(userId, `task:${task.id}`);
  if (!task.reminderEnabled || !task.dueAt) return;
  if (!await permission()) throw new Error("Разрешите уведомления в настройках устройства.");
  await ensureChannel();
  const due = new Date(task.dueAt);
  const hour = due.getHours();
  const minute = due.getMinutes();
  const content = { title: task.title, body: "Задача из вашего плана AxMed", data: { screen: "plan", tab: "tasks", taskId: task.id, userId } };
  let identifiers: string[] = [];
  if (task.recurrence === "none") {
    const triggerDate = new Date(due.getTime() - task.reminderMinutesBefore * 60_000);
    if (triggerDate.getTime() > Date.now()) identifiers = [await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate, channelId } })];
  } else {
    const weekdays = taskWeekdays(task.recurrence, task.recurrenceDays, due);
    identifiers = await Promise.all(weekdays.map(weekday => Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute, channelId }
    })));
  }
  await store(userId, `task:${task.id}`, identifiers);
}

export async function scheduleHabitReminder(userId: string, habit: Pick<PlanHabit, "id" | "title" | "scheduleType" | "scheduleDays" | "reminderEnabled" | "reminderTime">) {
  await cancelPlanReminder(userId, `habit:${habit.id}`);
  if (!habit.reminderEnabled || !habit.reminderTime) return;
  if (!await permission()) throw new Error("Разрешите уведомления в настройках устройства.");
  await ensureChannel();
  const [hour, minute] = habit.reminderTime.split(":").map(Number);
  const content = { title: habit.title, body: "Мягкое напоминание о привычке", data: { screen: "plan", tab: "habits", habitId: habit.id, userId } };
  const days = habit.scheduleType === "daily" || habit.scheduleType === "timesPerWeek" || habit.scheduleType === "custom"
    ? [] : habit.scheduleType === "weekdays" ? [2, 3, 4, 5, 6] : habit.scheduleDays.map(isoToExpoWeekday);
  const identifiers = days.length === 0
    ? [await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId } })]
    : await Promise.all(days.map(weekday => Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute, channelId } })));
  await store(userId, `habit:${habit.id}`, identifiers);
}

export async function cancelPlanReminder(userId: string, sourceKey: string) {
  const registry = await readRegistry(userId);
  const identifiers = registry[sourceKey] ?? [];
  await Promise.allSettled(identifiers.map(identifier => Notifications.cancelScheduledNotificationAsync(identifier)));
  delete registry[sourceKey];
  await SecureStore.setItemAsync(`${registryPrefix}${userId}`, JSON.stringify(registry));
}

export async function cancelAllPlanRemindersForUser(userId: string) {
  const registry = await readRegistry(userId);
  await Promise.allSettled(Object.values(registry).flat().map(identifier => Notifications.cancelScheduledNotificationAsync(identifier)));
  await SecureStore.deleteItemAsync(`${registryPrefix}${userId}`);
}

async function store(userId: string, sourceKey: string, identifiers: string[]) {
  const registry = await readRegistry(userId);
  registry[sourceKey] = identifiers;
  await SecureStore.setItemAsync(`${registryPrefix}${userId}`, JSON.stringify(registry));
}
async function readRegistry(userId: string) {
  const raw = await SecureStore.getItemAsync(`${registryPrefix}${userId}`);
  if (!raw) return {} as Record<string, string[]>;
  try { return JSON.parse(raw) as Record<string, string[]>; } catch { return {} as Record<string, string[]>; }
}
async function permission() {
  const current = await Notifications.getPermissionsAsync();
  return current.granted || (await Notifications.requestPermissionsAsync()).granted;
}
async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(channelId, { name: "План и привычки", importance: Notifications.AndroidImportance.DEFAULT, vibrationPattern: [0, 160], lightColor: "#237354" });
}
function taskWeekdays(recurrence: PlanTask["recurrence"], days: number[], due: Date) {
  if (recurrence === "daily") return [1, 2, 3, 4, 5, 6, 7];
  if (recurrence === "weekdays") return [2, 3, 4, 5, 6];
  if (recurrence === "weekly") return [due.getDay() + 1];
  return days.map(isoToExpoWeekday);
}
function isoToExpoWeekday(day: number) { return day === 7 ? 1 : day + 1; }
