import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getSessionUserId, type ProfileGoal } from "../auth/authApi";

const storagePrefix = "axmed.goal-reminders.";
const channelId = "goal-reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function ensureGoalReminderPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function cancelGoalReminder(goalId: string) {
  const key = `${storagePrefix}${goalId}`;
  const stored = await SecureStore.getItemAsync(key);
  const identifiers = parseIdentifiers(stored);
  await Promise.allSettled(identifiers.map(identifier => Notifications.cancelScheduledNotificationAsync(identifier)));
  await SecureStore.deleteItemAsync(key);
}

export async function clearGoalRemindersForUser(userId: string) {
  const [scheduled, presented] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(), Notifications.getPresentedNotificationsAsync()
  ]);
  const belongsToUser = (data?: Record<string, unknown>) => typeof data?.goalId === "string" && (!data.userId || data.userId === userId);
  const pending = scheduled.filter(item => belongsToUser(item.content.data));
  const delivered = presented.filter(item => belongsToUser(item.request.content.data));
  const goalIds = new Set([...pending.map(item => item.content.data?.goalId), ...delivered.map(item => item.request.content.data?.goalId)].filter((value): value is string => typeof value === "string"));
  await Promise.allSettled([
    ...[...goalIds].map(cancelGoalReminder),
    ...pending.map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    ...delivered.map(item => Notifications.dismissNotificationAsync(item.request.identifier))
  ]);
}

export async function scheduleGoalReminder(goal: Pick<ProfileGoal, "id" | "title" | "nextAction" | "frequency" | "reminderEnabled" | "reminderTime">) {
  const userId = getSessionUserId();
  if (!userId) return [];
  await cancelGoalReminder(goal.id);
  if (!goal.reminderEnabled || !goal.reminderTime) return [];
  if (!await ensureGoalReminderPermission()) throw new Error("NOTIFICATION_PERMISSION_DENIED");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: "Напоминания о целях",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180],
      lightColor: "#111111"
    });
  }

  const [hour, minute] = goal.reminderTime.split(":").map(Number);
  const weekdays = frequencyWeekdays(goal.frequency);
  const content = {
    title: goal.title,
    body: goal.nextAction || "Время сделать следующий шаг к цели.",
    data: { goalId: goal.id, screen: "plan", userId }
  };
  const identifiers = weekdays.length === 0
    ? [await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId }
      })]
    : await Promise.all(weekdays.map(weekday => Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute, channelId }
      })));

  await SecureStore.setItemAsync(`${storagePrefix}${goal.id}`, JSON.stringify(identifiers));
  return identifiers;
}

function frequencyWeekdays(frequency: ProfileGoal["frequency"]) {
  if (frequency === "weekdays") return [2, 3, 4, 5, 6];
  if (frequency === "threePerWeek") return [2, 4, 6];
  if (frequency === "weekly") return [2];
  return [];
}

function parseIdentifiers(value: string | null) {
  if (!value) return [] as string[];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [] as string[];
  }
}
