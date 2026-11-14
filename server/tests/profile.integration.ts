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
  await query("INSERT INTO users (id,email,display_name,email_verified_at,avatar_url) VALUES ($1,$2,$3,now(),$4)", [userId, `profile-${userId}@example.test`, "Profile fixture", "https://example.com/old-avatar.jpg"]);
  session = await inTransaction(client => createSession(client, { id: userId, email: `profile-${userId}@example.test`, displayName: "Profile fixture", emailVerified: true }, {}));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await query("DELETE FROM users WHERE id=$1", [userId]);
  await pool.end();
});

test("personal profile fields persist and avatar can be removed safely", async () => {
  const updated = await call("PATCH", "/api/profile", {
    firstName: "Абай", lastName: "Нуртаев", phone: "+7 (771) 594-37-38",
    birthDate: "1998-04-15", gender: "male",
    medicalProfile: { bodyMeasurements: { height: "181" } },
    appPreferences: { timezone: "Asia/Almaty", units: "metric" }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.fullName, "Абай Нуртаев");
  assert.equal(updated.body.firstName, "Абай");
  assert.equal(updated.body.lastName, "Нуртаев");
  assert.equal(updated.body.medicalProfile.bodyMeasurements.height, "181");
  assert.equal(updated.body.appPreferences.timezone, "Asia/Almaty");

  const medicalContext = await call("PATCH", "/api/profile", {
    medicalProfile: { conditions: "Астма", medications: "", allergies: "Пыльца", lastCheckup: "12.10.2026", notes: "Без ограничений" }
  });
  assert.equal(medicalContext.status, 200);
  assert.equal(medicalContext.body.medicalProfile.conditions, "Астма");
  assert.equal(medicalContext.body.medicalProfile.allergies, "Пыльца");
  assert.equal(medicalContext.body.medicalProfile.notes, "Без ограничений");
  assert.equal(medicalContext.body.medicalProfile.bodyMeasurements.height, "181");

  const legacyUpdated = await call("PATCH", "/api/profile", { fullName: "Алма Иванова" });
  assert.equal(legacyUpdated.status, 200);
  assert.equal(legacyUpdated.body.firstName, "Алма");
  assert.equal(legacyUpdated.body.lastName, "Иванова");

  const removed = await call("DELETE", "/api/profile/avatar");
  assert.equal(removed.status, 200);
  assert.equal(removed.body.avatarUrl, null);
  assert.equal((await call("GET", "/api/profile")).body.firstName, "Алма");
});

async function call(method: "GET" | "PATCH" | "DELETE", path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() as any };
}
