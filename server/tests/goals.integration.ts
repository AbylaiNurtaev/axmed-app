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

before(async () => {
  await migrateDatabase();
  await query("INSERT INTO users (id, email_verified_at) VALUES ($1, now())", [userId]);
  session = await inTransaction(client => createSession(client, { id: userId, email: null, displayName: "Goal fixture", emailVerified: true }, {}));
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

test("goal CRUD, scheduling fields and daily check-in round-trip through the API", async () => {
  const created = await call("POST", "/api/profile/goals", {
    title: "Больше шагов", metricKey: "steps", startValue: 6000, currentValue: 6500,
    targetValue: 8000, unit: "шагов", frequency: "daily", reminderEnabled: true,
    reminderTime: "19:30", nextAction: "Пройти дневную норму", dueDate: "2026-12-31"
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.progress, 25);
  assert.equal(created.body.reminderTime, "19:30");
  const goalId = created.body.id as string;

  const initial = await call("GET", "/api/profile/goals?localDate=2026-11-14");
  assert.equal(initial.body.goals[0].completedToday, false);

  assert.equal((await call("POST", `/api/profile/goals/${goalId}/checkins`, { localDate: "2026-11-14" })).status, 201);
  const checked = await call("GET", "/api/profile/goals?localDate=2026-11-14");
  assert.equal(checked.body.goals[0].completedToday, true);
  assert.equal(checked.body.goals[0].weeklyCompletedActions, 1);
  assert.equal(checked.body.goals[0].streakDays, 1);

  assert.equal((await call("DELETE", `/api/profile/goals/${goalId}/checkins/2026-11-14`)).status, 204);
  const updated = await call("PATCH", `/api/profile/goals/${goalId}`, { status: "completed", currentValue: 8000 });
  assert.equal(updated.body.status, "completed");
  assert.equal(updated.body.progress, 100);
  assert.equal((await call("DELETE", `/api/profile/goals/${goalId}`)).status, 204);
  assert.equal((await call("GET", "/api/profile/goals?localDate=2026-11-14")).body.goals.length, 0);
});

async function call(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
}
