import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { config } from "./config.js";
import { ApiError } from "./errors.js";

export const loginPolicy = { attempts: 5, windowMs: 15 * 60_000, pauseMs: 5 * 60_000 };
export function authSubject(email: string) {
  return createHmac("sha256", config.JWT_SECRET).update(`auth-subject:${email.trim().toLowerCase()}`).digest("hex");
}

// All password login/reset operations lock this row before the user row.
// Unknown email addresses have the same counters and response policy as real ones.
export async function lockLoginAttempts(client: PoolClient, email: string) {
  const key = authSubject(email);
  await client.query("INSERT INTO login_attempts (subject_hash) VALUES ($1) ON CONFLICT DO NOTHING", [key]);
  const result = await client.query<{ failures: number; window_started_at: Date; blocked_until: Date | null }>(
    "SELECT * FROM login_attempts WHERE subject_hash = $1 FOR UPDATE", [key]);
  return { key, ...result.rows[0]! };
}

export function loginPause(until: Date) {
  return new ApiError(429, "LOGIN_PAUSED", "Слишком много попыток. Попробуйте позже или восстановите пароль.",
    Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)));
}

export async function clearLoginAttempts(client: PoolClient, key: string) {
  await client.query("UPDATE login_attempts SET failures = 0, window_started_at = now(), blocked_until = NULL WHERE subject_hash = $1", [key]);
}
