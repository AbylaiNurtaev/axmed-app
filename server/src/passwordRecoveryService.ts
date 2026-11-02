import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { config } from "./config.js";
import { inTransaction } from "./database.js";
import { ApiError } from "./errors.js";
import { authSubject, clearLoginAttempts, lockLoginAttempts } from "./loginThrottle.js";
import { recoveryEmailConfigured, sendPasswordChangedNotice, sendPasswordResetCode } from "./mailer.js";
import { hashesMatch, hashPassword, hashRefreshToken } from "./security.js";

const policy = { codeSeconds: 600, grantSeconds: 300, resendSeconds: 60, hourlyMessages: 5, attempts: 5 };
const invalidCode = () => new ApiError(400, "INVALID_RESET_CODE", "Неверный или истёкший код.");
const invalidToken = () => new ApiError(400, "INVALID_RESET_TOKEN", "Время восстановления истекло. Запросите новый код.");
function codeHash(id: string, code: string) {
  return createHmac("sha256", config.JWT_SECRET).update(`password-reset:${id}:${code}`).digest("hex");
}
type RequestRow = { send_count: number; verify_attempts: number; window_started_at: Date; last_sent_at: Date | null };
type ChallengeRow = { id: string; code_hash: string; expires_at: Date; verified_at: Date | null };

// Deliberately independent of AUTH_FIXED_VERIFICATION_CODE / AUTH_EXPOSE_DEV_CODE.
// The request response must not reveal whether an address owns a password account.
export async function requestPasswordReset(email: string) {
  if (!recoveryEmailConfigured()) throw new ApiError(503, "RECOVERY_UNAVAILABLE", "Восстановление пароля временно недоступно. Попробуйте позже.");
  const code = randomInt(100_000, 1_000_000).toString();
  const recipient = await inTransaction(async client => {
    const key = authSubject(email);
    await client.query("INSERT INTO password_reset_requests (subject_hash) VALUES ($1) ON CONFLICT DO NOTHING", [key]);
    const result = await client.query<RequestRow>("SELECT * FROM password_reset_requests WHERE subject_hash = $1 FOR UPDATE", [key]);
    const request = result.rows[0]!;
    const now = Date.now();
    const freshWindow = now - request.window_started_at.getTime() >= 3_600_000;
    const count = freshWindow ? 0 : request.send_count;
    if (count >= policy.hourlyMessages) {
      throw new ApiError(429, "RESET_EMAIL_LIMIT", "Слишком много запросов. Попробуйте позже.",
        Math.max(1, Math.ceil((request.window_started_at.getTime() + 3_600_000 - now) / 1000)));
    }
    if (request.last_sent_at && now - request.last_sent_at.getTime() < policy.resendSeconds * 1000) {
      throw new ApiError(429, "RESET_CODE_COOLDOWN", "Подождите перед повторной отправкой кода.",
        Math.max(1, Math.ceil((request.last_sent_at.getTime() + policy.resendSeconds * 1000 - now) / 1000)));
    }
    await client.query(`UPDATE password_reset_requests SET send_count = $2, last_sent_at = now(), verify_attempts = 0,
      window_started_at = CASE WHEN $3 THEN now() ELSE window_started_at END WHERE subject_hash = $1`, [key, count + 1, freshWindow]);
    const users = await client.query<{ id: string; password_hash: string | null; email_verified_at: Date | null }>(
      "SELECT id, password_hash, email_verified_at FROM users WHERE email = $1 FOR UPDATE", [email]);
    const user = users.rows[0];
    if (!user?.password_hash || !user.email_verified_at) return null;
    await client.query("UPDATE password_reset_challenges SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL", [user.id]);
    const id = randomUUID();
    await client.query(`INSERT INTO password_reset_challenges (id, user_id, code_hash, expires_at)
      VALUES ($1, $2, $3, now() + interval '10 minutes')`, [id, user.id, codeHash(id, code)]);
    return email;
  });
  // Delivery runs independently so SMTP latency/failures cannot enumerate accounts.
  // A lost/failed email can be requested again after the same server-side cooldown.
  if (recipient) void sendPasswordResetCode(recipient, code).catch(() => console.error("Password recovery email delivery failed"));
  return { message: "Если аккаунт с таким email существует, мы отправим код восстановления.",
    expiresIn: policy.codeSeconds, resendAfter: policy.resendSeconds };
}

