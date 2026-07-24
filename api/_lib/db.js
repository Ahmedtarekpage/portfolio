// Neon Postgres client + lazy schema creation (runs once per lambda instance).
import { neon } from "@neondatabase/serverless";

let _sql = null;
let _ready = null;

function client() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL env var is not set — add a Neon Postgres database to the Vercel project");
    _sql = neon(url);
  }
  return _sql;
}

async function migrate(sql) {
  await sql`CREATE TABLE IF NOT EXISTS wa_credentials (
    id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    transports TEXT,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    nationality TEXT,
    transaction_type TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS hour_packages (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    hours NUMERIC NOT NULL,
    amount_paid NUMERIC,
    currency TEXT,
    purchased_at DATE NOT NULL,
    expires_at DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS gender TEXT`;
  // read-only share links for clients
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS share_token TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS clients_share_token_idx ON clients (share_token)`;
  // payment-proof attachment (screenshot or PDF) on purchases
  await sql`ALTER TABLE hour_packages ADD COLUMN IF NOT EXISTS proof BYTEA`;
  await sql`ALTER TABLE hour_packages ADD COLUMN IF NOT EXISTS proof_name TEXT`;
  await sql`ALTER TABLE hour_packages ADD COLUMN IF NOT EXISTS proof_type TEXT`;
  await sql`CREATE TABLE IF NOT EXISTS client_sessions (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    hours NUMERIC NOT NULL DEFAULT 1,
    topic TEXT,
    pdf_name TEXT,
    pdf BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // time tracking: daily to-do tasks
  await sql`CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    task_date DATE NOT NULL,
    title TEXT NOT NULL,
    category_id INTEGER,
    planned_hours NUMERIC,
    actual_hours NUMERIC,
    done BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_date_idx ON tasks (task_date)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_category_idx ON tasks (category_id)`;
  // drag-to-reorder position within a day, and a picked emoji icon per task
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS icon TEXT`;

  // one-time rebuild: the old manually-dated "quarters" system is replaced by
  // an auto-computed Year > Virtual-Year > Cycle > Quarter schedule (see
  // api/_lib/cycle.js) with permanent categories and per-cycle goals. If the
  // old tables are still around, this is a fresh install of the new system —
  // wipe them (daily task history is kept, just uncategorized).
  const [{ exists: hasOld }] = await sql`SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'quarter_categories'
  ) AS exists`;
  if (hasOld) {
    await sql`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_category_id_fkey`;
    await sql`UPDATE tasks SET category_id = NULL`;
    await sql`DROP TABLE IF EXISTS goals`;
    await sql`DROP TABLE IF EXISTS quarter_categories`;
    await sql`DROP TABLE IF EXISTS quarters`;
  }

  await sql`CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_category_id_fkey') THEN
      ALTER TABLE tasks ADD CONSTRAINT tasks_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
    END IF;
  END $$`;
  // optional weekly-hour effort target for a category during one specific 42-day cycle
  await sql`CREATE TABLE IF NOT EXISTS cycle_targets (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    cycle_key TEXT NOT NULL,
    weekly_hours NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category_id, cycle_key)
  )`;
  // concrete numeric milestones within a category (e.g. "Job applications: 320/500"),
  // scoped per category PER CYCLE — separate from the weekly-hour effort tracking above
  await sql`CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    cycle_key TEXT NOT NULL,
    title TEXT NOT NULL,
    target NUMERIC NOT NULL,
    current NUMERIC NOT NULL DEFAULT 0,
    unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS goals_cat_cycle_idx ON goals (category_id, cycle_key)`;
}

/** Returns the sql tag, guaranteed to have the schema in place. */
export async function db() {
  const sql = client();
  if (!_ready) _ready = migrate(sql).catch((e) => { _ready = null; throw e; });
  await _ready;
  return sql;
}
