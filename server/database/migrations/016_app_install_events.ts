import type { Database } from "bun:sqlite";

/**
 * Append-only log of Install clicks for "Previously installed".
 * Survives library changes; uninstall UI is not used in Remiix store.
 */
export default function (db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_install_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_app_install_events_user_time
     ON app_install_events(user_id, installed_at DESC)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_app_install_events_user_app
     ON app_install_events(user_id, app_id)`,
  );

  // Seed one event per existing install so history is not empty after deploy.
  db.run(`
    INSERT INTO app_install_events (id, user_id, app_id, installed_at)
    SELECT lower(hex(randomblob(16))), user_id, app_id, created_at
    FROM app_installs
    WHERE NOT EXISTS (
      SELECT 1 FROM app_install_events e
      WHERE e.user_id = app_installs.user_id AND e.app_id = app_installs.app_id
    )
  `);
}
