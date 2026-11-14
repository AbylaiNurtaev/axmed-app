import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { inTransaction, query } from "./database.js";
import type { DeviceSyncInput } from "./deviceSchemas.js";
import { ApiError } from "./errors.js";
import { awardPoints, loadGamification, reversePoints } from "./gamificationService.js";
import { listGoals } from "./goalService.js";

export type TaskInput = {
  goalId?: string | null;
  title: string;
  notes?: string;
  dueAt?: string | null;
  dueLocalDate?: string | null;
  timeZone: string;
  recurrence?: "none" | "daily" | "weekdays" | "weekly" | "custom";
  recurrenceDays?: number[];
  reminderEnabled?: boolean;
  reminderMinutesBefore?: number;
  status?: "active" | "archived";
};

export type HabitInput = {
  goalId?: string | null;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  scheduleType: "daily" | "weekdays" | "days" | "timesPerWeek" | "custom";
  scheduleDays?: number[];
  targetPerWeek?: number;
  reminderEnabled?: boolean;
  reminderTime?: string | null;
  status?: "active" | "paused" | "archived";
};

type TaskRow = {
  id: string; goal_id: string | null; title: string; notes: string; due_at: Date | null;
  due_local_date: string | null; time_zone: string; recurrence: TaskInput["recurrence"];
  recurrence_days: number[]; reminder_enabled: boolean; reminder_minutes_before: number;
  status: "active" | "archived"; created_at: Date; updated_at: Date;
};
type HabitRow = {
  id: string; goal_id: string | null; title: string; description: string; icon: string; color: string;
  schedule_type: HabitInput["scheduleType"]; schedule_days: number[]; target_per_week: number;
  reminder_enabled: boolean; reminder_time: string | null; status: "active" | "paused" | "archived";
  created_at: Date; updated_at: Date;
};
type EventRow = { source_id: string; local_date: string; status: "completed" | "skipped"; occurred_at: Date };

export async function loadPlanWorkspace(userId: string, referenceDate: string, timeZone: string) {
  const since = shiftDate(referenceDate, -90);
  const [goalsPayload, tasksResult, habitsResult, taskEvents, habitEvents, goalHistory, gamification] = await Promise.all([
    listGoals(userId, referenceDate),
    query<TaskRow>(`SELECT id, goal_id, title, notes, due_at, due_local_date::text, time_zone, recurrence,
      recurrence_days, reminder_enabled, reminder_minutes_before, status, created_at, updated_at
      FROM plan_tasks WHERE user_id = $1 AND status <> 'archived' ORDER BY due_local_date NULLS LAST, created_at DESC`, [userId]),
    query<HabitRow>(`SELECT id, goal_id, title, description, icon, color, schedule_type, schedule_days,
      target_per_week, reminder_enabled, reminder_time, status, created_at, updated_at
      FROM plan_habits WHERE user_id = $1 AND status <> 'archived' ORDER BY created_at DESC`, [userId]),
    query<EventRow>(`SELECT task_id AS source_id, occurrence_date::text AS local_date, status, occurred_at
      FROM plan_task_events WHERE user_id = $1 AND occurrence_date BETWEEN $2::date AND $3::date`, [userId, since, referenceDate]),
    query<EventRow>(`SELECT habit_id AS source_id, local_date::text, status, occurred_at
      FROM plan_habit_events WHERE user_id = $1 AND local_date BETWEEN $2::date AND $3::date`, [userId, since, referenceDate]),
    query<{ goal_id: string; event_type: string; source: string; value: string | null; unit: string | null; occurred_at: Date }>(`
      SELECT goal_id, event_type, source, value, unit, occurred_at FROM goal_activity_events
       WHERE user_id = $1 ORDER BY occurred_at DESC LIMIT 500`, [userId]),
    loadGamification(userId, referenceDate)
  ]);

  const taskEventsById = groupEvents(taskEvents.rows);
  const habitEventsById = groupEvents(habitEvents.rows);
  const tasks = tasksResult.rows.map(row => taskFromRow(row, taskEventsById.get(row.id), referenceDate));
  const habits = habitsResult.rows.map(row => habitFromRow(row, habitEventsById.get(row.id), referenceDate));
  const historyByGoal = new Map<string, unknown[]>();
  for (const event of goalHistory.rows) {
    const entries = historyByGoal.get(event.goal_id) ?? [];
    entries.push({ type: event.event_type, source: event.source, value: event.value === null ? null : Number(event.value), unit: event.unit, occurredAt: event.occurred_at.toISOString() });
    historyByGoal.set(event.goal_id, entries);
  }
  const goals = goalsPayload.goals.map(goal => ({
    ...goal,
    tasks: tasks.filter(task => task.goalId === goal.id),
    habits: habits.filter(habit => habit.goalId === goal.id),
    history: historyByGoal.get(goal.id) ?? []
  }));
  const calendar = buildCalendar(referenceDate, taskEvents.rows, habitEvents.rows, gamification.monthActivity);
  return { referenceDate, timeZone, goals, tasks, habits, calendar, gamification };
}

