import type { ProfileGoal, ProfileGoalInput } from "../auth/authApi";

export type GoalTemplate = ProfileGoalInput & {
  templateKey: string;
  description: string;
  tracking: string;
  categoryGroup: "Тело" | "Активность" | "Восстановление" | "Привычки";
};

export const goalTemplates: readonly GoalTemplate[] = [
  { templateKey: "weight-loss", title: "Снижение веса", description: "Двигайтесь к комфортному весу без резких оценок.", tracking: "Вес и еженедельные измерения", categoryGroup: "Тело", category: "Состав тела", icon: "scale-bathroom", color: "#237354", metricKey: "weight", startValue: 0, currentValue: 0, targetValue: 0, unit: "кг", frequency: "weekly", nextAction: "Взвеситься утром", progress: 0 },
  { templateKey: "weight-maintain", title: "Поддержание веса", description: "Следите за стабильностью веса в выбранном диапазоне.", tracking: "Вес и регулярность измерений", categoryGroup: "Тело", category: "Состав тела", icon: "scale-balance", color: "#4E83C4", metricKey: "weight", startValue: 0, currentValue: 0, targetValue: 0, unit: "кг", frequency: "weekly", nextAction: "Записать контрольный вес", progress: 0 },
  { templateKey: "activity", title: "Повышение активности", description: "Добавьте больше движения в обычный день.", tracking: "Активные дни и выполненные действия", categoryGroup: "Активность", category: "Активность", icon: "run", color: "#E66D52", metricKey: "activeDays", startValue: 0, currentValue: 0, targetValue: 5, unit: "дней/нед", frequency: "weekdays", nextAction: "Сделать активную прогулку", progress: 0 },
  { templateKey: "sleep", title: "Улучшение сна", description: "Сформируйте более стабильный режим восстановления.", tracking: "Длительность сна и регулярность", categoryGroup: "Восстановление", category: "Восстановление", icon: "sleep", color: "#7167B8", metricKey: "sleepDuration", startValue: 7, currentValue: 7, targetValue: 8, unit: "ч", frequency: "daily", nextAction: "Лечь спать по расписанию", progress: 0 },
  { templateKey: "water", title: "Контроль воды", description: "Поддерживайте выбранный дневной ритм воды.", tracking: "Выполненные дни и дневная цель", categoryGroup: "Привычки", category: "Привычки", icon: "cup-water", color: "#4E83C4", metricKey: "water", startValue: 0, currentValue: 0, targetValue: 8, unit: "стаканов", frequency: "daily", nextAction: "Отметить воду за день", progress: 0 },
  { templateKey: "measurements", title: "Регулярные измерения", description: "Не пропускайте контрольные измерения на весах.", tracking: "Количество измерений за неделю", categoryGroup: "Привычки", category: "Измерения", icon: "chart-timeline-variant", color: "#E6A93D", metricKey: "measurements", startValue: 0, currentValue: 0, targetValue: 3, unit: "раза/нед", frequency: "threePerWeek", nextAction: "Провести измерение на весах", progress: 0 },
  { templateKey: "steps", title: "Больше шагов", description: "Постепенно увеличивайте ежедневную активность.", tracking: "Шаги по данным браслета", categoryGroup: "Активность", category: "Активность", icon: "shoe-sneaker", color: "#237354", metricKey: "steps", startValue: 6000, currentValue: 6000, targetValue: 8000, unit: "шагов", frequency: "daily", nextAction: "Выполнить дневную цель шагов", progress: 0 },
  { templateKey: "custom", title: "Своя цель", description: "Настройте показатель и ритм под себя.", tracking: "Вы выбираете, что отслеживать", categoryGroup: "Привычки", category: "Личная цель", icon: "pencil-outline", color: "#237354", metricKey: "custom", startValue: 0, currentValue: 0, targetValue: 1, unit: "", frequency: "daily", nextAction: "Сделать первый шаг", progress: 0 }
];

export const metricOptions = [
  { key: "weight", label: "Вес", unit: "кг", icon: "scale-bathroom" },
  { key: "steps", label: "Шаги", unit: "шагов", icon: "shoe-sneaker" },
  { key: "sleepDuration", label: "Сон", unit: "ч", icon: "sleep" },
  { key: "water", label: "Вода", unit: "стаканов", icon: "cup-water" },
  { key: "measurements", label: "Измерения", unit: "раза/нед", icon: "chart-timeline-variant" },
  { key: "activeDays", label: "Активные дни", unit: "дней/нед", icon: "run" },
  { key: "custom", label: "Свой показатель", unit: "", icon: "tune-variant" }
] as const;

export function calculateGoalProgress(startValue: number, currentValue: number, targetValue: number) {
  if (![startValue, currentValue, targetValue].every(Number.isFinite) || startValue === targetValue) return 0;
  return Math.max(0, Math.min(100, Math.round(((currentValue - startValue) / (targetValue - startValue)) * 100)));
}

export function summarizePlan(goals: readonly ProfileGoal[]) {
  let activeCount = 0;
  let completedCount = 0;
  let progressTotal = 0;
  let weeklyActions = 0;
  let streakDays = 0;
  for (const goal of goals) {
    if (goal.status === "completed") completedCount += 1;
    if (goal.status === "active") {
      activeCount += 1;
      progressTotal += goal.progress;
      weeklyActions += goal.weeklyCompletedActions;
      streakDays = Math.max(streakDays, goal.streakDays);
    }
  }
  return {
    activeCount,
    completedCount,
    progress: activeCount ? Math.round(progressTotal / activeCount) : 0,
    weeklyActions,
    streakDays
  };
}

export function localDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateAfter(days: number, from = new Date()) {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return localDate(result);
}

export function frequencyLabel(value: ProfileGoal["frequency"]) {
  return ({ daily: "Каждый день", weekdays: "По будням", threePerWeek: "3 раза в неделю", weekly: "Раз в неделю" } as const)[value];
}
