import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "./config.js";
import { ApiError } from "./errors.js";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export type VerifiedSocialIdentity = {
  provider: "google" | "apple";
  subject: string;
  email: string | null;
  emailVerified: boolean;
};

export async function verifySocialIdentity(
  provider: "google" | "apple",
  idToken: string
): Promise<VerifiedSocialIdentity> {
  try {
    if (provider === "google") {
      if (config.googleClientIds.length === 0) {
        throw new ApiError(503, "GOOGLE_NOT_CONFIGURED", "Google Sign In не настроен на сервере.");
      }

      const { payload } = await jwtVerify(idToken, googleKeys, {
        algorithms: ["RS256"],
        audience: config.googleClientIds,
        issuer: ["accounts.google.com", "https://accounts.google.com"]
      });
      return identityFromPayload("google", payload);
    }

    const { payload } = await jwtVerify(idToken, appleKeys, {
      algorithms: ["RS256"],
      audience: config.APPLE_CLIENT_ID,
      issuer: "https://appleid.apple.com"
    });
    return identityFromPayload("apple", payload);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "INVALID_SOCIAL_TOKEN", "Не удалось подтвердить вход у провайдера.");
  }
}

function identityFromPayload(provider: "google" | "apple", payload: JWTPayload): VerifiedSocialIdentity {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new ApiError(401, "INVALID_SOCIAL_TOKEN", "Провайдер не вернул идентификатор пользователя.");
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  const verifiedClaim = payload.email_verified;
  const emailVerified = verifiedClaim === true || verifiedClaim === "true";

  return { provider, subject: payload.sub, email, emailVerified };
}
