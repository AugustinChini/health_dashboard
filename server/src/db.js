import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

export async function openDb(dbPath) {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  })

  await db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      environment TEXT NOT NULL,

      status TEXT NOT NULL DEFAULT 'unknown',
      httpCode INTEGER,
      latencyMs INTEGER,
      checkedAt TEXT,
      lastStatusChangeAt TEXT,

      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appId INTEGER NOT NULL,

      startedAt TEXT NOT NULL,
      endedAt TEXT,

      startStatus TEXT NOT NULL,

      startHttpCode INTEGER,
      startLatencyMs INTEGER,
      startError TEXT,
      startResponseSnippet TEXT,

      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,

      FOREIGN KEY(appId) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_app_started ON incidents(appId, startedAt);
    CREATE INDEX IF NOT EXISTS idx_incidents_app_open ON incidents(appId, endedAt);
  `)

  return db
}

export async function seedIfEmpty(db) {
  const row = await db.get('SELECT COUNT(1) AS count FROM apps')
  if (!row || row.count > 0) return

  const now = new Date().toISOString()

  const seed = [
    ['Billing API', 'https://billing.myapp.fr/health', 'prod'],
    ['Auth Service', 'https://auth.myapp.fr/health', 'prod'],
    ['Customer Portal', 'https://portal.myapp.fr/health', 'prod'],
    ['Analytics', 'https://analytics.myapp.fr/health', 'staging'],
    ['Inventory Worker', 'https://inventory.myapp.fr/health', 'staging'],
    ['Email Dispatcher', 'https://mailer.myapp.fr/health', 'dev'],
  ]

  for (const [name, url, environment] of seed) {
    await db.run(
      `INSERT INTO apps (name, url, environment, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)` ,
      [name, url, environment, now, now],
    )
  }
}
