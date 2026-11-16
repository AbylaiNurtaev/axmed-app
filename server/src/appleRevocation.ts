import { importPKCS8, SignJWT } from "jose";
import { config } from "./config.js";
import { ApiError } from "./errors.js";
import { verifySocialIdentity } from "./social.js";
import { z } from "zod";
import { readServiceCredential } from "./serviceCredentialStore.js";

const credentialsSchema = z.object({ teamId: z.string().regex(/^[A-Z0-9]{10}$/), keyId: z.string().regex(/^[A-Z0-9]{10}$/), clientId: z.string(), privateKey: z.string().min(100).max(10_000) });
async function appleCredentials() {
  if (config.APPLE_TEAM_ID && config.APPLE_SIGN_IN_KEY_ID && config.APPLE_SIGN_IN_PRIVATE_KEY) {
    return { teamId: config.APPLE_TEAM_ID, keyId: config.APPLE_SIGN_IN_KEY_ID, clientId: config.APPLE_CLIENT_ID, privateKey: config.APPLE_SIGN_IN_PRIVATE_KEY };
  }
  const value = await readServiceCredential("apple-sign-in");
  if (!value) return undefined;
  const parsed = credentialsSchema.parse(value);
  if (parsed.clientId !== config.APPLE_CLIENT_ID) throw new Error("Apple credential client mismatch");
  return parsed;
}
export async function appleRevocationConfigured() {
  try { return Boolean(await appleCredentials()); } catch { return false; }
}

// Obtain a fresh authorization code on the device. Never store a provider token
// in logs, in the user profile, or in the application's own session token.
export function createAppleAuthorizationRevoker(dependencies = {
  credentials: appleCredentials,
  verifyIdentity: verifySocialIdentity,
  request: fetch
}) {
return async function revokeAppleAuthorization(code: string, expectedSubject: string) {
  let credentials: Awaited<ReturnType<typeof appleCredentials>>;
  try { credentials = await dependencies.credentials(); } catch { /* Report a safe error below. */ }
  if (!credentials) {
    throw new ApiError(503, "APPLE_REVOCATION_UNAVAILABLE", "Удаление аккаунта с Apple временно недоступно. Попробуйте позже.");
  }
  const key = await importPKCS8(credentials.privateKey.replace(/\\n/g, "\n"), "ES256");
  const clientSecret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: credentials.keyId })
    .setIssuer(credentials.teamId).setSubject(config.APPLE_CLIENT_ID)
    .setAudience("https://appleid.apple.com").setIssuedAt().setExpirationTime("5m").sign(key);
  const grant = await appleRequest("token", {
    client_id: config.APPLE_CLIENT_ID, client_secret: clientSecret,
    code, grant_type: "authorization_code"
  }, dependencies.request);
  if (typeof grant.id_token !== "string") throw appleError();
  const identity = await dependencies.verifyIdentity("apple", grant.id_token);
  if (identity.subject !== expectedSubject) throw new ApiError(403, "DELETION_IDENTITY_MISMATCH", "Подтвердите тот Apple ID, который связан с этим аккаунтом.");
  const token = typeof grant.refresh_token === "string" ? grant.refresh_token : grant.access_token;
  if (typeof token !== "string" || !token) throw appleError();
  await appleRequest("revoke", {
    client_id: config.APPLE_CLIENT_ID, client_secret: clientSecret, token,
    token_type_hint: typeof grant.refresh_token === "string" ? "refresh_token" : "access_token"
  }, dependencies.request);
};
}

export const revokeAppleAuthorization = createAppleAuthorizationRevoker();

function appleError() {
  return new ApiError(502, "APPLE_REVOCATION_FAILED", "Apple не подтвердил отключение аккаунта. Повторите подтверждение с Apple.");
}

async function appleRequest(action: "token" | "revoke", body: Record<string, string>, request: typeof fetch): Promise<Record<string, unknown>> {
  try {
    const response = await request(`https://appleid.apple.com/auth/${action}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body), signal: AbortSignal.timeout(4500)
    });
    if (!response.ok) throw appleError();
    const text = await response.text();
    return text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw appleError();
  }
}