export async function createTask(userId: string, input: TaskInput) {
  await assertGoalOwnership(userId, input.goalId);
  const result = await query<TaskRow>(`INSERT INTO plan_tasks
    (id, user_id, goal_id, title, notes, due_at, due_local_date, time_zone, recurrence, recurrence_days,
     reminder_enabled, reminder_minutes_before, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
    RETURNING id, goal_id, title, notes, due_at, due_local_date::text, time_zone, recurrence,
      recurrence_days, reminder_enabled, reminder_minutes_before, status, created_at, updated_at`, [
    randomUUID(), userId, input.goalId ?? null, input.title, input.notes ?? "", input.dueAt ?? null,
    input.dueLocalDate ?? null, input.timeZone, input.recurrence ?? "none", JSON.stringify(input.recurrenceDays ?? []),
    input.reminderEnabled ?? false, input.reminderMinutesBefore ?? 0, input.status ?? "active"
  ]);
  return taskFromRow(result.rows[0]!, undefined, input.dueLocalDate ?? isoDate(new Date()));
}

export async function updateTask(userId: string, taskId: string, patch: Partial<TaskInput>) {
  const current = await ownedTask(userId, taskId);
  await assertGoalOwnership(userId, patch.goalId);
  const input = { ...taskToInput(current), ...patch };
  const result = await query<TaskRow>(`UPDATE plan_tasks SET goal_id=$3,title=$4,notes=$5,due_at=$6,due_local_date=$7,
    time_zone=$8,recurrence=$9,recurrence_days=$10::jsonb,reminder_enabled=$11,reminder_minutes_before=$12,
    status=$13,updated_at=now() WHERE user_id=$1 AND id=$2
    RETURNING id, goal_id, title, notes, due_at, due_local_date::text, time_zone, recurrence,
      recurrence_days, reminder_enabled, reminder_minutes_before, status, created_at, updated_at`, [
    userId, taskId, input.goalId ?? null, input.title, input.notes ?? "", input.dueAt ?? null,
    input.dueLocalDate ?? null, input.timeZone, input.recurrence ?? "none", JSON.stringify(input.recurrenceDays ?? []),
    input.reminderEnabled ?? false, input.reminderMinutesBefore ?? 0, input.status ?? "active"
  ]);
  return taskFromRow(result.rows[0]!, undefined, input.dueLocalDate ?? isoDate(new Date()));
}

export async function deleteTask(userId: string, taskId: string) {
  const result = await query("DELETE FROM plan_tasks WHERE user_id=$1 AND id=$2", [userId, taskId]);
  if (!result.rowCount) throw new ApiError(404, "TASK_NOT_FOUND", "Задача не найдена.");
}

