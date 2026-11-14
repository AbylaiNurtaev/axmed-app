import { randomUUID } from "crypto";
import { ApiError } from "./errors.js";
import { query } from "./database.js";
import { awardPoints, reversePoints } from "./gamificationService.js";

export type GoalInput = {
  templateKey?: string | null;
  title: string;
  category?: string;
  icon?: string;
  color?: string;
  currentValue?: number;
  startValue?: number;
  targetValue?: number;
  unit?: string;
  progress?: number;
  status?: "active" | "paused" | "completed";
  dueDate?: string | null;
  metricKey?: string;
  frequency?: "daily" | "weekdays" | "threePerWeek" | "weekly";
  reminderEnabled?: boolean;
  reminderTime?: string | null;
  nextAction?: string;
  description?: string;
};

export type GoalPatch = Partial<GoalInput> & {
  sortOrder?: number;
  localDate?: string;
  mutationId?: string;
};

type GoalRow = {
  id: string;
  template_key: string | null;
  title: string;
  category: string;
  icon: string;
  color: string;
  current_value: string;
  start_value: string;
  target_value: string;
  unit: string;
  progress: number;
  status: "active" | "paused" | "completed";
  due_date: string | null;
  metric_key: string;
  frequency: "daily" | "weekdays" | "threePerWeek" | "weekly";
  reminder_enabled: boolean;
  reminder_time: string | null;
  next_action: string;
  description: string;
  progress_source: "manual" | "bracelet" | "scale";
  source_recorded_at: Date | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type CheckinRow = { goal_id: string; completed_on: string };

const goalColumns = `id, template_key, title, category, icon, color, current_value, start_value, target_value,
  unit, progress, status, due_date::text, metric_key, frequency, reminder_enabled, reminder_time,
  next_action, description, progress_source, source_recorded_at, sort_order, created_at, updated_at`;

export async function listGoals(userId: string, referenceDate = isoDate(new Date())) {
  const result = await query<GoalRow>(
    `SELECT ${goalColumns}
       FROM profile_goals
      WHERE user_id = $1
      ORDER BY status = 'completed', sort_order ASC, created_at DESC`,
    [userId]
  );
  const since = shiftDate(referenceDate, -90);
  const checkins = await query<CheckinRow>(
    `SELECT goal_id, completed_on::text
       FROM goal_checkins
      WHERE user_id = $1 AND completed_on BETWEEN $2::date AND $3::date
      ORDER BY completed_on DESC`,
    [userId, since, referenceDate]
  );
  const byGoal = new Map<string, Set<string>>();
  for (const checkin of checkins.rows) {
    const dates = byGoal.get(checkin.goal_id) ?? new Set<string>();
    dates.add(checkin.completed_on);
    byGoal.set(checkin.goal_id, dates);
  }
  return { goals: result.rows.map(row => toGoal(row, checkinStats(byGoal.get(row.id), referenceDate))) };
}

export async function createGoal(userId: string, input: GoalInput) {
  const id = randomUUID();
  const orderResult = await query<{ next_order: number }>(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM profile_goals WHERE user_id = $1",
    [userId]
  );

  const result = await query<GoalRow>(
    `INSERT INTO profile_goals
      (id, user_id, template_key, title, category, icon, color, current_value, start_value, target_value,
       unit, progress, status, due_date, metric_key, frequency, reminder_enabled, reminder_time,
       next_action, description, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     RETURNING ${goalColumns}`,
    [
      id,
      userId,
      cleanNullable(input.templateKey),
      cleanTitle(input.title),
      cleanText(input.category ?? "Здоровье", 80),
      cleanText(input.icon ?? "flag-checkered", 60),
      cleanText(input.color ?? "#00a87e", 24),
      input.currentValue ?? 0,
      input.startValue ?? input.currentValue ?? 0,
      input.targetValue ?? 0,
      cleanText(input.unit ?? "", 24),
      clampProgress(input.progress ?? progressFromValues(input.startValue ?? input.currentValue, input.currentValue, input.targetValue)),
      input.status ?? "active",
      input.dueDate ?? null,
      cleanText(input.metricKey ?? "custom", 60),
      input.frequency ?? "daily",
      input.reminderEnabled ?? false,
      input.reminderTime ?? null,
      cleanText(input.nextAction ?? "", 160),
      cleanText(input.description ?? "", 1000),
      orderResult.rows[0]?.next_order ?? 0
    ]
  );
  return toGoal(result.rows[0]!);
}

export async function updateGoal(userId: string, goalId: string, patch: GoalPatch) {
  const currentResult = await query<GoalRow>(
    `SELECT ${goalColumns}
       FROM profile_goals
      WHERE user_id = $1 AND id = $2`,
    [userId, goalId]
  );
  const current = currentResult.rows[0];
  if (!current) throw new ApiError(404, "GOAL_NOT_FOUND", "Цель не найдена.");

  const currentValue = patch.currentValue ?? Number(current.current_value);
  const startValue = patch.startValue ?? Number(current.start_value);
  const targetValue = patch.targetValue ?? Number(current.target_value);
  const progress = patch.progress ?? progressFromValues(startValue, currentValue, targetValue);

  const result = await query<GoalRow>(
    `UPDATE profile_goals
        SET template_key = $3, title = $4, category = $5, icon = $6, color = $7,
            current_value = $8, start_value = $9, target_value = $10, unit = $11, progress = $12,
            status = $13, due_date = $14, sort_order = $15, metric_key = $16,
            frequency = $17, reminder_enabled = $18, reminder_time = $19,
            next_action = $20, description = $21, updated_at = now()
      WHERE user_id = $1 AND id = $2
      RETURNING ${goalColumns}`,
    [
      userId,
      goalId,
      patch.templateKey !== undefined ? cleanNullable(patch.templateKey) : current.template_key,
      patch.title !== undefined ? cleanTitle(patch.title) : current.title,
      patch.category !== undefined ? cleanText(patch.category, 80) : current.category,
      patch.icon !== undefined ? cleanText(patch.icon, 60) : current.icon,
      patch.color !== undefined ? cleanText(patch.color, 24) : current.color,
      currentValue,
      startValue,
      targetValue,
      patch.unit !== undefined ? cleanText(patch.unit, 24) : current.unit,
      clampProgress(progress),
      patch.status ?? current.status,
      patch.dueDate !== undefined ? patch.dueDate : current.due_date,
      patch.sortOrder ?? current.sort_order,
      patch.metricKey !== undefined ? cleanText(patch.metricKey, 60) : current.metric_key,
      patch.frequency ?? current.frequency,
      patch.reminderEnabled ?? current.reminder_enabled,
      patch.reminderTime !== undefined ? patch.reminderTime : current.reminder_time,
      patch.nextAction !== undefined ? cleanText(patch.nextAction, 160) : current.next_action,
      patch.description !== undefined ? cleanText(patch.description, 1000) : current.description
    ]
  );
  const updated = toGoal(result.rows[0]!);
  const eventDate = patch.localDate ?? isoDate(new Date());
  if (patch.status === "completed" && current.status !== "completed") {
    await query(`INSERT INTO goal_activity_events (id,user_id,goal_id,event_key,event_type,source,metadata)
      VALUES ($1,$2,$3,$4,'completed','manual',$5::jsonb) ON CONFLICT (user_id,event_key) DO NOTHING`,
    [randomUUID(), userId, goalId, `goal-complete:${goalId}`, JSON.stringify({ mutationId: patch.mutationId ?? null, localDate: eventDate })]);
    await awardPoints(userId, { eventKey: `goal-complete:${goalId}`, eventType: "goalCompleted", sourceType: "goal", sourceId: goalId, points: 40, localDate: eventDate });
  } else if (patch.status && patch.status !== "completed" && current.status === "completed") {
    await reversePoints(userId, `goal-complete:${goalId}`);
    await query(`INSERT INTO goal_activity_events (id,user_id,goal_id,event_key,event_type,source,metadata)
      VALUES ($1,$2,$3,$4,'reopened','manual',$5::jsonb) ON CONFLICT (user_id,event_key) DO NOTHING`,
    [randomUUID(), userId, goalId, `goal-reopen:${goalId}:${patch.mutationId ?? randomUUID()}`, JSON.stringify({ localDate: eventDate })]);
  }
  return updated;
}

export async function deleteGoal(userId: string, goalId: string) {
  const result = await query("DELETE FROM profile_goals WHERE user_id = $1 AND id = $2", [userId, goalId]);
  if (result.rowCount === 0) throw new ApiError(404, "GOAL_NOT_FOUND", "Цель не найдена.");
}

export async function completeGoalAction(userId: string, goalId: string, localDate: string) {
  const goal = await query<{ id: string }>("SELECT id FROM profile_goals WHERE user_id = $1 AND id = $2", [userId, goalId]);
  if (!goal.rows[0]) throw new ApiError(404, "GOAL_NOT_FOUND", "Цель не найдена.");
  await query(
    `INSERT INTO goal_checkins (id, user_id, goal_id, completed_on)
     VALUES ($1, $2, $3, $4::date)
     ON CONFLICT (goal_id, completed_on) DO NOTHING`,
    [randomUUID(), userId, goalId, localDate]
  );
  await awardPoints(userId, { eventKey: `goal-action:${goalId}:${localDate}`, eventType: "goalAction", sourceType: "goal", sourceId: goalId, points: 5, localDate });
}

export async function undoGoalAction(userId: string, goalId: string, localDate: string) {
  await query(
    "DELETE FROM goal_checkins WHERE user_id = $1 AND goal_id = $2 AND completed_on = $3::date",
    [userId, goalId, localDate]
  );
  await reversePoints(userId, `goal-action:${goalId}:${localDate}`);
}

function progressFromValues(start?: number, current?: number, target?: number) {
  if (target === undefined || start === undefined || target === start) return 0;
  return Math.round((((current ?? start) - start) / (target - start)) * 100);
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanNullable(value?: string | null) {
  const cleaned = value?.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function cleanText(value: string, max: number) {
  return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanTitle(value: string) {
  const title = cleanText(value, 140);
  if (!title) throw new ApiError(400, "INVALID_GOAL", "Укажите название цели.");
  return title;
}

function toGoal(row: GoalRow, stats = { completedToday: false, weeklyCompletedActions: 0, streakDays: 0 }) {
  return {
    id: row.id,
    templateKey: row.template_key,
    title: row.title,
    category: row.category,
    icon: row.icon,
    color: row.color,
    currentValue: Number(row.current_value),
    startValue: Number(row.start_value),
    targetValue: Number(row.target_value),
    unit: row.unit,
    progress: row.progress,
    status: row.status,
    dueDate: row.due_date,
    metricKey: row.metric_key,
    frequency: row.frequency,
    reminderEnabled: row.reminder_enabled,
    reminderTime: row.reminder_time,
    nextAction: row.next_action,
    description: row.description,
    progressSource: row.progress_source,
    sourceRecordedAt: row.source_recorded_at?.toISOString() ?? null,
    ...stats,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function checkinStats(dates = new Set<string>(), referenceDate: string) {
  const completedToday = dates.has(referenceDate);
  let weeklyCompletedActions = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    if (dates.has(shiftDate(referenceDate, -offset))) weeklyCompletedActions += 1;
  }
  let streakDays = 0;
  let offset = completedToday ? 0 : 1;
  while (dates.has(shiftDate(referenceDate, -offset))) {
    streakDays += 1;
    offset += 1;
  }
  return { completedToday, weeklyCompletedActions, streakDays };
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
