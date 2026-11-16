import { config } from "./config.js";
import { query } from "./database.js";
import { createCredentialBootstrap, openCredential, type CredentialBootstrap, type SealedCredential } from "./credentialEnvelope.js";

export async function ensureServiceCredentialStore() {
  if ((await query("SELECT id FROM service_credentials WHERE id = 'bootstrap-v1'")).rowCount) return;
  const bootstrap = createCredentialBootstrap(config.JWT_SECRET);
  await query("INSERT INTO service_credentials (id, value) VALUES ('bootstrap-v1', $1::jsonb) ON CONFLICT (id) DO NOTHING", [JSON.stringify(bootstrap)]);
}
export async function readServiceCredential(id: string) {
  const result = await query<{ id: string; value: unknown }>("SELECT id, value FROM service_credentials WHERE id IN ('bootstrap-v1', $1)", [id]);
  const bootstrap = result.rows.find(row => row.id === "bootstrap-v1")?.value as CredentialBootstrap | undefined;
  const credential = result.rows.find(row => row.id === id)?.value as SealedCredential | undefined;
  if (!bootstrap || !credential) return undefined;
  return openCredential(credential, bootstrap, config.JWT_SECRET);
}