export async function setTaskEvent(userId: string, taskId: string, localDate: string, status: "completed" | "skipped", mutationId: string) {
  const transition = await inTransaction(async client => {
    const task = await ownedTaskWithClient(client, userId, taskId);
    const previous = await client.query<{ status: string }>("SELECT status FROM plan_task_events WHERE task_id=$1 AND occurrence_date=$2::date FOR UPDATE", [taskId, localDate]);
    const oldStatus = previous.rows[0]?.status;
    await client.query(`INSERT INTO plan_task_events (id,user_id,task_id,occurrence_date,status)
      VALUES ($1,$2,$3,$4::date,$5) ON CONFLICT (task_id,occurrence_date)
      DO UPDATE SET status=EXCLUDED.status, occurred_at=now()`, [randomUUID(), userId, taskId, localDate, status]);
    const delta = status === "completed" && oldStatus !== "completed" ? 1 : status !== "completed" && oldStatus === "completed" ? -1 : 0;
    if (delta && task.goal_id) await incrementGoal(client, userId, task.goal_id, delta, `task:${taskId}:${localDate}:${mutationId}`, "task", localDate);
    return { oldStatus, status };
  });
  const pointKey = `task:${taskId}:${localDate}`;
  if (transition.status === "completed") await awardPoints(userId, { eventKey: pointKey, eventType: "taskCompleted", sourceType: "task", sourceId: taskId, points: 5, localDate });
  else if (transition.oldStatus === "completed") await reversePoints(userId, pointKey);
}

export async function undoTaskEvent(userId: string, taskId: string, localDate: string) {
  const wasCompleted = await inTransaction(async client => {
    const task = await ownedTaskWithClient(client, userId, taskId);
    const previous = await client.query<{ status: string }>("DELETE FROM plan_task_events WHERE user_id=$1 AND task_id=$2 AND occurrence_date=$3::date RETURNING status", [userId, taskId, localDate]);
    const completed = previous.rows[0]?.status === "completed";
    if (completed && task.goal_id) await incrementGoal(client, userId, task.goal_id, -1, `task-undo:${taskId}:${localDate}:${randomUUID()}`, "taskUndo", localDate);
    return completed;
  });
  if (wasCompleted) await reversePoints(userId, `task:${taskId}:${localDate}`);
}

export async function createHabit(userId: string, input: HabitInput) {
  await assertGoalOwnership(userId, input.goalId);
  const result = await query<HabitRow>(`INSERT INTO plan_habits
    (id,user_id,goal_id,title,description,icon,color,schedule_type,schedule_days,target_per_week,reminder_enabled,reminder_time,status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
    RETURNING id,goal_id,title,description,icon,color,schedule_type,schedule_days,target_per_week,
      reminder_enabled,reminder_time,status,created_at,updated_at`, [randomUUID(), userId, input.goalId ?? null,
      input.title, input.description ?? "", input.icon ?? "leaf-outline", input.color ?? "#237354",
      input.scheduleType, JSON.stringify(input.scheduleDays ?? []), input.targetPerWeek ?? 7,
      input.reminderEnabled ?? false, input.reminderTime ?? null, input.status ?? "active"]);
  return habitFromRow(result.rows[0]!, undefined, isoDate(new Date()));
}

export async function updateHabit(userId: string, habitId: string, patch: Partial<HabitInput>) {
  const current = await ownedHabit(userId, habitId);
  await assertGoalOwnership(userId, patch.goalId);
  const input = { ...habitToInput(current), ...patch };
  const result = await query<HabitRow>(`UPDATE plan_habits SET goal_id=$3,title=$4,description=$5,icon=$6,color=$7,
    schedule_type=$8,schedule_days=$9::jsonb,target_per_week=$10,reminder_enabled=$11,reminder_time=$12,
    status=$13,updated_at=now() WHERE user_id=$1 AND id=$2 RETURNING id,goal_id,title,description,icon,color,
    schedule_type,schedule_days,target_per_week,reminder_enabled,reminder_time,status,created_at,updated_at`, [
    userId, habitId, input.goalId ?? null, input.title, input.description ?? "", input.icon ?? "leaf-outline",
    input.color ?? "#237354", input.scheduleType, JSON.stringify(input.scheduleDays ?? []), input.targetPerWeek ?? 7,
    input.reminderEnabled ?? false, input.reminderTime ?? null, input.status ?? "active"
  ]);
  return habitFromRow(result.rows[0]!, undefined, isoDate(new Date()));
}

