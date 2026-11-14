import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { config } from "./config.js";
import { inTransaction, query } from "./database.js";
import { ApiError } from "./errors.js";
import { sendVerificationCode } from "./mailer.js";
import {
  createSession,
  createVerificationCode,
  hashPassword,
  hashRefreshToken,
  hashesMatch,
  hashVerificationCode,
  verifyPassword,
  type PublicUser,
  type SessionResponse
} from "./security.js";
import { verifySocialIdentity } from "./social.js";
import { clearLoginAttempts, lockLoginAttempts, loginPause, loginPolicy } from "./loginThrottle.js";

const dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));

type UserRow = {
  id: string;
  email: string | null;
  password_hash: string | null;
  email_verified_at: Date | null;
  display_name: string | null;
};

type RequestMetadata = { userAgent?: string; ip?: string };

export async function registerWithEmail(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  const code = createVerificationCode();

  const userId = await inTransaction(async (client) => {
    const existingResult = await client.query<UserRow>("SELECT * FROM users WHERE email = $1 FOR UPDATE", [email]);
    const existing = existingResult.rows[0];

    if (existing?.email_verified_at) {
      throw new ApiError(409, "ACCOUNT_EXISTS", "Аккаунт с таким email уже существует. Войдите с паролем.");
    }

    const id = existing?.id ?? randomUUID();
    if (existing) {
      await client.query(
        "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
        [passwordHash, id]
      );
    } else {
      await client.query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
        [id, email, passwordHash]
      );
    }

    await client.query(
      "UPDATE email_verification_codes SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
      [id]
    );
    await client.query(
      `INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 * interval '1 minute'))`,
      [randomUUID(), id, hashVerificationCode(id, code), config.VERIFICATION_CODE_TTL_MINUTES]
    );
    return id;
  });

  await sendVerificationCode(email, code);
  return verificationResponse(email, code, userId);
}

