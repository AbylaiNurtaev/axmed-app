import { randomUUID } from "node:crypto";
import { query } from "./database.js";

type PointEventInput = {
  eventKey: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  points: number;
  localDate: string;
  metadata?: Record<string, unknown>;
};

const levels = [0, 80, 200, 380, 620, 920, 1280, 1700, 2200, 2800];

export async function awardPoints(userId: string, input: PointEventInput) {
  const result = await query<{ inserted: boolean }>(`
    INSERT INTO plan_point_events
      (id, user_id, event_key, event_type, source_type, source_id, points, local_date, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::jsonb)
    ON CONFLICT (user_id, event_key) DO UPDATE
      SET reversed_at = NULL,
          metadata = EXCLUDED.metadata
    RETURNING (xmax = 0) AS inserted`, [
      randomUUID(), userId, input.eventKey, input.eventType, input.sourceType,
      input.sourceId, input.points, input.localDate, JSON.stringify(input.metadata ?? {})
    ]);
  await refreshAchievements(userId);
  return result.rows[0]?.inserted ?? false;
}

export async function reversePoints(userId: string, eventKey: string) {
  await query(
    `UPDATE plan_point_events SET reversed_at = COALESCE(reversed_at, now())
      WHERE user_id = $1 AND event_key = $2`,
    [userId, eventKey]
  );
}

export async function loadGamification(userId: string, referenceDate: string) {
  const [totalResult, recentResult, achievementsResult, completionResult] = await Promise.all([
    query<{ points: string }>(
      "SELECT COALESCE(SUM(points), 0)::text AS points FROM plan_point_events WHERE user_id = $1 AND reversed_at IS NULL",
      [userId]
    ),
    query<{ local_date: string; points: string }>(`
      SELECT local_date::text, SUM(points)::text AS points
        FROM plan_point_events
       WHERE user_id = $1 AND reversed_at IS NULL AND local_date BETWEEN $2::date - 34 AND $2::date
       GROUP BY local_date ORDER BY local_date`, [userId, referenceDate]),
    query<{ achievement_key: string; unlocked_at: Date }>(`
      SELECT achievement_key, unlocked_at FROM plan_achievements
       WHERE user_id = $1 ORDER BY unlocked_at DESC`, [userId]),
    query<{ completed: string }>(`
      SELECT COUNT(*)::text AS completed FROM profile_goals
       WHERE user_id = $1 AND status = 'completed'`, [userId])
  ]);

  const points = Number(totalResult.rows[0]?.points ?? 0);
  const dates = new Map(recentResult.rows.map(row => [row.local_date, Number(row.points)]));
  const levelIndex = Math.max(0, levels.findLastIndex(threshold => points >= threshold));
  const currentFloor = levels[levelIndex] ?? levels.at(-1)!;
  const nextFloor = levels[levelIndex + 1] ?? currentFloor + 700;
  const streakDays = activityStreak(dates, referenceDate);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(referenceDate, index - 6);
    return { date, points: dates.get(date) ?? 0, active: dates.has(date) };
  });
  const month = Array.from({ length: 30 }, (_, index) => {
    const date = shiftDate(referenceDate, index - 29);
    return { date, points: dates.get(date) ?? 0, active: dates.has(date) };
  });

  return {
    points,
    level: levelIndex + 1,
    levelTitle: levelTitle(levelIndex + 1),
    nextLevelPoints: nextFloor,
    levelProgress: Math.min(100, Math.round(((points - currentFloor) / Math.max(1, nextFloor - currentFloor)) * 100)),
    streakDays,
    weeklySequence: week,
    monthActivity: month,
    completedGoals: Number(completionResult.rows[0]?.completed ?? 0),
    achievements: achievementsResult.rows.map(row => ({
      key: row.achievement_key,
      ...achievementCopy(row.achievement_key),
      unlockedAt: row.unlocked_at.toISOString()
    }))
  };
}

async function refreshAchievements(userId: string) {
  const stats = await query<{ event_count: string; active_days: string; max_points: string }>(`
    SELECT COUNT(*)::text AS event_count,
           COUNT(DISTINCT local_date)::text AS active_days,
           COALESCE(MAX(points), 0)::text AS max_points
      FROM plan_point_events
     WHERE user_id = $1 AND reversed_at IS NULL`, [userId]);
  const completedGoals = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM profile_goals WHERE user_id = $1 AND status = 'completed'",
    [userId]
  );
  const row = stats.rows[0];
  const candidates = [
    ["first-step", Number(row?.event_count ?? 0) >= 1],
    ["steady-week", Number(row?.active_days ?? 0) >= 5],
    ["goal-finished", Number(completedGoals.rows[0]?.count ?? 0) >= 1],
    ["meaningful-action", Number(row?.max_points ?? 0) >= 40]
  ] as const;
  for (const [key, unlocked] of candidates) {
    if (!unlocked) continue;
    await query(`INSERT INTO plan_achievements (id, user_id, achievement_key)
      VALUES ($1, $2, $3) ON CONFLICT (user_id, achievement_key) DO NOTHING`, [randomUUID(), userId, key]);
  }
}

function activityStreak(dates: Map<string, number>, referenceDate: string) {
  let offset = dates.has(referenceDate) ? 0 : 1;
  let streak = 0;
  while (dates.has(shiftDate(referenceDate, -offset))) {
    streak += 1;
    offset += 1;
  }
  return streak;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function levelTitle(level: number) {
  return ["Листочек", "Росток", "Саженец", "Молодое дерево", "Крепкое дерево", "Цветущее дерево", "Плодоносящее дерево", "Роща", "Лес", "Заповедник"][Math.min(9, level - 1)]!;
}

function achievementCopy(key: string) {
  const copy: Record<string, { title: string; description: string; icon: string }> = {
    "first-step": { title: "Первый шаг", description: "Первое полезное действие отмечено", icon: "foot-print" },
    "steady-week": { title: "Устойчивый ритм", description: "Пять активных дней", icon: "calendar-check" },
    "goal-finished": { title: "Цель достигнута", description: "Первая цель завершена", icon: "flag-checkered" },
    "meaningful-action": { title: "Важный результат", description: "Большой шаг в плане", icon: "star-four-points" }
  };
  return copy[key] ?? { title: key, description: "Достижение AxMed", icon: "medal-outline" };
}
