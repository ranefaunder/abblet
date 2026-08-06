import type { Database } from "bun:sqlite";

/** SQLite cannot drop columns with FK cleanly — rebuild without user_id. */
export const runWithoutTransaction = true;

/**
 * Open events are anonymous popularity signals only (open_count).
 * Do not attribute opens to users.
 */
export default function migration028(db: Database) {
  const cols = db
    .query<{ name: string }, []>(`PRAGMA table_info(app_open_events)`)
    .all()
    .map((c) => c.name);
  if (cols.length > 0 && !cols.includes("user_id")) {
    // Already anonymous — e.g. partial retry after rename.
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_app_open_events_app_time
       ON app_open_events(app_id, opened_at DESC)`,
    );
    return;
  }

  db.run(`DROP TABLE IF EXISTS app_open_events_new`);
  db.run(`
    CREATE TABLE app_open_events_new (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    INSERT INTO app_open_events_new (id, app_id, opened_at)
    SELECT id, app_id, opened_at FROM app_open_events
  `);
  db.run(`DROP TABLE app_open_events`);
  db.run(`ALTER TABLE app_open_events_new RENAME TO app_open_events`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_app_open_events_app_time
     ON app_open_events(app_id, opened_at DESC)`,
  );
}
