import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { inTransaction, migrateDatabase, pool, query } from "../src/database.js";
import { createSession, type SessionResponse } from "../src/security.js";

let server: Server;
let base = "";
let session: SessionResponse;
const userId = randomUUID();
const localDate = "2026-11-14";

before(async () => {
  await migrateDatabase();
  await query("INSERT INTO users (id, email_verified_at) VALUES ($1, now())", [userId]);
  session = await inTransaction(client => createSession(client, { id: userId, email: null, displayName: "Plan fixture", emailVerified: true }, {}));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await query("DELETE FROM users WHERE id = $1", [userId]);
  await pool.end();
});

test("tasks, habits, points and device progress are idempotent", async () => {
  const goal = await call("POST", "/api/profile/goals", { title: "Стабильный ритм", metricKey: "custom", startValue: 0, currentValue: 0, targetValue: 10, unit: "действий" });
  const goalId = goal.body.id as string;
  const task = await call("POST", "/api/plan/tasks", { goalId, title: "Пройтись", dueAt: "2026-11-14T13:00:00.000Z", dueLocalDate: localDate, timeZone: "Asia/Almaty", recurrence: "daily" });
  const taskId = task.body.id as string;
  assert.equal(task.status, 201);

  await call("PUT", `/api/plan/tasks/${taskId}/events`, { localDate, status: "completed", mutationId: "task-mutation-1" });
  await call("PUT", `/api/plan/tasks/${taskId}/events`, { localDate, status: "completed", mutationId: "task-mutation-2" });
  let workspace = await call("GET", `/api/plan?localDate=${localDate}&timeZone=Asia%2FAlmaty`);
  assert.equal(workspace.body.goals.find((item: any) => item.id === goalId).currentValue, 1);
  assert.equal(workspace.body.gamification.points, 5);

  await call("DELETE", `/api/plan/tasks/${taskId}/events/${localDate}`);
  workspace = await call("GET", `/api/plan?localDate=${localDate}&timeZone=Asia%2FAlmaty`);
  assert.equal(workspace.body.goals.find((item: any) => item.id === goalId).currentValue, 0);
  assert.equal(workspace.body.gamification.points, 0);

  const habit = await call("POST", "/api/plan/habits", { goalId, title: "Вечерняя прогулка", scheduleType: "daily", targetPerWeek: 7 });
  const habitId = habit.body.id as string;
  await call("PUT", `/api/plan/habits/${habitId}/events`, { localDate, status: "completed", mutationId: "habit-mutation-1" });
  await call("PUT", `/api/plan/habits/${habitId}/events`, { localDate, status: "completed", mutationId: "habit-mutation-2" });
  workspace = await call("GET", `/api/plan?localDate=${localDate}&timeZone=Asia%2FAlmaty`);
  assert.equal(workspace.body.goals.find((item: any) => item.id === goalId).currentValue, 1);
  assert.equal(workspace.body.gamification.points, 6);
  await call("PUT", `/api/plan/habits/${habitId}/events`, { localDate, status: "skipped", mutationId: "habit-mutation-3" });

  const stepsGoal = await call("POST", "/api/profile/goals", { title: "Больше шагов", metricKey: "steps", startValue: 6000, currentValue: 6000, targetValue: 8000, unit: "шагов" });
  const now = new Date().toISOString();
  const syncBody = { device: { id: "band-plan-test", name: "Band", adapterId: "hband", kind: "fitness-band" }, readAt: now, timeZone: "Asia/Almaty", historyDays: 1, skippedRecords: 0, complete: true,
    samples: [{ sourceRecordId: "steps-plan-test", metric: "steps", value: 7500, unit: "count", recordedAt: now, localDate }] };
  await call("POST", "/api/devices/sync", syncBody);
  await call("POST", "/api/devices/sync", syncBody);
  workspace = await call("GET", `/api/plan?localDate=${localDate}&timeZone=Asia%2FAlmaty`);
  const synced = workspace.body.goals.find((item: any) => item.id === stepsGoal.body.id);
  assert.equal(synced.currentValue, 7500);
  assert.equal(synced.progress, 75);
  assert.equal(synced.progressSource, "bracelet");
  assert.equal(workspace.body.gamification.points, 10);

  await call("PATCH", `/api/profile/goals/${goalId}`, { status: "completed", localDate, mutationId: "complete-goal-1" });
  await call("PATCH", `/api/profile/goals/${goalId}`, { status: "completed", localDate, mutationId: "complete-goal-2" });
  workspace = await call("GET", `/api/plan?localDate=${localDate}&timeZone=Asia%2FAlmaty`);
  assert.equal(workspace.body.gamification.points, 50);
  assert.equal(workspace.body.gamification.achievements.some((item: any) => item.key === "goal-finished"), true);
});

async function call(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
}
