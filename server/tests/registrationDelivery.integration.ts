import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as NetServer } from "node:net";
import type { Server } from "node:http";
import test, { before, after } from "node:test";

const target = process.env.AUTH_TEST_DATABASE_URL;
if (!target || !/^\/axmed_auth_test_[a-f0-9]+$/.test(new URL(target).pathname)
  || !["localhost", "127.0.0.1"].includes(new URL(target).hostname)) throw Error("An isolated local test database is required");
Object.assign(process.env, { DATABASE_URL: target, NODE_ENV: "production", AUTH_EXPOSE_DEV_CODE: "false",
  RESEND_API_KEY: "", BREVO_API_KEY: "", SMTP_HOST: "127.0.0.1", SMTP_SECURE: "false",
  SMTP_USER: "fixture", SMTP_PASSWORD: "fixture", SMTP_FROM: "AxMed <sender@example.test>" });

let smtp: NetServer; let server: Server; let base: string;
let db: typeof import("../src/database.js");
let envelope: typeof import("../src/credentialEnvelope.js");
let apiStatus = 201;
const delivered: Array<{ sender: { email: string; name: string }; to: Array<{ email: string }>; textContent: string }> = [];
const password = "Registration-fixture-2026";
const apiKey = "fixture-api-key-not-a-real-credential";

before(async () => {
  // Fail SMTP without delivering any messages outside this test process.
  smtp = createServer(socket => socket.destroy()); smtp.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => smtp.once("listening", resolve));
  const smtpAddress = smtp.address(); assert.ok(smtpAddress && typeof smtpAddress !== "string");
  process.env.SMTP_PORT = String(smtpAddress.port);
  db = await import("../src/database.js"); envelope = await import("../src/credentialEnvelope.js");
  await db.migrateDatabase();
  await (await import("../src/serviceCredentialStore.js")).ensureServiceCredentialStore();
  const { app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (smtp) await new Promise<void>(resolve => smtp.close(() => resolve()));
  await db?.pool.end();
});
async function post(path: string, body: unknown) {
  const response = await fetch(base + "/api/auth/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
}
async function configureEmail() {
  const bootstrap = (await db.query<{ value: { publicKey: string } }>("SELECT value FROM service_credentials WHERE id='bootstrap-v1'")).rows[0]!.value;
  const sealed = envelope.sealCredential(bootstrap.publicKey, { provider: "brevo", apiKey, from: "AxMed <sender@example.test>" });
  await db.query("INSERT INTO service_credentials (id,value) VALUES ('transactional-email',$1::jsonb) ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value", [JSON.stringify(sealed)]);
}
function interceptEmail(t: test.TestContext) {
  const original = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== "https://api.brevo.com/v3/smtp/email") return original(input, init);
    assert.equal(new Headers(init?.headers).get("api-key"), apiKey);
    const payload = JSON.parse(String(init?.body));
    if (apiStatus === 201) delivered.push(payload);
    return new Response(JSON.stringify(apiStatus === 201 ? { messageId: "fixture" } : { message: "Private provider details sender@example.test 123456" }), { status: apiStatus });
  });
}
const codeFor = (email: string) => {
  const message = delivered.findLast(item => item.to[0]?.email === email);
  assert.ok(message); return message.textContent.match(/\b\d{6}\b/)![0];
};

test("SMTP connection failures return a safe delivery error instead of an internal server error", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const email = `smtp-${randomUUID()}@example.test`;
  const result = await post("register", { email, password });
  assert.equal(result.status, 503); assert.equal(result.body.error.code, "EMAIL_DELIVERY_FAILED");
  assert.equal(JSON.stringify(result.body).includes(email), false);
  assert.equal(logs.flat().join(" ").includes(email), false);
  const user = (await db.query("SELECT email_verified_at FROM users WHERE email=$1", [email])).rows[0]!;
  assert.equal(user.email_verified_at, null);
});

test("encrypted HTTPS email configuration restores registration, verification and login without changing Railway env", async t => {
  await configureEmail(); interceptEmail(t);
  const email = `api-${randomUUID()}@example.test`;
  const registered = await post("register", { email, password });
  assert.equal(registered.status, 201); assert.equal(registered.body.requiresVerification, true);
  assert.equal(registered.body.verificationCode, undefined);
  assert.deepEqual(delivered.at(-1)!.sender, { email: "sender@example.test", name: "AxMed" });
  assert.equal((await post("verify-email", { email, code: "000000" })).status, 400);
  const verified = await post("verify-email", { email, code: codeFor(email) });
  assert.equal(verified.status, 200); assert.equal(verified.body.user.emailVerified, true);
  assert.equal((await post("login", { email, password })).status, 200);
});

test("HTTPS provider rejection never exposes provider details or reports a verification email as sent", async t => {
  interceptEmail(t); apiStatus = 403;
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  try {
    const result = await post("register", { email: `rejected-${randomUUID()}@example.test`, password });
    assert.equal(result.status, 503); assert.equal(result.body.error.code, "EMAIL_DELIVERY_FAILED");
    assert.equal(result.body.requiresVerification, undefined);
    assert.equal(JSON.stringify([result.body, logs]).includes("Private provider details"), false);
    assert.equal(JSON.stringify(logs).includes(apiKey), false);
  } finally { apiStatus = 201; }
});

test("resend and password recovery use the same configured HTTPS delivery", async t => {
  interceptEmail(t);
  const email = `resend-${randomUUID()}@example.test`;
  assert.equal((await post("register", { email, password })).status, 201);
  await db.query("UPDATE email_verification_codes SET created_at=now()-interval '31 seconds' WHERE user_id=(SELECT id FROM users WHERE email=$1)", [email]);
  assert.equal((await post("resend-code", { email })).status, 200);
  assert.equal((await post("verify-email", { email, code: codeFor(email) })).status, 200);
  assert.equal((await post("password-reset/request", { email })).status, 200);
  for (let attempt=0; attempt<50 && !delivered.some(item => item.to[0]?.email===email && item.textContent.includes("восстановления")); attempt++) await new Promise(resolve=>setTimeout(resolve,10));
  const reset = await post("password-reset/verify", { email, code: codeFor(email) });
  assert.equal(reset.status, 200); assert.equal(typeof reset.body.resetToken, "string");
});
