import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as NetServer, type Socket } from "node:net";
import type { Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test, { after, before } from "node:test";

if (!process.env.AUTH_TEST_DATABASE_URL || !/^\/axmed_auth_test_[a-f0-9]+$/.test(new URL(process.env.AUTH_TEST_DATABASE_URL).pathname)) {
  throw new Error("Run npm run api:test:password-recovery: an isolated test database is required");
}
process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.AUTH_EXPOSE_DEV_CODE = "true";
process.env.AUTH_FIXED_VERIFICATION_CODE = "111111";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "local-test";
process.env.SMTP_PASSWORD = "local-test-only";
process.env.SMTP_FROM = "AxMed Test <test@example.test>";

let smtp: NetServer;
let server: Server;
let baseUrl: string;
const messages: string[] = [];
const sockets = new Set<Socket>();
let db: typeof import("../src/database.js");
let auth: typeof import("../src/authService.js");
let recovery: typeof import("../src/passwordRecoveryService.js");
let security: typeof import("../src/security.js");
let throttle: typeof import("../src/loginThrottle.js");
const originalPassword = "OriginalPass42";
const newPassword = "UpdatedPass73";

before(async () => {
  // Local SMTP sink: no email is delivered outside this test process.
  smtp = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    socket.write("220 local-test ESMTP\r\n");
    let pending = "", body: string[] = [], receiving = false;
    socket.on("data", data => {
      pending += data.toString();
      let at: number;
      while ((at = pending.indexOf("\r\n")) !== -1) {
        const line = pending.slice(0, at); pending = pending.slice(at + 2);
        if (receiving) {
          if (line === ".") { messages.push(body.join("\r\n")); body = []; receiving = false; socket.write("250 queued\r\n"); }
          else body.push(line);
        } else if (/^EHLO|^HELO/.test(line)) socket.write("250-local-test\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH/.test(line)) socket.write("235 authenticated\r\n");
        else if (line === "DATA") { receiving = true; socket.write("354 send body\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  smtp.listen(0, "127.0.0.1"); await new Promise<void>(resolve => smtp.once("listening", resolve));
  const address = smtp.address(); assert.ok(address && typeof address !== "string");
  process.env.SMTP_PORT = String(address.port);
  db = await import("../src/database.js"); auth = await import("../src/authService.js");
  recovery = await import("../src/passwordRecoveryService.js"); security = await import("../src/security.js");
  throttle = await import("../src/loginThrottle.js");
  await db.migrateDatabase();
  const { app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const httpAddress = server.address(); assert.ok(httpAddress && typeof httpAddress !== "string");
  baseUrl = `http://127.0.0.1:${httpAddress.port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  for (const socket of sockets) socket.destroy();
  if (smtp) await new Promise<void>(resolve => smtp.close(() => resolve()));
  await db?.pool.end();
});
async function fixture(options: { verified?: boolean; socialOnly?: boolean } = {}) {
  const email = `recovery.${randomUUID()}@example.test`, id = randomUUID();
  await db.query("INSERT INTO users (id,email,password_hash,email_verified_at) VALUES ($1,$2,$3,$4)",
    [id, email, options.socialOnly ? null : await security.hashPassword(originalPassword), options.verified === false ? null : new Date()]);
  return { id, email };
}
async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { response, body: response.status === 204 ? null : await response.json() as any };
}
async function emailedCode(email: string, afterIndex = 0) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const raw = messages.slice(afterIndex).find(message => message.includes(`To: ${email}`));
    if (raw) {
      const flattened = raw.replace(/=\r?\n/g, "").replace(/=([a-f0-9]{2})/gi, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      const decoded = [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/gi)]
        .map(part => Buffer.from(part[1]!.replace(/\s/g, ""), "base64").toString("utf8"));
      const match = [flattened, ...decoded].join("\n").match(/>\s*(\d{6})\s*</);
      if (match) return match[1]!;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Reset email was not received by local SMTP sink");
}
async function allowResend(email: string) {
  await db.query("UPDATE password_reset_requests SET last_sent_at=now()-interval '61 seconds' WHERE subject_hash=$1", [throttle.authSubject(email)]);
}
const codeError = (error: unknown, code: string) => Boolean(error && typeof error === "object" && "code" in error && error.code === code);

test("HTTP recovery works during a login pause and revokes old sessions", async () => {
  const user = await fixture();
  const session = await auth.loginWithEmail(user.email, originalPassword, {});
  for (let i = 0; i < 4; i++) assert.equal((await post("login", { email: user.email, password: "x" })).response.status, 401);
  const paused = await post("login", { email: user.email.toUpperCase(), password: "x" });
  assert.equal(paused.response.status, 429); assert.equal(paused.body.error.code, "LOGIN_PAUSED");
  assert.ok(Number(paused.response.headers.get("Retry-After")) > 0);
  // A fresh server process sees the same persisted block.
  const child = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    `const {loginWithEmail}=await import('./src/authService.ts'); const {pool}=await import('./src/database.ts');
     try{await loginWithEmail(process.env.RECOVERY_TEST_EMAIL,'x',{});}catch(e){console.log(e.code);}finally{await pool.end();}`],
    { cwd: process.cwd(), env: { ...process.env, RECOVERY_TEST_EMAIL: user.email } });
  assert.match(child.stdout, /LOGIN_PAUSED/);
  const requested = await post("password-reset/request", { email: user.email });
  assert.equal(requested.response.status, 200); assert.equal(requested.body.verificationCode, undefined);
  const unknown = `unknown.${randomUUID()}@example.test`;
  const missing = await post("password-reset/request", { email: unknown });
  assert.deepEqual(missing.body, requested.body);
  const code = await emailedCode(user.email);
  assert.equal((await post("password-reset/verify", { email: user.email, code: "000000" })).response.status, 400);
  const verified = await post("password-reset/verify", { email: user.email, code });
  assert.equal(verified.response.status, 200); assert.match(verified.body.resetToken, /^[A-Za-z0-9_-]{43}$/);
  const row = (await db.query("SELECT code_hash,token_hash FROM password_reset_challenges WHERE user_id=$1 AND consumed_at IS NULL", [user.id])).rows[0]!;
  assert.notEqual(row.code_hash, code); assert.notEqual(row.token_hash, verified.body.resetToken);
  assert.equal((await post("password-reset/complete", { email: unknown, resetToken: verified.body.resetToken, password: newPassword })).response.status, 400);
  assert.equal((await post("password-reset/complete", { email: user.email, resetToken: verified.body.resetToken, password: "short" })).response.status, 400);
  assert.equal((await post("password-reset/complete", { email: user.email, resetToken: verified.body.resetToken, password: newPassword })).response.status, 204);
  assert.equal((await post("password-reset/complete", { email: user.email, resetToken: verified.body.resetToken, password: newPassword })).response.status, 400);
  assert.equal((await post("refresh", { refreshToken: session.refreshToken })).response.status, 401);
  assert.equal((await fetch(`${baseUrl}/api/devices/readings`, { headers: { Authorization: `Bearer ${session.accessToken}` } })).status, 401);
  assert.equal((await post("login", { email: user.email, password: originalPassword })).response.status, 401);
  assert.equal((await post("login", { email: user.email, password: newPassword })).response.status, 200);
  const attempts = (await db.query("SELECT failures,blocked_until FROM login_attempts WHERE subject_hash=$1", [throttle.authSubject(user.email)])).rows[0]!;
  assert.equal(attempts.failures, 0); assert.equal(attempts.blocked_until, null);
});

test("parallel failures cannot exceed the threshold or extend an existing pause", async () => {
  const user = await fixture();
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => auth.loginWithEmail(user.email, "x", {})));
  assert.equal(results.filter(result => result.status === "rejected" && codeError(result.reason, "INVALID_CREDENTIALS")).length, 4);
  assert.equal(results.filter(result => result.status === "rejected" && codeError(result.reason, "LOGIN_PAUSED")).length, 4);
  const key = throttle.authSubject(user.email);
  const before = (await db.query("SELECT failures,blocked_until FROM login_attempts WHERE subject_hash=$1", [key])).rows[0]!;
  assert.equal(before.failures, 5);
  await assert.rejects(auth.loginWithEmail(user.email, originalPassword, {}), error => codeError(error, "LOGIN_PAUSED"));
  const blocked = (await db.query("SELECT blocked_until FROM login_attempts WHERE subject_hash=$1", [key])).rows[0]!;
  assert.equal(blocked.blocked_until.getTime(), before.blocked_until.getTime());
  await db.query("UPDATE login_attempts SET blocked_until=now()-interval '1 second' WHERE subject_hash=$1", [key]);
  await assert.rejects(auth.loginWithEmail(user.email, "x", {}), error => codeError(error, "INVALID_CREDENTIALS"));
  assert.equal((await db.query("SELECT failures FROM login_attempts WHERE subject_hash=$1", [key])).rows[0]!.failures, 1);
  await db.query("UPDATE login_attempts SET failures=4,window_started_at=now()-interval '16 minutes' WHERE subject_hash=$1", [key]);
  await assert.rejects(auth.loginWithEmail(user.email, "x", {}), error => codeError(error, "INVALID_CREDENTIALS"));
  assert.equal((await db.query("SELECT failures FROM login_attempts WHERE subject_hash=$1", [key])).rows[0]!.failures, 1);
});

test("resend cooldown, hourly quota and guess limits also apply to unknown addresses", async () => {
  const email = `ghost.${randomUUID()}@example.test`;
  await recovery.requestPasswordReset(email);
  await assert.rejects(recovery.requestPasswordReset(email), error => codeError(error, "RESET_CODE_COOLDOWN"));
  for (let i = 0; i < 4; i++) await assert.rejects(recovery.verifyPasswordResetCode(email, "000000"), error => codeError(error, "INVALID_RESET_CODE"));
  await assert.rejects(recovery.verifyPasswordResetCode(email, "000000"), error => codeError(error, "RESET_CODE_ATTEMPTS_EXCEEDED"));
  for (let i = 0; i < 4; i++) { await allowResend(email); await recovery.requestPasswordReset(email); }
  await allowResend(email);
  await assert.rejects(recovery.requestPasswordReset(email), error => codeError(error, "RESET_EMAIL_LIMIT"));
  const before = messages.length;
  for (const options of [{ verified: false }, { socialOnly: true }]) {
    const user = await fixture(options);
    await recovery.requestPasswordReset(user.email);
    assert.equal((await db.query("SELECT id FROM password_reset_challenges WHERE user_id=$1", [user.id])).rowCount, 0);
  }
  assert.equal(messages.length, before);
});

test("expired codes, expired grants, resends and concurrent redemption are enforced", async () => {
  const user = await fixture();
  let start = messages.length;
  await recovery.requestPasswordReset(user.email); let code = await emailedCode(user.email, start);
  await db.query("UPDATE password_reset_challenges SET expires_at=now()-interval '1 second' WHERE user_id=$1", [user.id]);
  await assert.rejects(recovery.verifyPasswordResetCode(user.email, code), error => codeError(error, "INVALID_RESET_CODE"));
  await allowResend(user.email); start = messages.length;
  await recovery.requestPasswordReset(user.email); code = await emailedCode(user.email, start);
  const firstGrant = await recovery.verifyPasswordResetCode(user.email, code);
  await allowResend(user.email); start = messages.length;
  await recovery.requestPasswordReset(user.email); code = await emailedCode(user.email, start);
  await assert.rejects(recovery.resetPassword(user.email, firstGrant.resetToken, newPassword), error => codeError(error, "INVALID_RESET_TOKEN"));
  const grants = await Promise.allSettled([recovery.verifyPasswordResetCode(user.email, code), recovery.verifyPasswordResetCode(user.email, code)]);
  assert.equal(grants.filter(item => item.status === "fulfilled").length, 1);
  const grant = grants.find(item => item.status === "fulfilled"); assert.ok(grant?.status === "fulfilled");
  await db.query("UPDATE password_reset_challenges SET token_expires_at=now()-interval '1 second' WHERE user_id=$1", [user.id]);
  await assert.rejects(recovery.resetPassword(user.email, grant.value.resetToken, newPassword), error => codeError(error, "INVALID_RESET_TOKEN"));
  await allowResend(user.email); start = messages.length;
  await recovery.requestPasswordReset(user.email); code = await emailedCode(user.email, start);
  const lastGrant = await recovery.verifyPasswordResetCode(user.email, code);
  const oldSession = await auth.loginWithEmail(user.email, originalPassword, {});
  const [refreshed, reset] = await Promise.allSettled([
    auth.rotateRefreshToken(oldSession.refreshToken, {}), recovery.resetPassword(user.email, lastGrant.resetToken, newPassword)
  ]);
  assert.equal(reset.status, "fulfilled");
  if (refreshed.status === "fulfilled") {
    const { requireDeviceUser } = await import("../src/deviceService.js");
    await assert.rejects(requireDeviceUser(`Bearer ${refreshed.value.accessToken}`));
  }
  await assert.rejects(recovery.resetPassword(user.email, lastGrant.resetToken, newPassword), error => codeError(error, "INVALID_RESET_TOKEN"));
  await allowResend(user.email); start = messages.length;
  await recovery.requestPasswordReset(user.email); code = await emailedCode(user.email, start);
  const concurrentGrant = await recovery.verifyPasswordResetCode(user.email, code);
  const redeemed = await Promise.allSettled([recovery.resetPassword(user.email, concurrentGrant.resetToken, newPassword),
    recovery.resetPassword(user.email, concurrentGrant.resetToken, newPassword)]);
  assert.equal(redeemed.filter(item => item.status === "fulfilled").length, 1);
});

test("five incorrect codes invalidate guessing for a real account, including its correct code", async () => {
  const user = await fixture(); const start = messages.length;
  await recovery.requestPasswordReset(user.email);
  const code = await emailedCode(user.email, start);
  for (let i = 0; i < 4; i++) await assert.rejects(recovery.verifyPasswordResetCode(user.email, "000000"), error => codeError(error, "INVALID_RESET_CODE"));
  await assert.rejects(recovery.verifyPasswordResetCode(user.email, "000000"), error => codeError(error, "RESET_CODE_ATTEMPTS_EXCEEDED"));
  await assert.rejects(recovery.verifyPasswordResetCode(user.email, code), error => codeError(error, "RESET_CODE_ATTEMPTS_EXCEEDED"));
  const attempts = (await db.query("SELECT attempts FROM password_reset_challenges WHERE user_id=$1", [user.id])).rows[0]!;
  assert.equal(attempts.attempts, 5);
});

test("registration, email-code limits, session rotation and logout remain functional", async () => {
  const email = `registration.${randomUUID()}@example.test`;
  const registration = await post("register", { email, password: originalPassword });
  assert.equal(registration.response.status, 201);
  for (let i = 0; i < 5; i++) assert.equal((await post("verify-email", { email, code: "000000" })).response.status, 400);
  assert.equal((await post("verify-email", { email, code: registration.body.verificationCode })).response.status, 429);
  await db.query("UPDATE email_verification_codes SET created_at=now()-interval '31 seconds' WHERE user_id=(SELECT id FROM users WHERE email=$1)", [email]);
  const resent = await post("resend-code", { email }); assert.equal(resent.response.status, 200);
  const verified = await post("verify-email", { email, code: resent.body.verificationCode });
  assert.equal(verified.response.status, 200);
  const refreshed = await post("refresh", { refreshToken: verified.body.refreshToken }); assert.equal(refreshed.response.status, 200);
  assert.equal((await post("refresh", { refreshToken: verified.body.refreshToken })).response.status, 401);
  assert.equal((await post("logout", { refreshToken: refreshed.body.refreshToken })).response.status, 204);
  assert.equal((await post("refresh", { refreshToken: refreshed.body.refreshToken })).response.status, 401);
});

test("IP login throttling returns JSON while the recovery budget remains available", async () => {
  let last;
  for (let i = 0; i < 45; i++) last = await post("login", { email: `ip.${i}@example.test`, password: "x" });
  assert.equal(last!.response.status, 429); assert.equal(last!.body.error.code, "TOO_MANY_REQUESTS");
  assert.ok(last!.body.error.retryAfterSeconds > 0);
  assert.equal((await post("password-reset/request", { email: `recover.${randomUUID()}@example.test` })).response.status, 200);
});