export async function verifyPasswordResetCode(email: string, code: string) {
  const outcome = await inTransaction(async client => {
    const requestResult = await client.query<RequestRow>("SELECT * FROM password_reset_requests WHERE subject_hash = $1 FOR UPDATE", [authSubject(email)]);
    const request = requestResult.rows[0];
    if (!request?.last_sent_at || Date.now() - request.last_sent_at.getTime() >= policy.codeSeconds * 1000) {
      return { error: invalidCode() } as const;
    }
    if (request.verify_attempts >= policy.attempts) {
      return { error: new ApiError(429, "RESET_CODE_ATTEMPTS_EXCEEDED", "Слишком много попыток. Запросите новый код.") } as const;
    }
    await client.query("UPDATE password_reset_requests SET verify_attempts = verify_attempts + 1 WHERE subject_hash = $1", [authSubject(email)]);
    const failure = request.verify_attempts + 1 >= policy.attempts
      ? new ApiError(429, "RESET_CODE_ATTEMPTS_EXCEEDED", "Слишком много попыток. Запросите новый код.") : invalidCode();
    const user = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1 AND password_hash IS NOT NULL AND email_verified_at IS NOT NULL FOR UPDATE", [email]);
    if (!user.rows[0]) return { error: failure } as const;
    const result = await client.query<ChallengeRow>(`SELECT id, code_hash, expires_at, verified_at FROM password_reset_challenges
      WHERE user_id = $1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [user.rows[0].id]);
    const record = result.rows[0];
    if (!record || record.verified_at || record.expires_at.getTime() <= Date.now()) return { error: failure } as const;
    if (!hashesMatch(record.code_hash, codeHash(record.id, code))) {
      await client.query("UPDATE password_reset_challenges SET attempts = attempts + 1 WHERE id = $1", [record.id]);
      return { error: failure } as const;
    }
    const token = randomBytes(32).toString("base64url");
    await client.query(`UPDATE password_reset_challenges SET verified_at = now(), token_hash = $2,
      token_expires_at = now() + interval '5 minutes' WHERE id = $1`, [record.id, hashRefreshToken(token)]);
    return { resetToken: token, expiresIn: policy.grantSeconds };
  });
  if ("error" in outcome) throw outcome.error;
  return outcome;
}

export async function resetPassword(email: string, resetToken: string, password: string) {
  const passwordHash = await hashPassword(password);
  await inTransaction(async client => {
    const attempts = await lockLoginAttempts(client, email);
    const userResult = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1 AND password_hash IS NOT NULL AND email_verified_at IS NOT NULL FOR UPDATE", [email]);
    const user = userResult.rows[0];
    if (!user) throw invalidToken();
    const challenge = await client.query<{ id: string }>(`SELECT id FROM password_reset_challenges WHERE user_id = $1
      AND token_hash = $2 AND verified_at IS NOT NULL AND consumed_at IS NULL AND token_expires_at > now() FOR UPDATE`,
      [user.id, hashRefreshToken(resetToken)]);
    if (!challenge.rows[0]) throw invalidToken();
    await client.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [user.id, passwordHash]);
    await client.query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1", [user.id]);
    await client.query("UPDATE password_reset_challenges SET consumed_at = COALESCE(consumed_at, now()) WHERE user_id = $1", [user.id]);
    await clearLoginAttempts(client, attempts.key);
  });
  void sendPasswordChangedNotice(email).catch(() => console.error("Password change notification delivery failed"));
}
