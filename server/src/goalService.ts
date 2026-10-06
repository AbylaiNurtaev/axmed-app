import { randomUUID } from "crypto";
import { ApiError } from "./errors.js";
import { query } from "./database.js";

export type GoalInput = {
  templateKey?: string | null;
  title: string;
  category?: string;
  icon?: string;
  color?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  progress?: number;
  status?: "active" | "paused" | "completed";
  dueDate?: string | null;
};

export type GoalPatch = Partial<GoalInput> & {
  sortOrder?: number;
};

type GoalRow = {
  id: string;
  template_key: string | null;
  title: string;
  category: string;
  icon: string;
  color: string;
  current_value: string;
  target_value: string;
  unit: string;
  progress: number;
  status: "active" | "paused" | "completed";
  due_date: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export async function listGoals(userId: string) {
  const result = await query<GoalRow>(
    `SELECT id, template_key, title, category, icon, color, current_value, target_value,
            unit, progress, status, due_date::text, sort_order, created_at, updated_at
       FROM profile_goals
      WHERE user_id = $1
      ORDER BY status = 'completed', sort_order ASC, created_at DESC`,
    [userId]
  );
  return { goals: result.rows.map(toGoal) };
}

export async function createGoal(userId: string, input: GoalInput) {
  const id = randomUUID();
  const orderResult = await query<{ next_order: number }>(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM profile_goals WHERE user_id = $1",
    [userId]
  );

  const result = await query<GoalRow>(
    `INSERT INTO profile_goals
      (id, user_id, template_key, title, category, icon, color, current_value, target_value,
       unit, progress, status, due_date, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id, template_key, title, category, icon, color, current_value, target_value,
               unit, progress, status, due_date::text, sort_order, created_at, updated_at`,
    [
      id,
      userId,
      cleanNullable(input.templateKey),
      cleanTitle(input.title),
      cleanText(input.category ?? "Здоровье", 80),
      cleanText(input.icon ?? "flag-checkered", 60),
      cleanText(input.color ?? "#00a87e", 24),
      input.currentValue ?? 0,
      input.targetValue ?? 0,
      cleanText(input.unit ?? "", 24),
      clampProgress(input.progress ?? progressFromValues(input.currentValue, input.targetValue)),
      input.status ?? "active",
      input.dueDate ?? null,
      orderResult.rows[0]?.next_order ?? 0
    ]
  );
  return toGoal(result.rows[0]!);
}

export async function updateGoal(userId: string, goalId: string, patch: GoalPatch) {
  const currentResult = await query<GoalRow>(
    `SELECT id, template_key, title, category, icon, color, current_value, target_value,
            unit, progress, status, due_date::text, sort_order, created_at, updated_at
       FROM profile_goals
      WHERE user_id = $1 AND id = $2`,
    [userId, goalId]
  );
  const current = currentResult.rows[0];
  if (!current) throw new ApiError(404, "GOAL_NOT_FOUND", "Цель не найдена.");

  const currentValue = patch.currentValue ?? Number(current.current_value);
  const targetValue = patch.targetValue ?? Number(current.target_value);
  const progress = patch.progress ?? progressFromValues(currentValue, targetValue);

  const result = await query<GoalRow>(
    `UPDATE profile_goals
        SET template_key = $3, title = $4, category = $5, icon = $6, color = $7,
            current_value = $8, target_value = $9, unit = $10, progress = $11,
            status = $12, due_date = $13, sort_order = $14, updated_at = now()
      WHERE user_id = $1 AND id = $2
      RETURNING id, template_key, title, category, icon, color, current_value, target_value,
                unit, progress, status, due_date::text, sort_order, created_at, updated_at`,
    [
      userId,
      goalId,
      patch.templateKey !== undefined ? cleanNullable(patch.templateKey) : current.template_key,
      patch.title !== undefined ? cleanTitle(patch.title) : current.title,
      patch.category !== undefined ? cleanText(patch.category, 80) : current.category,
      patch.icon !== undefined ? cleanText(patch.icon, 60) : current.icon,
      patch.color !== undefined ? cleanText(patch.color, 24) : current.color,
      currentValue,
      targetValue,
      patch.unit !== undefined ? cleanText(patch.unit, 24) : current.unit,
      clampProgress(progress),
      patch.status ?? current.status,
      patch.dueDate !== undefined ? patch.dueDate : current.due_date,
      patch.sortOrder ?? current.sort_order
    ]
  );
  return toGoal(result.rows[0]!);
}

export async function deleteGoal(userId: string, goalId: string) {
  const result = await query("DELETE FROM profile_goals WHERE user_id = $1 AND id = $2", [userId, goalId]);
  if (result.rowCount === 0) throw new ApiError(404, "GOAL_NOT_FOUND", "Цель не найдена.");
}

function progressFromValues(current?: number, target?: number) {
  if (!target || target <= 0) return 0;
  return Math.round(((current ?? 0) / target) * 100);
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

function toGoal(row: GoalRow) {
  return {
    id: row.id,
    templateKey: row.template_key,
    title: row.title,
    category: row.category,
    icon: row.icon,
    color: row.color,
    currentValue: Number(row.current_value),
    targetValue: Number(row.target_value),
    unit: row.unit,
    progress: row.progress,
    status: row.status,
    dueDate: row.due_date,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}
