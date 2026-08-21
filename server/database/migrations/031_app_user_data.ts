import type { Database } from "bun:sqlite";

/** One JSON blob per user × app for Abblet.sync(). */
export default function migration031(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_user_data (
      user_id TEXT NOT NULL,
      app_slug TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, app_slug),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}
