import type { Database } from "bun:sqlite";

/** SQLite cannot ALTER PRIMARY KEY — rebuild grants table. */
export const runWithoutTransaction = true;

/**
 * App-declared permissions (`ai`, later `sync`) on apps + versions.
 * Connect grants become per-scope so Sync can be granted separately later.
 */
export default function migration027(db: Database) {
  db.run(
    `ALTER TABLE app_versions ADD COLUMN required_permissions TEXT NOT NULL DEFAULT '[]'`,
  );
  db.run(
    `ALTER TABLE apps ADD COLUMN required_permissions TEXT NOT NULL DEFAULT '[]'`,
  );

  // Backfill from code that calls Remiix.ai(
  const versions = db
    .query<{ id: string; app_id: string; code: string }, []>(
      `SELECT id, app_id, code FROM app_versions`,
    )
    .all();
  const aiVersionIds = new Set<string>();
  const aiAppIds = new Set<string>();
  for (const row of versions) {
    if (/Remiix\.ai\s*\(/.test(row.code)) {
      aiVersionIds.add(row.id);
      aiAppIds.add(row.app_id);
    }
  }
  for (const id of aiVersionIds) {
    db.run(`UPDATE app_versions SET required_permissions = ? WHERE id = ?`, [
      '["ai"]',
      id,
    ]);
  }

  // Denormalize apps from latest version when it needs ai; else leave [].
  const apps = db
    .query<{ id: string; latest_version_id: string | null }, []>(
      `SELECT id, latest_version_id FROM apps`,
    )
    .all();
  for (const app of apps) {
    if (!app.latest_version_id) continue;
    const ver = db
      .query<{ required_permissions: string }, [string]>(
        `SELECT required_permissions FROM app_versions WHERE id = ?`,
      )
      .get(app.latest_version_id);
    if (ver?.required_permissions && ver.required_permissions !== "[]") {
      db.run(`UPDATE apps SET required_permissions = ? WHERE id = ?`, [
        ver.required_permissions,
        app.id,
      ]);
    } else if (aiAppIds.has(app.id)) {
      // Fallback if latest wasn't scanned but some version had AI (edge case)
      const anyAi = db
        .query<{ n: number }, [string]>(
          `SELECT 1 as n FROM app_versions WHERE app_id = ? AND required_permissions LIKE '%"ai"%' LIMIT 1`,
        )
        .get(app.id);
      if (anyAi) {
        db.run(`UPDATE apps SET required_permissions = ? WHERE id = ?`, [
          '["ai"]',
          app.id,
        ]);
      }
    }
  }

  db.run(`
    CREATE TABLE app_connect_grants_new (
      user_id TEXT NOT NULL,
      app_slug TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'ai',
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, app_slug, scope),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    INSERT INTO app_connect_grants_new (user_id, app_slug, scope, granted_at)
    SELECT user_id, app_slug, 'ai', granted_at FROM app_connect_grants
  `);
  db.run(`DROP TABLE app_connect_grants`);
  db.run(`ALTER TABLE app_connect_grants_new RENAME TO app_connect_grants`);
}