export async function resendVerificationCode(email: string) {
  const code = createVerificationCode();
  const userId = await inTransaction(async (client) => {
    const userResult = await client.query<UserRow>("SELECT * FROM users WHERE email = $1 FOR UPDATE", [email]);
    const user = userResult.rows[0];
    if (!user) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Аккаунт с таким email не найден.");
    if (user.email_verified_at) throw new ApiError(409, "EMAIL_ALREADY_VERIFIED", "Email уже подтверждён.");

    const recent = await client.query<{ created_at: Date }>(
      "SELECT created_at FROM email_verification_codes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );
    const createdAt = recent.rows[0]?.created_at;
    if (createdAt && Date.now() - createdAt.getTime() < 30_000) {
      throw new ApiError(429, "CODE_COOLDOWN", "Новый код можно запросить через 30 секунд.");
    }

    await client.query(
      "UPDATE email_verification_codes SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
      [user.id]
    );
    await client.query(
      `INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 * interval '1 minute'))`,
      [randomUUID(), user.id, hashVerificationCode(user.id, code), config.VERIFICATION_CODE_TTL_MINUTES]
    );
    return user.id;
  });

  await sendVerificationCode(email, code);
  return verificationResponse(email, code, userId);
}

export async function verifyEmail(email: string, code: string, metadata: RequestMetadata): Promise<SessionResponse> {
  const outcome = await inTransaction(async (client) => {
    const userResult = await client.query<UserRow>("SELECT * FROM users WHERE email = $1 FOR UPDATE", [email]);
    const user = userResult.rows[0];
    if (!user) return { error: new ApiError(400, "INVALID_CODE", "Неверный или истёкший код.") } as const;

    if (user.email_verified_at) {
      return { error: new ApiError(409, "EMAIL_ALREADY_VERIFIED", "Email уже подтверждён. Войдите с паролем.") } as const;
    }

    const codeResult = await client.query<{
      id: string;
      code_hash: string;
      expires_at: Date;
      attempts: number;
    }>(
      `SELECT id, code_hash, expires_at, attempts
       FROM email_verification_codes
       WHERE user_id = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [user.id]
    );
    const record = codeResult.rows[0];
    if (!record || record.expires_at.getTime() <= Date.now()) {
      return { error: new ApiError(400, "CODE_EXPIRED", "Код истёк. Запросите новый.") } as const;
    }
    if (record.attempts >= 5) {
      return { error: new ApiError(429, "CODE_ATTEMPTS_EXCEEDED", "Слишком много попыток. Запросите новый код.") } as const;
    }

    const correct = hashesMatch(record.code_hash, hashVerificationCode(user.id, code));
    if (!correct) {
      await client.query("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1", [record.id]);
      return { error: new ApiError(400, "INVALID_CODE", "Неверный код.") } as const;
    }

    await client.query("UPDATE email_verification_codes SET consumed_at = now() WHERE id = $1", [record.id]);
    const verifiedResult = await client.query<UserRow>(
      "UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1 RETURNING *",
      [user.id]
    );
    return createSession(client, toPublicUser(verifiedResult.rows[0]!), metadata);
  });

  if ("error" in outcome) throw outcome.error;
  return outcome;
}

export async function loginWithEmail(email: string, password: string, metadata: RequestMetadata) {
  const outcome = await inTransaction(async client => {
    const attempts = await lockLoginAttempts(client, email);
    const now = Date.now();
    if (attempts.blocked_until && attempts.blocked_until.getTime() > now) {
      return { error: loginPause(attempts.blocked_until) } as const;
    }
    const freshWindow = Boolean(attempts.blocked_until) || now - attempts.window_started_at.getTime() >= loginPolicy.windowMs;
    const result = await client.query<UserRow>("SELECT * FROM users WHERE email = $1 FOR UPDATE", [email]);
    const user = result.rows[0];
    const valid = await verifyPassword(password, user?.password_hash ?? await dummyPasswordHash);
    if (!user?.password_hash || !valid) {
      const failures = (freshWindow ? 0 : attempts.failures) + 1;
      const until = failures >= loginPolicy.attempts ? new Date(now + loginPolicy.pauseMs) : null;
      await client.query(`UPDATE login_attempts SET failures = $2, blocked_until = $3,
        window_started_at = CASE WHEN $4 THEN now() ELSE window_started_at END WHERE subject_hash = $1`,
        [attempts.key, failures, until, freshWindow]);
      return { error: until ? loginPause(until) : new ApiError(401, "INVALID_CREDENTIALS", "Неверный email или пароль.") } as const;
    }
    await clearLoginAttempts(client, attempts.key);
    if (!user.email_verified_at) return { error: new ApiError(403, "EMAIL_NOT_VERIFIED", "Сначала подтвердите email.") } as const;
    return createSession(client, toPublicUser(user), metadata);
  });
  if ("error" in outcome) throw outcome.error;
  return outcome;
}

export async function authenticateSocial(
  input: {
    provider: "google" | "apple";
    mode: "signUp" | "signIn";
    idToken: string;
    profile?: { name?: string | null; givenName?: string | null; familyName?: string | null };
  },
  metadata: RequestMetadata
) {
  const identity = await verifySocialIdentity(input.provider, input.idToken);
  const displayName = cleanDisplayName(input.profile);

  return inTransaction(async (client) => {
    const identityResult = await client.query<UserRow>(
      `SELECT u.* FROM auth_identities ai
       JOIN users u ON u.id = ai.user_id
       WHERE ai.provider = $1 AND ai.provider_user_id = $2
       FOR UPDATE OF u`,
      [identity.provider, identity.subject]
    );
    let user = identityResult.rows[0];

    if (!user && identity.email && identity.emailVerified) {
      const emailResult = await client.query<UserRow>("SELECT * FROM users WHERE email = $1 FOR UPDATE", [identity.email]);
      user = emailResult.rows[0];
    }

    if (!user && input.mode === "signIn") {
      throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Аккаунт не найден. Сначала создайте его.");
    }

    if (!user) {
      const created = await client.query<UserRow>(
        `INSERT INTO users (id, email, email_verified_at, display_name)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [randomUUID(), identity.email, identity.emailVerified ? new Date() : null, displayName]
      );
      user = created.rows[0]!;
    } else if (!user.display_name && displayName) {
      const updated = await client.query<UserRow>(
        "UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2 RETURNING *",
        [displayName, user.id]
      );
      user = updated.rows[0]!;
    }

    await client.query(
      `INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_email)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_user_id) DO NOTHING`,
      [randomUUID(), user.id, identity.provider, identity.subject, identity.email]
    );

    return createSession(client, toPublicUser(user), metadata);
  });
}

