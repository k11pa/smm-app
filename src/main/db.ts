import Database from 'better-sqlite3'

export type Db = Database.Database

// Append only: never edit a migration that has shipped. PRAGMA user_version tracks how many ran.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE brands (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    website TEXT,
    content_language TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE brand_profiles (
    id INTEGER PRIMARY KEY,
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('ai', 'user')),
    created_at TEXT NOT NULL,
    UNIQUE (brand_id, version)
  );
  `,
  `
  CREATE TABLE plan_items (
    id INTEGER PRIMARY KEY,
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    platform TEXT NOT NULL,
    format TEXT NOT NULL,
    pillar TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('ai', 'user')),
    edited INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX plan_items_brand_date ON plan_items (brand_id, date);
  `
]

export function migrate(db: Db, migrations: string[] = MIGRATIONS) {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > migrations.length) {
    // Running an older app on a newer database could corrupt data.
    throw new Error(`DB_TOO_NEW: database version ${current}, app supports ${migrations.length}`)
  }
  migrations.slice(current).forEach((sql, i) => {
    db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${current + i + 1}`)
    })()
  })
}

export function openDb(file: string): Db {
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
    return db
  } catch (e) {
    db.close()
    throw e
  }
}
