import type { Database } from "bun:sqlite";

/** One-time connect codes + opaque app runtime tokens (user ↔ app subdomain). */
export default function (db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_connect_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      app_slug TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_app_connect_codes_slug ON app_connect_codes(app_slug)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_runtime_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      app_slug TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_app_runtime_tokens_user ON app_runtime_tokens(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_app_runtime_tokens_slug ON app_runtime_tokens(app_slug)`);
}