export async function deleteHabit(userId: string, habitId: string) {
  const result = await query("DELETE FROM plan_habits WHERE user_id=$1 AND id=$2", [userId, habitId]);
  if (!result.rowCount) throw new ApiError(404, "HABIT_NOT_FOUND", "Привычка не найдена.");
}

export async function setHabitEvent(userId: string, habitId: string, localDate: string, status: "completed" | "skipped", mutationId: string) {
  const transition = await inTransaction(async client => {
    const habit = await ownedHabitWithClient(client, userId, habitId);
    const previous = await client.query<{ status: string }>("SELECT status FROM plan_habit_events WHERE habit_id=$1 AND local_date=$2::date FOR UPDATE", [habitId, localDate]);
    const oldStatus = previous.rows[0]?.status;
    await client.query(`INSERT INTO plan_habit_events (id,user_id,habit_id,local_date,status)
      VALUES ($1,$2,$3,$4::date,$5) ON CONFLICT (habit_id,local_date)
      DO UPDATE SET status=EXCLUDED.status, occurred_at=now()`, [randomUUID(), userId, habitId, localDate, status]);
    const delta = status === "completed" && oldStatus !== "completed" ? 1 : status !== "completed" && oldStatus === "completed" ? -1 : 0;
    if (delta && habit.goal_id) await incrementGoal(client, userId, habit.goal_id, delta, `habit:${habitId}:${localDate}:${mutationId}`, "habit", localDate);
    return { oldStatus, status };
  });
  const pointKey = `habit:${habitId}:${localDate}`;
  if (transition.status === "completed") await awardPoints(userId, { eventKey: pointKey, eventType: "habitCompleted", sourceType: "habit", sourceId: habitId, points: 6, localDate });
  else if (transition.oldStatus === "completed") await reversePoints(userId, pointKey);
}

export async function undoHabitEvent(userId: string, habitId: string, localDate: string) {
  const wasCompleted = await inTransaction(async client => {
    const habit = await ownedHabitWithClient(client, userId, habitId);
    const previous = await client.query<{ status: string }>("DELETE FROM plan_habit_events WHERE user_id=$1 AND habit_id=$2 AND local_date=$3::date RETURNING status", [userId, habitId, localDate]);
    const completed = previous.rows[0]?.status === "completed";
    if (completed && habit.goal_id) await incrementGoal(client, userId, habit.goal_id, -1, `habit-undo:${habitId}:${localDate}:${randomUUID()}`, "habitUndo", localDate);
    return completed;
  });
  if (wasCompleted) await reversePoints(userId, `habit:${habitId}:${localDate}`);
}

export async function updateGoalManually(userId: string, goalId: string, value: number, mutationId: string, localDate: string) {
  return inTransaction(async client => {
    const existing = await client.query("SELECT 1 FROM goal_activity_events WHERE user_id=$1 AND event_key=$2", [userId, `manual:${goalId}:${mutationId}`]);
    const goal = await client.query<{ start_value: string; target_value: string; unit: string }>("SELECT start_value,target_value,unit FROM profile_goals WHERE user_id=$1 AND id=$2 FOR UPDATE", [userId, goalId]);
    if (!goal.rows[0]) throw new ApiError(404, "GOAL_NOT_FOUND", "Цель не найдена.");
    if (existing.rowCount) return;
    const row = goal.rows[0];
    const progress = progressFromValues(Number(row.start_value), value, Number(row.target_value));
    await client.query("UPDATE profile_goals SET current_value=$3,progress=$4,progress_source='manual',source_recorded_at=now(),updated_at=now() WHERE user_id=$1 AND id=$2", [userId, goalId, value, progress]);
    await client.query(`INSERT INTO goal_activity_events (id,user_id,goal_id,event_key,event_type,source,value,unit,metadata)
      VALUES ($1,$2,$3,$4,'progress','manual',$5,$6,$7::jsonb)`, [randomUUID(), userId, goalId, `manual:${goalId}:${mutationId}`, value, row.unit, JSON.stringify({ localDate })]);
  });
}

