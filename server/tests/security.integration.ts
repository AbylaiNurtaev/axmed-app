import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { inTransaction, migrateDatabase, pool, query } from "../src/database.js";
import { createSession, hashPassword, hashRefreshToken, type SessionResponse } from "../src/security.js";

let server: Server | undefined;
let base = "";
let current: SessionResponse;
let second: SessionResponse;
const userId = randomUUID();
const email = `security-${userId}@example.test`;

before(async () => {
  await migrateDatabase();
  await query("INSERT INTO users (id,email,password_hash,email_verified_at) VALUES ($1,$2,$3,now())", [userId, email, await hashPassword("Old-password-1")]);
  const user = { id: userId, email, displayName: null, emailVerified: true };
  current = await inTransaction(client => createSession(client, user, { userAgent: "AxMed iPhone" }));
  second = await inTransaction(client => createSession(client, user, { userAgent: "Mozilla Macintosh" }));
  const runningServer = app.listen(0, "127.0.0.1");
  server = runningServer;
  await new Promise<void>(resolve => runningServer.once("listening", resolve));
  const address = runningServer.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  await query("DELETE FROM users WHERE id=$1", [userId]);
  await pool.end();
});

test("sessions, password change and logout-all are enforced by the backend", async () => {
  const initial = await call("GET", "/api/security/sessions");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.length, 2);
  assert.equal(initial.body.filter((item: { current: boolean }) => item.current).length, 1);

  const rejected = await call("POST", "/api/security/change-password", { currentPassword: "wrong", newPassword: "New-password-2" });
  assert.equal(rejected.status, 400);

  const changed = await call("POST", "/api/security/change-password", { currentPassword: "Old-password-1", newPassword: "New-password-2" });
  assert.equal(changed.status, 204);
  const otherToken = await query<{ revoked_at: Date | null }>("SELECT revoked_at FROM refresh_tokens WHERE token_hash=$1", [hashRefreshToken(second.refreshToken)]);
  assert.ok(otherToken.rows[0]?.revoked_at);

  const user = { id: userId, email, displayName: null, emailVerified: true };
  second = await inTransaction(client => createSession(client, user, { userAgent: "Android" }));
  const sessions = await call("GET", "/api/security/sessions");
  const android = sessions.body.find((item: { device: string }) => item.device === "Android");
  assert.ok(android);
  assert.equal((await call("DELETE", `/api/security/sessions/${android.id}`)).status, 204);

  assert.equal((await call("POST", "/api/security/logout-all", {})).status, 204);
  assert.equal((await call("GET", "/api/security/sessions")).status, 401);
});

async function call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${current.accessToken}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}
