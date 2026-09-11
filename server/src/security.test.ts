import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, hashRefreshToken, hashVerificationCode, hashesMatch, verifyPassword } from "./security.js";

test("password hashes verify only the original password", async () => {
  const hash = await hashPassword("Correct horse 42");
  assert.equal(await verifyPassword("Correct horse 42", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("token and verification hashes are stable but do not expose secrets", () => {
  assert.equal(hashRefreshToken("token"), hashRefreshToken("token"));
  assert.notEqual(hashRefreshToken("token"), "token");
  const codeHash = hashVerificationCode("user-id", "123456");
  assert.equal(hashesMatch(codeHash, hashVerificationCode("user-id", "123456")), true);
  assert.equal(hashesMatch(codeHash, hashVerificationCode("user-id", "654321")), false);
});