export async function applyDeviceSyncToPlan(userId: string, input: DeviceSyncInput) {
  const supported = new Set(["weight", "steps", "sleepDuration"]);
  const latest = new Map<string, DeviceSyncInput["samples"][number]>();
  for (const sample of input.samples) {
    if (!supported.has(sample.metric) || sample.origin === "mock") continue;
    const previous = latest.get(sample.metric);
    if (!previous || previous.recordedAt < sample.recordedAt) latest.set(sample.metric, sample);
  }
  for (const [metric, sample] of latest) {
    const goals = await query<{ id: string; start_value: string; target_value: string; source_recorded_at: Date | null; unit: string }>(`
      SELECT id,start_value,target_value,source_recorded_at,unit FROM profile_goals
       WHERE user_id=$1 AND status='active' AND metric_key=$2`, [userId, metric]);
    for (const goal of goals.rows) {
      if (goal.source_recorded_at && goal.source_recorded_at.toISOString() >= sample.recordedAt) continue;
      const value = metric === "sleepDuration" ? sample.value / 60 : sample.value;
      const source = input.device.kind === "scale" ? "scale" : "bracelet";
      const eventKey = `device:${goal.id}:${metric}:${sample.sourceRecordId}`;
      await query(`UPDATE profile_goals SET current_value=$3,progress=$4,progress_source=$5,source_recorded_at=$6,updated_at=now()
        WHERE user_id=$1 AND id=$2`, [userId, goal.id, value, progressFromValues(Number(goal.start_value), value, Number(goal.target_value)), source, sample.recordedAt]);
      await query(`INSERT INTO goal_activity_events (id,user_id,goal_id,event_key,event_type,source,value,unit,metadata)
        VALUES ($1,$2,$3,$4,'progress',$5,$6,$7,$8::jsonb) ON CONFLICT (user_id,event_key) DO NOTHING`, [
        randomUUID(), userId, goal.id, eventKey, source, value, metric === "sleepDuration" ? "ч" : sample.unit,
        JSON.stringify({ sourceRecordId: sample.sourceRecordId, recordedAt: sample.recordedAt })
      ]);
    }
    if (metric === "steps" && sample.value >= 7000) await awardPoints(userId, { eventKey: `device-activity:${sample.localDate}`, eventType: "dailyActivity", sourceType: "device", sourceId: input.device.id, points: 10, localDate: sample.localDate });
    if (metric === "sleepDuration" && sample.value >= 420) await awardPoints(userId, { eventKey: `device-sleep:${sample.localDate}`, eventType: "regularSleep", sourceType: "device", sourceId: input.device.id, points: 8, localDate: sample.localDate });
    if (metric === "weight") await awardPoints(userId, { eventKey: `device-weight:${sample.localDate}`, eventType: "weightMeasurement", sourceType: "device", sourceId: input.device.id, points: 4, localDate: sample.localDate });
  }
}

function groupEvents(rows: EventRow[]) {
  const map = new Map<string, EventRow[]>();
  for (const row of rows) map.set(row.source_id, [...(map.get(row.source_id) ?? []), row]);
  return map;
}

