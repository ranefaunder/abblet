import type { Database } from "bun:sqlite";

/**
 * Store support.
 * - apps.category / apps.tagline: AI-generated store metadata.
 * - app_installs: a user's library — "Get" installs a public app as a reference
 *   (the code stays with the author). Home screen = owned apps + installs.
 */
export default function (db: Database) {
  db.run(`ALTER TABLE apps ADD COLUMN category TEXT`);
  db.run(`ALTER TABLE apps ADD COLUMN tagline TEXT`);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_installs (
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, app_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_app_installs_user ON app_installs(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_app_installs_app ON app_installs(app_id)`);
}
