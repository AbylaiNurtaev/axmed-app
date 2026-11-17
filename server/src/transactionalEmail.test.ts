import assert from "node:assert/strict";
import test from "node:test";
import { sendWithEmailApi } from "./transactionalEmail.js";

test("existing Resend delivery keeps its authenticated HTTPS contract", async () => {
  let called = false;
  await sendWithEmailApi({ provider: "resend", apiKey: "fixture-resend-key", from: "AxMed <sender@example.test>" },
    { to: "recipient@example.test", subject: "Verification", text: "Code 123456", html: "<p>123456</p>" },
    (async (input: string | URL | Request, init?: RequestInit) => {
      called = true; assert.equal(input, "https://api.resend.com/emails");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-resend-key");
      assert.equal(new Headers(init?.headers).has("api-key"), false);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.to, "recipient@example.test"); assert.equal(body.from, "AxMed <sender@example.test>");
      assert.equal(body.html, "<p>123456</p>");
      return new Response(JSON.stringify({ id: "accepted" }), { status: 200 });
    }) as typeof fetch);
  assert.equal(called, true);
});

test("HTTPS network failures fail closed without leaking provider error details", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const credential = { provider: "brevo" as const, apiKey: "private-fixture-key", from: "sender@example.test" };
  await assert.rejects(sendWithEmailApi(credential,
    { to: "recipient@example.test", subject: "Verification", text: "Code 123456" },
    (async () => { throw Error("Private provider error private-fixture-key recipient@example.test 123456"); }) as typeof fetch),
    { status: 503, code: "EMAIL_DELIVERY_FAILED" });
  for (const privateText of [credential.apiKey, "recipient@example.test", "123456", "Private provider error"])
    assert.equal(JSON.stringify(logs).includes(privateText), false);
});
