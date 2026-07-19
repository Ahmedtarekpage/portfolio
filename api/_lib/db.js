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
}

/** Returns the sql tag, guaranteed to have the schema in place. */
export async function db() {
  const sql = client();
  if (!_ready) _ready = migrate(sql).catch((e) => { _ready = null; throw e; });
  await _ready;
  return sql;
}
