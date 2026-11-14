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
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_address text
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

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
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text CHECK (gender IS NULL OR gender IN ('male', 'female'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS profile_goals (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_key text,
  title text NOT NULL,
  category text NOT NULL,
  icon text NOT NULL,
  color text NOT NULL,
  current_value numeric(12, 2) NOT NULL DEFAULT 0,
  target_value numeric(12, 2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  due_date date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS metric_key text NOT NULL DEFAULT 'custom';
ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS start_value numeric(12, 2) NOT NULL DEFAULT 0;
UPDATE profile_goals SET start_value = current_value WHERE start_value = 0 AND current_value <> 0;
ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'daily';
ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS reminder_time text;
ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS next_action text NOT NULL DEFAULT '';
ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS progress_source text NOT NULL DEFAULT 'manual';
ALTER TABLE profile_goals ADD COLUMN IF NOT EXISTS source_recorded_at timestamptz;

CREATE TABLE IF NOT EXISTS goal_checkins (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES profile_goals(id) ON DELETE CASCADE,
  completed_on date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, completed_on)
);

CREATE INDEX IF NOT EXISTS profile_goals_user_order_idx
  ON profile_goals (user_id, status, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS goal_checkins_user_date_idx
  ON goal_checkins (user_id, completed_on DESC);

CREATE TABLE IF NOT EXISTS plan_tasks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES profile_goals(id) ON DELETE SET NULL,
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  due_at timestamptz,
  due_local_date date,
  time_zone text NOT NULL DEFAULT 'UTC',
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekdays', 'weekly', 'custom')),
  recurrence_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  reminder_enabled boolean NOT NULL DEFAULT false,
  reminder_minutes_before integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_task_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES plan_tasks(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'skipped')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, occurrence_date)
);

CREATE TABLE IF NOT EXISTS plan_habits (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES profile_goals(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'leaf-outline',
  color text NOT NULL DEFAULT '#237354',
  schedule_type text NOT NULL DEFAULT 'daily' CHECK (schedule_type IN ('daily', 'weekdays', 'days', 'timesPerWeek', 'custom')),
  schedule_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_per_week integer NOT NULL DEFAULT 7,
  reminder_enabled boolean NOT NULL DEFAULT false,
  reminder_time text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_habit_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES plan_habits(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'skipped')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, local_date)
);

CREATE TABLE IF NOT EXISTS goal_activity_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES profile_goals(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL,
  value numeric(12, 2),
  unit text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

CREATE TABLE IF NOT EXISTS plan_point_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  event_type text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  points integer NOT NULL CHECK (points >= 0 AND points <= 1000),
  local_date date NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

CREATE TABLE IF NOT EXISTS plan_achievements (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS plan_tasks_user_date_idx ON plan_tasks (user_id, due_local_date, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_task_events_user_date_idx ON plan_task_events (user_id, occurrence_date DESC);
CREATE INDEX IF NOT EXISTS plan_habits_user_idx ON plan_habits (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_habit_events_user_date_idx ON plan_habit_events (user_id, local_date DESC);
CREATE INDEX IF NOT EXISTS goal_activity_events_goal_idx ON goal_activity_events (goal_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS plan_point_events_user_date_idx ON plan_point_events (user_id, local_date DESC);
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
