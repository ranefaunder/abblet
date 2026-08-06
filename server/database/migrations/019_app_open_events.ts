import type { Database } from "bun:sqlite";

/**
 * Append-only anonymous log of app opens for popularity (open_count).
 * Not attributed to users.
 */
export default function (db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_open_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_app_open_events_user_time
     ON app_open_events(user_id, opened_at DESC)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_app_open_events_user_app
     ON app_open_events(user_id, app_id)`,
  );
}
