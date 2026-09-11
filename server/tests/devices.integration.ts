import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { inTransaction, migrateDatabase, pool, query } from "../src/database.js";
import { createSession, type SessionResponse } from "../src/security.js";

let server: Server;
let base: string;
const users = [randomUUID(), randomUUID()];
const sessions: SessionResponse[] = [];
before(async () => {
  await migrateDatabase();
  for (const id of users) {
    await query("INSERT INTO users (id, email_verified_at) VALUES ($1, now())", [id]);
    sessions.push(await inTransaction(client => createSession(client, { id, email: null, displayName: "Device test fixture", emailVerified: true }, {})));
  }
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  // Only disposable UUIDs created by this test; user's accounts are untouched.
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [users]);
  await pool.end();
});
async function call(path: string, token?: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
}

test("authenticated sync is atomic, deduplicated, account-isolated and revoked on logout", async () => {
  const a = sessions[0]!;
  const b = sessions[1]!;
  const batch = {
    device: { id: "fixture-g72", name: "Test G72", adapterId: "hband", kind: "fitness-band" },
    readAt: "2026-09-10T12:00:00Z", timeZone: "Asia/Almaty", historyDays: 7, skippedRecords: 0,
    battery: { value: 3, unit: "bars", low: false }, complete: true,
    samples: Array.from({ length: 510 }, (_, index) => ({
      sourceRecordId: `fixture-${index}`, metric: "steps", value: 10, unit: "count",
      recordedAt: "2026-09-10T11:00:00Z", localDate: "2026-09-10"
    }))
  };
  assert.equal((await call("/api/devices/readings")).status, 401);
  assert.equal((await call("/api/devices/sync", "fake-token", batch)).status, 401);
  assert.equal((await call("/api/devices/sync", a.accessToken, { ...batch, userId: users[1] })).status, 400);
  assert.equal((await call("/api/devices/sync", a.accessToken, batch)).status, 200);
  assert.equal((await call("/api/devices/sync", a.accessToken, batch)).status, 200);
  const loaded = await call("/api/devices/readings", a.accessToken);
  assert.equal(loaded.body.samples.length, 510);
  assert.equal(loaded.body.samples.reduce((sum: number, sample: { value: number }) => sum + sample.value, 0), 5100);
  assert.equal(loaded.body.battery.unit, "bars");
  assert.equal((await call("/api/devices/readings", b.accessToken)).body, null);
  const stale = { ...batch, readAt: "2026-09-10T11:30:00Z", samples: [{ ...batch.samples[0], value: 900 }] };
  assert.equal((await call("/api/devices/sync", a.accessToken, stale)).status, 200);
  const afterStale = (await call("/api/devices/readings", a.accessToken)).body;
  assert.equal(afterStale.samples.find((sample: any) => sample.sourceRecordId === "fixture-0").value, 10);
  assert.equal(afterStale.readAt, "2026-09-10T12:00:00.000Z");
  assert.equal((await call("/api/devices/sync", a.accessToken, { ...batch, samples: [...batch.samples, { ...batch.samples[0], value: -1 }] })).status, 400);
  assert.equal((await call("/api/devices/readings", a.accessToken)).body.samples.length, 510);
  assert.equal((await call("/api/auth/logout", undefined, { refreshToken: a.refreshToken })).status, 204);
  assert.equal((await call("/api/devices/readings", a.accessToken)).status, 401);
});

test("extended history round-trips more than 10000 readings, metadata and warnings", async () => {
  const token = sessions[1]!.accessToken;
  const samples: any[] = Array.from({ length: 12000 }, (_, i) => ({
    sourceRecordId: `hrv:fixture-${"x".repeat(75)}-${i}`, metric: "hrv", value: 40, unit: "ms",
    recordedAt: "2026-09-11T16:24:00Z", localDate: "2026-09-11", origin: "manual", aggregation: "mean"
  }));
  for (const [metric, value, unit] of [["oxygenSaturation", 96, "percent"], ["bodyTemperature", 36.2, "celsius"],
    ["bloodPressureSystolic", 123, "mmHg"], ["bloodPressureDiastolic", 88, "mmHg"], ["met", 0.9, "MET"], ["stress", 36, "score"],
    ["distance", 3.06, "km"], ["activeCalories", 256.4, "kcal"]]) {
    samples.push({ sourceRecordId: `${metric}:fixture`, metric, value, unit, recordedAt: "2026-09-11T16:20:00Z", localDate: "2026-09-11" });
  }
  const batch = {
    device: { id: "fixture-expanded", name: "G72 fixture", adapterId: "hband", kind: "fitness-band" },
    readAt: "2026-09-11T17:00:00Z", timeZone: "Asia/Almaty", historyDays: 7, skippedRecords: 0,
    syncVersion: 2, warnings: ["manualTemperatureUnits"], samples, complete: true
  };
  assert.equal((await call("/api/devices/sync", token, batch)).status, 200);
  assert.equal((await call("/api/devices/sync", token, batch)).status, 200);
  const loaded = (await call("/api/devices/readings", token)).body;
  assert.equal(loaded.samples.length, samples.length);
  assert.equal(loaded.syncVersion, 2);
  assert.deepEqual(loaded.warnings, ["manualTemperatureUnits"]);
  const temperature = loaded.samples.find((s: any) => s.metric === "bodyTemperature");
  assert.equal(temperature.value, 36.2);
  assert.equal(temperature.unit, "celsius");
  const hrv = loaded.samples.find((s: any) => s.metric === "hrv");
  assert.equal(hrv.aggregation, "mean");
  assert.equal(hrv.origin, "manual");
});