export async function rotateRefreshToken(refreshToken: string, metadata: RequestMetadata) {
  const result = await inTransaction(async (client) => {
    // Serialize refresh creation against password resets, which revoke all sessions.
    const owner = await client.query<{ user_id: string }>("SELECT user_id FROM refresh_tokens WHERE token_hash = $1", [hashRefreshToken(refreshToken)]);
    if (!owner.rows[0]) return null;
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [owner.rows[0].user_id]);
    const tokenResult = await client.query<UserRow & { token_id: string; expires_at: Date; revoked_at: Date | null }>(
      `SELECT u.*, rt.id AS token_id, rt.expires_at, rt.revoked_at
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 FOR UPDATE OF rt`,
      [hashRefreshToken(refreshToken)]
    );
    const record = tokenResult.rows[0];
    if (!record || record.revoked_at || record.expires_at.getTime() <= Date.now()) return null;

    await client.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [record.token_id]);
    return createSession(client, toPublicUser(record), metadata);
  });

  if (!result) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Сессия истекла. Войдите снова.");
  return result;
}

export async function revokeRefreshToken(refreshToken: string) {
  await query(
    "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1",
    [hashRefreshToken(refreshToken)]
  );
}

export type ActiveSession = {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export async function listActiveSessions(userId: string, currentSessionId: string): Promise<ActiveSession[]> {
  const result = await query<{ id: string; user_agent: string | null; created_at: Date; last_seen_at: Date; expires_at: Date }>(
    `SELECT id, user_agent, created_at, last_seen_at, expires_at FROM refresh_tokens
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_seen_at DESC`, [userId]
  );
  return result.rows.map(row => ({
    id: row.id,
    current: row.id === currentSessionId,
    device: sessionDevice(row.user_agent),
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    expiresAt: row.expires_at.toISOString()
  }));
}

export async function changePassword(userId: string, currentSessionId: string, currentPassword: string, newPassword: string) {
  const result = await query<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const hash = result.rows[0]?.password_hash;
  if (!hash) throw new ApiError(409, "PASSWORD_NOT_CONFIGURED", "Для этого способа входа пароль пока не настроен.");
  if (!await verifyPassword(currentPassword, hash)) throw new ApiError(400, "CURRENT_PASSWORD_INVALID", "Текущий пароль указан неверно.");
  const nextHash = await hashPassword(newPassword);
  await inTransaction(async client => {
    await client.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [userId, nextHash]);
    await client.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL", [userId, currentSessionId]);
  });
}

export async function revokeSession(userId: string, sessionId: string) {
  const result = await query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id", [sessionId, userId]);
  if (!result.rowCount) throw new ApiError(404, "SESSION_NOT_FOUND", "Сессия не найдена.");
}

export async function revokeAllSessions(userId: string) {
  await query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
}

function sessionDevice(userAgent: string | null) {
  if (!userAgent) return "Неизвестное устройство";
  if (/iPhone|iOS/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Macintosh|Mac OS/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows";
  return userAgent.slice(0, 80);
}

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    emailVerified: Boolean(user.email_verified_at)
  };
}

function verificationResponse(email: string, code: string, _userId: string) {
  return {
    email,
    requiresVerification: true as const,
    expiresIn: config.VERIFICATION_CODE_TTL_MINUTES * 60,
    ...(config.AUTH_EXPOSE_DEV_CODE && config.NODE_ENV !== "production" ? { verificationCode: code } : {})
  };
}

function cleanDisplayName(profile: { name?: string | null; givenName?: string | null; familyName?: string | null } | undefined) {
  const raw = profile?.name ?? [profile?.givenName, profile?.familyName].filter(Boolean).join(" ");
  const cleaned = raw?.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}
