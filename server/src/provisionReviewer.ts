import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inTransaction, pool } from "./database.js";
import { passwordSchema } from "./schemas.js";
import { hashPassword, verifyPassword } from "./security.js";

// Manual administrator command only. Never run at server startup or expose as
// an HTTP endpoint. The password is supplied through the process environment.
export const reviewerEmail = "apple-review@axmed.app";

export async function provisionReviewer(password: string) {
  passwordSchema.parse(password);
  const passwordHash = await hashPassword(password);

  return inTransaction(async client => {
    // Serialize administrator runs without depending on the target server's
    // JWT secret. Normal login throttling remains in force.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [reviewerEmail]);
    const existing = await client.query<{
      id: string;
      password_hash: string | null;
      email_verified_at: Date | null;
    }>("SELECT id, password_hash, email_verified_at FROM users WHERE email = $1 FOR UPDATE", [reviewerEmail]);
    const user = existing.rows[0];
    const passwordMatches = user?.password_hash ? await verifyPassword(password, user.password_hash) : false;
    const credentialsChanged = !passwordMatches || !user?.email_verified_at;
    let userId: string;

    if (user) {
      userId = user.id;
      if (credentialsChanged) {
        await client.query(`UPDATE users SET password_hash = $2,
          email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
          WHERE id = $1`, [userId, passwordMatches ? user.password_hash : passwordHash]);
      }
    } else {
      // ON CONFLICT also handles a registration racing the initial lookup.
      const inserted = await client.query<{ id: string }>(`INSERT INTO users
        (id, email, password_hash, email_verified_at, display_name)
        VALUES ($1, $2, $3, now(), 'Apple Review')
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
          email_verified_at = COALESCE(users.email_verified_at, now()), updated_at = now()
        RETURNING id`, [randomUUID(), reviewerEmail, passwordHash]);
      userId = inserted.rows[0]!.id;
    }

    if (credentialsChanged) {
      await client.query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1", [userId]);
      await client.query("UPDATE password_reset_challenges SET consumed_at = COALESCE(consumed_at, now()) WHERE user_id = $1", [userId]);
      await client.query("UPDATE email_verification_codes SET consumed_at = COALESCE(consumed_at, now()) WHERE user_id = $1", [userId]);
    }
    return { email: reviewerEmail, accountReady: true, emailVerified: true, credentialsChanged };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const password = process.env.AXMED_REVIEW_PASSWORD;
    if (!password) throw new Error("Set AXMED_REVIEW_PASSWORD for this administrator command.");
    console.log(JSON.stringify(await provisionReviewer(password)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Reviewer account setup failed.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
