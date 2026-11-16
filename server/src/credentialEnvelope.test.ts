import assert from "node:assert/strict";
import test from "node:test";
import { createCredentialBootstrap, openCredential, sealCredential } from "./credentialEnvelope.js";

test("administrator can provision a secret using only the server's public key", () => {
  const secret = "fixture-server-secret-with-more-than-thirty-two-characters";
  const bootstrap = createCredentialBootstrap(secret);
  const value = { keyId: "TESTKEY001", privateKey: "fixture-sensitive-content" };
  const sealed = sealCredential(bootstrap.publicKey, value);
  assert.deepEqual(openCredential(sealed, bootstrap, secret), value);
  assert.ok(!JSON.stringify({ bootstrap, sealed }).includes(value.privateKey));
  assert.throws(() => openCredential(sealed, bootstrap, "wrong-server-secret"));
  const changed = { ...sealed, tag: Buffer.alloc(16).toString("base64url") };
  assert.throws(() => openCredential(changed, bootstrap, secret));
  const another = createCredentialBootstrap(secret);
  assert.throws(() => openCredential(sealed, another, secret));
});
