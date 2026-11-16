import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test, { before, after } from "node:test";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { inTransaction, migrateDatabase, pool, query } from "../src/database.js";
import { createSession, hashPassword, type SessionResponse } from "../src/security.js";
import { createAccountDeletionService } from "../src/accountDeletionService.js";

let server: Server;
let base: string;
const owned = new Set<string>();
const password = "Deletion-fixture-2026";
before(async () => {
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(config.DATABASE_URL).hostname), "Deletion fixtures must run against a local database");
  await migrateDatabase();
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  for (const id of owned) {
    await query("DELETE FROM users WHERE id = $1", [id]);
    await query("DELETE FROM account_deletion_file_jobs WHERE object_prefix = $1", [`users/${id}/profile/`]);
  }
  await pool.end();
});
async function fixture(provider?: "google" | "apple") {
  const id = randomUUID(); owned.add(id);
  const email = `delete-${id}@example.test`;
  await query("INSERT INTO users (id,email,password_hash,email_verified_at,avatar_url) VALUES ($1,$2,$3,now(),'https://example.test/photo')", [id, email, await hashPassword(password)]);
  if (provider) await query("INSERT INTO auth_identities (id,user_id,provider,provider_user_id) VALUES ($1,$2,$3,$4)", [randomUUID(), id, provider, `provider-${id}`]);
  const user = { id, email, displayName: null, emailVerified: true };
  const session = await inTransaction(client => createSession(client, user, {}));
  const second = await inTransaction(client => createSession(client, user, {}));
  const sessionId = (await query<{ id: string }>("SELECT id FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at LIMIT 1", [id])).rows[0]!.id;
  return { id, email, session, second, sessionId };
}
async function call(method: string, path: string, session?: SessionResponse, body?: unknown) {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}
const exists = async (id: string) => Boolean((await query("SELECT id FROM users WHERE id = $1", [id])).rowCount);

test("public privacy, support and deletion pages are available without authentication", async () => {
  for (const name of ["privacy-policy", "support", "account-deletion"]) {
    const response = await fetch(`${base}/legal/${name}.html`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await response.text(), /nurallinbekjan@gmail\.com/);
  }
});

test("password deletion requires a live session, exact confirmation and the account owner's password", async () => {
  const current = await fixture(); const other = await fixture();
  assert.equal((await call("POST", "/api/security/account-deletion", undefined, { confirmation: "DELETE", method: "password", password })).status, 401);
  assert.equal((await call("POST", "/api/security/account-deletion", current.session, { confirmation: "yes", method: "password", password })).status, 400);
  assert.equal((await call("POST", "/api/security/account-deletion", current.session, { confirmation: "DELETE", method: "password", password, userId: other.id })).status, 400);
  assert.equal((await call("POST", "/api/security/account-deletion", current.session, { confirmation: "DELETE", method: "password", password: "wrong" })).status, 403);
  assert.ok(await exists(current.id)); assert.ok(await exists(other.id));
  assert.equal((await call("GET", "/api/profile", current.session)).status, 200);
});

test("deletion cascades through measurements, device bindings, goals and plans; all sessions stop working", async () => {
  const current = await fixture("google"); const other = await fixture();
  const device = randomUUID(); const goal = randomUUID(); const task = randomUUID(); const habit = randomUUID();
  await query("INSERT INTO health_devices (id,user_id,adapter_id,external_id,kind,name,time_zone) VALUES ($1,$2,'test','fixture','fitness-band','Fixture','UTC')", [device, current.id]);
  await query("INSERT INTO device_readings (device_id,source_record_id,metric,value,unit,recorded_at,local_date,source_read_at) VALUES ($1,'fixture','steps',123,'steps',now(),CURRENT_DATE,now())", [device]);
  await query("INSERT INTO device_bindings (user_id,kind,adapter_id,external_id,name) VALUES ($1,'fitness-band','test','fixture','Fixture')", [current.id]);
  await query("INSERT INTO profile_goals (id,user_id,title,category,icon,color) VALUES ($1,$2,'Fixture','activity','walk','#111111')", [goal, current.id]);
  await query("INSERT INTO goal_checkins (id,user_id,goal_id,completed_on) VALUES ($1,$2,$3,CURRENT_DATE)", [randomUUID(), current.id, goal]);
  await query("INSERT INTO plan_tasks (id,user_id,title) VALUES ($1,$2,'Fixture')", [task, current.id]);
  await query("INSERT INTO plan_habits (id,user_id,title) VALUES ($1,$2,'Fixture')", [habit, current.id]);
  assert.equal((await call("POST", "/api/security/account-deletion", current.session, { confirmation: "DELETE", method: "password", password })).status, 204);
  assert.equal(await exists(current.id), false); assert.ok(await exists(other.id));
  for (const table of ["refresh_tokens", "auth_identities", "health_devices", "device_bindings", "profile_goals", "goal_checkins", "plan_tasks", "plan_habits"]) {
    assert.equal((await query(`SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`, [current.id])).rows[0]!.count, 0, table);
  }
  assert.equal((await query("SELECT count(*)::int AS count FROM device_readings WHERE device_id = $1", [device])).rows[0]!.count, 0);
  assert.equal((await query("SELECT count(*)::int AS count FROM account_deletion_file_jobs WHERE object_prefix = $1", [`users/${current.id}/profile/`])).rows[0]!.count, 1);
  assert.equal((await call("GET", "/api/profile", current.session)).status, 401);
  assert.equal((await call("GET", "/api/profile", current.second)).status, 401);
  assert.equal((await call("POST", "/api/auth/refresh", undefined, { refreshToken: current.second.refreshToken })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", undefined, { email: current.email, password })).status, 401);
});

test("social deletion checks the linked provider identity; Apple revocation failure never deletes the account", async () => {
  const current = await fixture("apple");
  let subject = "another-person"; let revoked = false; let fail = true;
  const remove = createAccountDeletionService({
    verifyIdentity: async provider => ({ provider, subject, email: null, emailVerified: true }),
    revokeApple: async (_code, actual) => { assert.equal(actual, `provider-${current.id}`); revoked = true; if (fail) throw Error("Provider unavailable"); }
  });
  await assert.rejects(remove(current.id, current.sessionId, { confirmation: "DELETE", method: "password", password }), { code: "APPLE_CONFIRMATION_REQUIRED" });
  const proof = { confirmation: "DELETE" as const, method: "apple" as const, idToken: "test-fixture-token-value", authorizationCode: "fixture-code" };
  await assert.rejects(remove(current.id, current.sessionId, proof), { code: "DELETION_IDENTITY_MISMATCH" });
  assert.equal(revoked, false); assert.ok(await exists(current.id));
  subject = `provider-${current.id}`;
  await assert.rejects(remove(current.id, current.sessionId, proof), /Provider unavailable/);
  assert.ok(await exists(current.id)); fail = false;
  await remove(current.id, current.sessionId, proof);
  assert.equal(await exists(current.id), false); assert.equal(revoked, true);
});

test("Google-linked accounts can be deleted using a verified matching Google identity", async () => {
  const current = await fixture("google");
  const remove = createAccountDeletionService({ verifyIdentity: async provider => ({ provider, subject: `provider-${current.id}`, email: null, emailVerified: true }), revokeApple: async () => { throw Error("Google deletion must not revoke Apple"); } });
  await remove(current.id, current.sessionId, { confirmation: "DELETE", method: "google", idToken: "test-fixture-token-value" });
  assert.equal(await exists(current.id), false);
});
