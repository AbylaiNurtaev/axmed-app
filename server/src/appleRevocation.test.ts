import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { importSPKI, jwtVerify } from "jose";
import { createAppleAuthorizationRevoker } from "./appleRevocation.js";
import { config } from "./config.js";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const credentials = { teamId: "TESTTEAM01", keyId: "TESTKEY001", clientId: config.APPLE_CLIENT_ID, privateKey: pair.privateKey };

function fixture(options: { subject?: string; tokenStatus?: number; revokeStatus?: number; accessOnly?: boolean; available?: boolean; missingToken?: boolean } = {}) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const revoke = createAppleAuthorizationRevoker({
    credentials: async () => options.available === false ? undefined : credentials,
    verifyIdentity: async provider => ({provider, subject: options.subject ?? "linked-subject", email: null, emailVerified: true}),
    request: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({url:String(url), body:new URLSearchParams(init?.body as URLSearchParams)});
      if (String(url).endsWith("/token")) return Response.json({id_token:"signed-provider-token", ...(options.missingToken ? {} : options.accessOnly ? {access_token:"access-fixture"} : {refresh_token:"refresh-fixture"})}, {status:options.tokenStatus ?? 200});
      return new Response(null, {status:options.revokeStatus ?? 200});
    }) as typeof fetch
  });
  return {calls, revoke};
}

test("Apple deletion exchanges a fresh code and revokes its refresh token using a signed, short-lived client secret", async () => {
  const {calls, revoke} = fixture();
  await revoke("fresh-code", "linked-subject");
  assert.deepEqual(calls.map(call => call.url), ["https://appleid.apple.com/auth/token", "https://appleid.apple.com/auth/revoke"]);
  assert.equal(calls[0]!.body.get("grant_type"), "authorization_code");
  assert.equal(calls[0]!.body.get("code"), "fresh-code");
  assert.equal(calls[1]!.body.get("token"), "refresh-fixture");
  assert.equal(calls[1]!.body.get("token_type_hint"), "refresh_token");
  const secret = calls[0]!.body.get("client_secret")!;
  assert.equal(calls[1]!.body.get("client_secret"), secret);
  const {payload, protectedHeader} = await jwtVerify(secret, await importSPKI(pair.publicKey, "ES256"), {issuer:credentials.teamId, subject:config.APPLE_CLIENT_ID, audience:"https://appleid.apple.com"});
  assert.equal(protectedHeader.kid, credentials.keyId);
  assert.equal(payload.exp! - payload.iat!, 300);
});

test("Apple access-token fallback is revoked when no refresh token is returned", async () => {
  const {calls, revoke} = fixture({accessOnly:true});
  await revoke("fresh-code", "linked-subject");
  assert.equal(calls[1]!.body.get("token_type_hint"), "access_token");
  assert.equal(calls[1]!.body.get("token"), "access-fixture");
});

test("a different Apple subject or failed code exchange never reaches revocation", async () => {
  for (const options of [{subject:"another-person"}, {tokenStatus:400}, {missingToken:true}]) {
    const {calls, revoke} = fixture(options);
    await assert.rejects(revoke("fresh-code", "linked-subject"));
    assert.equal(calls.length, 1);
  }
});

test("missing configuration and failed revocation are reported without claiming success", async () => {
  const absent = fixture({available:false});
  await assert.rejects(absent.revoke("fresh-code", "linked-subject"), {code:"APPLE_REVOCATION_UNAVAILABLE"});
  assert.equal(absent.calls.length, 0);
  const failed = fixture({revokeStatus:500});
  await assert.rejects(failed.revoke("fresh-code", "linked-subject"), {code:"APPLE_REVOCATION_FAILED"});
});
