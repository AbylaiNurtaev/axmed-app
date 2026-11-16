import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import pg from "pg";
import { sealCredential } from "./credentialEnvelope.js";

// Manual administrator CLI. It never requires or reads the production JWT key.
const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const keyFile = option("--key-file"); const keyId = option("--key-id"); const teamId = option("--team-id");
const clientId = process.argv.includes("--client-id") ? option("--client-id") : "com.anonymous.pochka2new";
if (!process.env.DATABASE_URL || !keyFile || !keyId || !teamId || !/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId)) {
  throw Error("Set DATABASE_URL and pass --key-file, --key-id and --team-id. Never pass private key contents as a command argument.");
}
const privateKey = readFileSync(keyFile, "utf8");
const parsed = createPrivateKey(privateKey);
if (parsed.asymmetricKeyType !== "ec" || parsed.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw Error("Expected the Apple ES256 .p8 key");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
try {
  const bootstrap = (await pool.query<{ value: { publicKey: string } }>("SELECT value FROM service_credentials WHERE id = 'bootstrap-v1'")).rows[0]?.value;
  if (!bootstrap) throw Error("Deploy the server credential store before running this command.");
  const sealed = sealCredential(bootstrap.publicKey, { teamId, keyId, clientId, privateKey });
  await pool.query("INSERT INTO service_credentials (id,value) VALUES ('apple-sign-in', $1::jsonb) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [JSON.stringify(sealed)]);
  console.log(JSON.stringify({ configured: "apple-sign-in", keyId, teamId, encrypted: true }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Apple configuration failed"); process.exitCode = 1;
} finally { await pool.end(); }
