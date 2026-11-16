import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { config } from "./config.js";
import { inTransaction, query } from "./database.js";
import { ApiError } from "./errors.js";
import { verifyPassword } from "./security.js";
import { verifySocialIdentity } from "./social.js";
import { appleRevocationConfigured, revokeAppleAuthorization } from "./appleRevocation.js";
import { processAccountDeletionFiles } from "./accountDeletionFiles.js";
import type { deleteAccountSchema } from "./schemas.js";

type Input = z.infer<typeof deleteAccountSchema>;
type User = { password_hash: string | null; avatar_url: string | null };
type Identity = { provider: "google" | "apple"; provider_user_id: string };
const missing = () => new ApiError(401, "UNAUTHORIZED", "Аккаунт уже удалён или сессия истекла.");

export async function accountDeletionInfo(userId: string) {
  const user = (await query<User>("SELECT password_hash, avatar_url FROM users WHERE id = $1", [userId])).rows[0];
  if (!user) throw missing();
  const identities = await query<Identity>("SELECT provider, provider_user_id FROM auth_identities WHERE user_id = $1", [userId]);
  return { hasPassword: Boolean(user.password_hash), providers: identities.rows.map(row => row.provider), appleRevocationReady: await appleRevocationConfigured() };
}

export function createAccountDeletionService(dependencies = {
  verifyIdentity: verifySocialIdentity,
  revokeApple: revokeAppleAuthorization
}) {
  return async function deleteAccount(userId: string, sessionId: string, input: Input) {
    const user = (await query<User>("SELECT password_hash, avatar_url FROM users WHERE id = $1", [userId])).rows[0];
    if (!user) throw missing();
    const identities = (await query<Identity>("SELECT provider, provider_user_id FROM auth_identities WHERE user_id = $1", [userId])).rows;
    const apple = identities.find(identity => identity.provider === "apple");
    if (apple && input.method !== "apple") throw new ApiError(400, "APPLE_CONFIRMATION_REQUIRED", "Для этого аккаунта подтвердите удаление с Apple.");
    let verifiedSubject: string | undefined;
    if (input.method === "password") {
      if (!user.password_hash || !await verifyPassword(input.password, user.password_hash)) {
        throw new ApiError(403, "DELETION_PASSWORD_INVALID", "Пароль указан неверно. Аккаунт не удалён.");
      }
    } else {
      const verified = await dependencies.verifyIdentity(input.method, input.idToken);
      if (!identities.some(identity => identity.provider === input.method && identity.provider_user_id === verified.subject)) {
        throw new ApiError(403, "DELETION_IDENTITY_MISMATCH", "Выберите тот аккаунт, который связан с AxMed.");
      }
      verifiedSubject = verified.subject;
      if (input.method === "apple") await dependencies.revokeApple(input.authorizationCode, verified.subject);
    }
    // Authentication and provider requests run before taking the account lock.
    await inTransaction(async client => {
      const current = (await client.query<User>("SELECT password_hash, avatar_url FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
      if (!current) throw missing();
      const active = await client.query("SELECT id FROM refresh_tokens WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()", [sessionId, userId]);
      if (!active.rowCount) throw missing();
      if (input.method === "password" && current.password_hash !== user.password_hash) throw new ApiError(409, "DELETION_REAUTH_REQUIRED", "Пароль изменился. Повторите подтверждение.");
      const currentIdentities = await client.query<Identity>("SELECT provider, provider_user_id FROM auth_identities WHERE user_id = $1", [userId]);
      if (input.method !== "apple" && currentIdentities.rows.some(identity => identity.provider === "apple")) throw new ApiError(409, "APPLE_CONFIRMATION_REQUIRED", "Повторите подтверждение с Apple.");
      if (input.method !== "password" && !currentIdentities.rows.some(identity => identity.provider === input.method && identity.provider_user_id === verifiedSubject)) throw new ApiError(409, "DELETION_REAUTH_REQUIRED", "Способ входа изменился. Повторите подтверждение.");
      if (current.avatar_url || config.AWS_BUCKET_NAME) {
        await client.query("INSERT INTO account_deletion_file_jobs (id, object_prefix) VALUES ($1, $2) ON CONFLICT (object_prefix) DO NOTHING", [randomUUID(), `users/${userId}/profile/`]);
      }
      // All account-owned profile, device, measurement, plan and session tables
      // reference users through ON DELETE CASCADE.
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    });
    void processAccountDeletionFiles().catch(() => console.error("Account photo cleanup deferred"));
  };
}

export const deleteAccount = createAccountDeletionService();
