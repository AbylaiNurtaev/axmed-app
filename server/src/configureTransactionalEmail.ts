import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";
import { sealCredential } from "./credentialEnvelope.js";
import { emailApiCredentialSchema, senderAddress } from "./transactionalEmail.js";

const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const keyFile = option("--key-file");
if (!process.env.DATABASE_URL || !keyFile) throw Error("Set DATABASE_URL and pass --provider, --key-file and --from. Never pass API keys on the command line.");
const credential = emailApiCredentialSchema.parse({ provider: option("--provider"), apiKey: readFileSync(keyFile, "utf8").trim(), from: option("--from") });
senderAddress(credential.from);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
try {
  const bootstrap = (await pool.query<{ value: { publicKey: string } }>("SELECT value FROM service_credentials WHERE id = 'bootstrap-v1'")).rows[0]?.value;
  if (!bootstrap) throw Error("Deploy the server credential store before configuring email.");
  const value = sealCredential(bootstrap.publicKey, credential);
  await pool.query("INSERT INTO service_credentials (id,value) VALUES ('transactional-email',$1::jsonb) ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value, updated_at=now()", [JSON.stringify(value)]);
  console.log(JSON.stringify({ configured: "transactional-email", provider: credential.provider, encrypted: true }));
} catch {
  console.error("Email configuration failed; check database access and the server bootstrap."); process.exitCode = 1;
} finally { await pool.end(); }
