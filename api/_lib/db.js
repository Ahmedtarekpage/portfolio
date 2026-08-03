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
  // time tracking: quarterly category goals + daily to-do tasks
  await sql`CREATE TABLE IF NOT EXISTS quarters (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // anti-perfectionist mode: count 75% of the full weekly x weeks target as "done"
  await sql`ALTER TABLE quarters ADD COLUMN IF NOT EXISTS anti_perfectionist BOOLEAN NOT NULL DEFAULT false`;
  await sql`CREATE TABLE IF NOT EXISTS quarter_categories (
    id SERIAL PRIMARY KEY,
    quarter_id INTEGER NOT NULL REFERENCES quarters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    weekly_hours NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // categories can now be goals-only (no hour target) — e.g. "Cashflow milestones"
  await sql`ALTER TABLE quarter_categories ALTER COLUMN weekly_hours DROP NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    task_date DATE NOT NULL,
    title TEXT NOT NULL,
    category_id INTEGER REFERENCES quarter_categories(id) ON DELETE SET NULL,
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
  // stamped when a task is marked done -- powers the "completed by hour" chart
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`;
  // the abandoned rebuild also re-pointed tasks.category_id at its new "categories"
  // table -- re-point it back at quarter_categories, nulling out any rows whose
  // id no longer resolves (those two tables use unrelated id sequences)
  await sql`DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.constraint_column_usage
      WHERE constraint_name = 'tasks_category_id_fkey' AND table_name = 'categories'
    ) THEN
      ALTER TABLE tasks DROP CONSTRAINT tasks_category_id_fkey;
      UPDATE tasks SET category_id = NULL
        WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM quarter_categories);
      ALTER TABLE tasks ADD CONSTRAINT tasks_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES quarter_categories(id) ON DELETE SET NULL;
    END IF;
  END $$`;
  // an earlier, abandoned rebuild left behind a differently-shaped "goals" table
  // (cycle_key NOT NULL, category_id -> categories) -- drop it so it can be
  // recreated fresh with the shape this version of the app actually uses
  await sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'cycle_key') THEN
      DROP TABLE goals;
    END IF;
  END $$`;
  // concrete numeric milestones within a category (e.g. "Job applications: 320/500"),
  // separate from the weekly-hour effort tracking above
  await sql`CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES quarter_categories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target NUMERIC NOT NULL,
    current NUMERIC NOT NULL DEFAULT 0,
    unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS goals_category_idx ON goals (category_id)`;
  // drag-to-reorder position, shared across all of a quarter's goals (not just
  // within one category) so the flat "all goals" view can be reordered too
  await sql`ALTER TABLE goals ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0`;
  // hidden from the flat "All goals" view only (by-category view always shows
  // everything) — stored server-side so it's the same on every device, not
  // just the browser that clicked "hide"
  await sql`ALTER TABLE goals ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false`;
  // one optional uploaded thumbnail per day, for the Days gallery tab —
  // stored as a data: URL (client resizes/compresses before upload)
  await sql`CREATE TABLE IF NOT EXISTS day_photos (
    task_date DATE PRIMARY KEY,
    photo_data TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // Health tab: one mood check-in per day (doctor-recommended daily mood tracking)
  await sql`CREATE TABLE IF NOT EXISTS moods (
    mood_date DATE PRIMARY KEY,
    emoji TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // Health tab: CBT-style thought records (thought -> feeling -> reframe),
  // not tied to a specific day — added whenever an idea/thought comes up
  await sql`CREATE TABLE IF NOT EXISTS thoughts (
    id SERIAL PRIMARY KEY,
    thought TEXT NOT NULL,
    feeling TEXT,
    reframe TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS thoughts_created_idx ON thoughts (created_at DESC)`;
}

/** Returns the sql tag, guaranteed to have the schema in place. */
export async function db() {
  const sql = client();
  if (!_ready) _ready = migrate(sql).catch((e) => { _ready = null; throw e; });
  await _ready;
  return sql;
}
