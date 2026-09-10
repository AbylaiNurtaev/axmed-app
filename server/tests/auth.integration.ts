import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { migrateDatabase, pool } from "../src/database.js";

let server: Server;
let baseUrl: string;

before(async () => {
  await migrateDatabase();
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server has no TCP address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

test("email registration, verification, login, refresh rotation and logout", async () => {
  const email = `integration.${Date.now()}@example.com`;
  const password = "StrongPass42";

  const registration = await post("/api/auth/register", { email, password });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.requiresVerification, true);
  assert.match(registration.body.verificationCode, /^\d{6}$/);

  const invalidCode = await post("/api/auth/verify-email", { email, code: "000000" });
  assert.equal(invalidCode.response.status, 400);

  const verification = await post("/api/auth/verify-email", {
    email,
    code: registration.body.verificationCode
  });
  assert.equal(verification.response.status, 200);
  assert.equal(verification.body.user.emailVerified, true);
  assert.equal(typeof verification.body.refreshToken, "string");

  const repeatedVerification = await post("/api/auth/verify-email", {
    email,
    code: registration.body.verificationCode
  });
  assert.equal(repeatedVerification.response.status, 409);

  const wrongPassword = await post("/api/auth/login", { email, password: "WrongPass42" });
  assert.equal(wrongPassword.response.status, 401);

  const login = await post("/api/auth/login", { email, password });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.email, email);

  const refreshed = await post("/api/auth/refresh", { refreshToken: login.body.refreshToken });
  assert.equal(refreshed.response.status, 200);
  assert.notEqual(refreshed.body.refreshToken, login.body.refreshToken);

  const reusedToken = await post("/api/auth/refresh", { refreshToken: login.body.refreshToken });
  assert.equal(reusedToken.response.status, 401);

  const logout = await post("/api/auth/logout", { refreshToken: refreshed.body.refreshToken });
  assert.equal(logout.response.status, 204);

  const afterLogout = await post("/api/auth/refresh", { refreshToken: refreshed.body.refreshToken });
  assert.equal(afterLogout.response.status, 401);
});

async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const responseBody = response.status === 204 ? null : await response.json() as any;
  return { response, body: responseBody };
}