function taskFromRow(row: TaskRow, events: EventRow[] = [], referenceDate: string) {
  const current = events.find(event => event.local_date === referenceDate);
  return { id: row.id, goalId: row.goal_id, title: row.title, notes: row.notes, dueAt: row.due_at?.toISOString() ?? null,
    dueLocalDate: row.due_local_date, timeZone: row.time_zone, recurrence: row.recurrence ?? "none",
    recurrenceDays: row.recurrence_days ?? [], reminderEnabled: row.reminder_enabled,
    reminderMinutesBefore: row.reminder_minutes_before, status: row.status, scheduledToday: taskScheduled(row, referenceDate),
    todayStatus: current?.status ?? null, history: events.map(event => ({ localDate: event.local_date, status: event.status, occurredAt: event.occurred_at.toISOString() })),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

function habitFromRow(row: HabitRow, events: EventRow[] = [], referenceDate: string) {
  const completed = new Set(events.filter(event => event.status === "completed").map(event => event.local_date));
  const current = events.find(event => event.local_date === referenceDate);
  const weekStart = shiftDate(referenceDate, -6);
  const weekCompleted = events.filter(event => event.status === "completed" && event.local_date >= weekStart).length;
  return { id: row.id, goalId: row.goal_id, title: row.title, description: row.description, icon: row.icon, color: row.color,
    scheduleType: row.schedule_type, scheduleDays: row.schedule_days ?? [], targetPerWeek: row.target_per_week,
    reminderEnabled: row.reminder_enabled, reminderTime: row.reminder_time, status: row.status,
    scheduledToday: habitScheduled(row, referenceDate), todayStatus: current?.status ?? null,
    streakDays: dateStreak(completed, referenceDate), weekCompleted,
    weekProgress: Math.min(100, Math.round((weekCompleted / Math.max(1, row.target_per_week)) * 100)),
    history: events.map(event => ({ localDate: event.local_date, status: event.status, occurredAt: event.occurred_at.toISOString() })),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

function buildCalendar(referenceDate: string, taskEvents: EventRow[], habitEvents: EventRow[], points: Array<{ date: string; points: number }>) {
  const pointMap = new Map(points.map(item => [item.date, item.points]));
  return Array.from({ length: 35 }, (_, index) => {
    const date = shiftDate(referenceDate, index - 34);
    return { date, tasks: taskEvents.filter(event => event.local_date === date && event.status === "completed").length,
      habits: habitEvents.filter(event => event.local_date === date && event.status === "completed").length,
      points: pointMap.get(date) ?? 0 };
  });
}

function taskScheduled(row: TaskRow, date: string) {
  if (row.status !== "active") return false;
  if (row.recurrence === "none") return row.due_local_date === date;
  if (row.due_local_date && date < row.due_local_date) return false;
  const day = isoWeekday(date);
  if (row.recurrence === "daily") return true;
  if (row.recurrence === "weekdays") return day <= 5;
  if (row.recurrence === "weekly") return day === (row.recurrence_days?.[0] ?? isoWeekday(row.due_local_date ?? date));
  return (row.recurrence_days ?? []).includes(day);
}

function habitScheduled(row: HabitRow, date: string) {
  if (row.status !== "active") return false;
  const day = isoWeekday(date);
  if (row.schedule_type === "daily" || row.schedule_type === "timesPerWeek" || row.schedule_type === "custom") return true;
  if (row.schedule_type === "weekdays") return day <= 5;
  return (row.schedule_days ?? []).includes(day);
}

async function incrementGoal(client: PoolClient, userId: string, goalId: string, delta: number, eventKey: string, eventType: string, localDate: string) {
  const goal = await client.query<{ start_value: string; current_value: string; target_value: string; unit: string }>("SELECT start_value,current_value,target_value,unit FROM profile_goals WHERE user_id=$1 AND id=$2 FOR UPDATE", [userId, goalId]);
  if (!goal.rows[0]) return;
  const oldValue = Number(goal.rows[0].current_value);
  const nextValue = Math.max(0, oldValue + delta);
  await client.query("UPDATE profile_goals SET current_value=$3,progress=$4,progress_source='manual',updated_at=now() WHERE user_id=$1 AND id=$2", [userId, goalId, nextValue, progressFromValues(Number(goal.rows[0].start_value), nextValue, Number(goal.rows[0].target_value))]);
  await client.query(`INSERT INTO goal_activity_events (id,user_id,goal_id,event_key,event_type,source,value,unit,metadata)
    VALUES ($1,$2,$3,$4,$5,'plan',$6,$7,$8::jsonb) ON CONFLICT (user_id,event_key) DO NOTHING`, [randomUUID(), userId, goalId, eventKey, eventType, nextValue, goal.rows[0].unit, JSON.stringify({ localDate, delta })]);
}

async function assertGoalOwnership(userId: string, goalId?: string | null) {
  if (!goalId) return;
  const result = await query("SELECT 1 FROM profile_goals WHERE user_id=$1 AND id=$2", [userId, goalId]);
  if (!result.rowCount) throw new ApiError(404, "GOAL_NOT_FOUND", "Связанная цель не найдена.");
}

async function ownedTask(userId: string, taskId: string) {
  const result = await query<TaskRow>("SELECT * FROM plan_tasks WHERE user_id=$1 AND id=$2", [userId, taskId]);
  if (!result.rows[0]) throw new ApiError(404, "TASK_NOT_FOUND", "Задача не найдена.");
  return result.rows[0];
}
async function ownedTaskWithClient(client: PoolClient, userId: string, taskId: string) {
  const result = await client.query<TaskRow>("SELECT * FROM plan_tasks WHERE user_id=$1 AND id=$2 FOR UPDATE", [userId, taskId]);
  if (!result.rows[0]) throw new ApiError(404, "TASK_NOT_FOUND", "Задача не найдена.");
  return result.rows[0];
}
async function ownedHabit(userId: string, habitId: string) {
  const result = await query<HabitRow>("SELECT * FROM plan_habits WHERE user_id=$1 AND id=$2", [userId, habitId]);
  if (!result.rows[0]) throw new ApiError(404, "HABIT_NOT_FOUND", "Привычка не найдена.");
  return result.rows[0];
}
async function ownedHabitWithClient(client: PoolClient, userId: string, habitId: string) {
  const result = await client.query<HabitRow>("SELECT * FROM plan_habits WHERE user_id=$1 AND id=$2 FOR UPDATE", [userId, habitId]);
  if (!result.rows[0]) throw new ApiError(404, "HABIT_NOT_FOUND", "Привычка не найдена.");
  return result.rows[0];
}

function taskToInput(row: TaskRow): TaskInput { return { goalId: row.goal_id, title: row.title, notes: row.notes, dueAt: row.due_at?.toISOString() ?? null, dueLocalDate: row.due_local_date, timeZone: row.time_zone, recurrence: row.recurrence, recurrenceDays: row.recurrence_days, reminderEnabled: row.reminder_enabled, reminderMinutesBefore: row.reminder_minutes_before, status: row.status }; }
function habitToInput(row: HabitRow): HabitInput { return { goalId: row.goal_id, title: row.title, description: row.description, icon: row.icon, color: row.color, scheduleType: row.schedule_type!, scheduleDays: row.schedule_days, targetPerWeek: row.target_per_week, reminderEnabled: row.reminder_enabled, reminderTime: row.reminder_time, status: row.status }; }
function progressFromValues(start: number, current: number, target: number) { return start === target ? 0 : Math.max(0, Math.min(100, Math.round(((current - start) / (target - start)) * 100))); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T12:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return isoDate(date); }
function isoWeekday(value: string) { const day = new Date(`${value}T12:00:00.000Z`).getUTCDay(); return day === 0 ? 7 : day; }
function dateStreak(dates: Set<string>, referenceDate: string) { let offset = dates.has(referenceDate) ? 0 : 1; let streak = 0; while (dates.has(shiftDate(referenceDate, -offset))) { streak += 1; offset += 1; } return streak; }
