import type { Database } from "bun:sqlite";

/**
 * Remembers that a user already granted an app account access, so the consent
 * screen (`/connect/:appId`) only needs to be shown once per user + app.
 */
export default function migration026(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_connect_grants (
      user_id TEXT NOT NULL,
      app_slug TEXT NOT NULL,
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, app_slug),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}
