import pg, { type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  password_hash text,
  email_verified_at timestamptz,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_user_id text NOT NULL,
  provider_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_codes_user_created_idx
  ON email_verification_codes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_address text
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS health_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adapter_id text NOT NULL,
  external_id text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  battery jsonb,
  time_zone text NOT NULL,
  last_read_at timestamptz,
  last_sync_at timestamptz,
  UNIQUE (user_id, adapter_id, external_id)
);
CREATE TABLE IF NOT EXISTS device_readings (
  device_id uuid NOT NULL REFERENCES health_devices(id) ON DELETE CASCADE,
  source_record_id text NOT NULL,
  metric text NOT NULL,
  value double precision NOT NULL,
  unit text NOT NULL,
  recorded_at timestamptz NOT NULL,
  period_end timestamptz,
  local_date date NOT NULL,
  source_read_at timestamptz NOT NULL,
  PRIMARY KEY (device_id, metric, source_record_id)
);
CREATE INDEX IF NOT EXISTS device_readings_date_idx ON device_readings (device_id, recorded_at DESC);
ALTER TABLE device_readings ADD COLUMN IF NOT EXISTS aggregation text;
ALTER TABLE device_readings ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE health_devices ADD COLUMN IF NOT EXISTS sync_version integer;
ALTER TABLE health_devices ADD COLUMN IF NOT EXISTS sync_warnings jsonb;
`;

export async function migrateDatabase() {
  await pool.query(schema);
}

export async function query<Row extends QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<Row>(text, values);
}

export async function inTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
