import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let dbInstance: Database.Database | null = null;

export function setDbInstance(db: Database.Database | null) {
  if (dbInstance && dbInstance !== db) {
    try {
      dbInstance.close();
    } catch {}
  }
  dbInstance = db;
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  let db: Database.Database;

  if (isTest) {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    dbInstance = db;
    return db;
  }

  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'splitpay.db');
  db = new Database(dbPath);

  // Enable WAL mode for high concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);

  dbInstance = db;
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      host_key_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      host_upi_vpa TEXT NOT NULL,
      host_upi_name TEXT NOT NULL,
      fee_mode TEXT NOT NULL DEFAULT 'proportional',
      status TEXT NOT NULL DEFAULT 'setup',
      receipt_total_paise INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      is_host INTEGER NOT NULL DEFAULT 0,
      pay_status TEXT NOT NULL DEFAULT 'unpaid',
      paid_amount_paise INTEGER NOT NULL DEFAULT 0,
      covered_by TEXT REFERENCES participants(id) ON DELETE SET NULL,
      joined_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_paise INTEGER NOT NULL,
      total_paise INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS claims (
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      weight INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (item_id, participant_id)
    );

    CREATE TABLE IF NOT EXISTS charges (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      basis TEXT NOT NULL,
      value REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code);
    CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);
    CREATE INDEX IF NOT EXISTS idx_items_session ON items(session_id);
    CREATE INDEX IF NOT EXISTS idx_charges_session ON charges(session_id);
    CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
  `);

  // Migration for existing databases
  try {
    db.exec(`ALTER TABLE participants ADD COLUMN paid_amount_paise INTEGER NOT NULL DEFAULT 0`);
  } catch {}
}
