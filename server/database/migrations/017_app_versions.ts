import type { Database } from "bun:sqlite";
import { isDraftConfig, parseAppConfig } from "/types/app-config-types";

/**
 * Immutable app versions:
 * - app_versions holds runnable content (code, tagName, prompt, status, store copy)
 * - apps.title + apps.icon_id stay identity fields (not versioned)
 * - removes apps.config_json
 */
export const runWithoutTransaction = true;

type LegacyAppRow = {
  id: string;
  title: string;
  description: string;
  slug: string;
  visibility: string;
  owner_id: string;
  source_app_id: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  is_draft: number;
  icon_id: string | null;
  category: string | null;
  tagline: string | null;
};

function fallbackVersionFields(row: LegacyAppRow) {
  const config = parseAppConfig(row.config_json);
  if (config) {
    return {
      status: config.status,
      prompt: config.prompt,
      description: config.description || row.description || "",
      tagline: config.tagline ?? row.tagline ?? null,
      category: config.category ?? row.category ?? null,
      tagName: config.tagName,
      code: config.code,
      isReady: !isDraftConfig(config),
    };
  }

  return {
    status: "draft" as const,
    prompt: row.description || row.title || "",
    description: row.description || "",
    tagline: row.tagline,
    category: row.category,
    tagName: "applet-draft",
    code: "// draft",
    isReady: false,
  };
}

export default function (db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_versions (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      tagline TEXT,
      category TEXT,
      tag_name TEXT NOT NULL,
      code TEXT NOT NULL,
      created_from_version_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
      FOREIGN KEY (created_from_version_id) REFERENCES app_versions(id) ON DELETE SET NULL,
      UNIQUE (app_id, version_number)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_app_versions_app ON app_versions(app_id)`);

  const appsInfo = db.query<{ name: string }, []>("PRAGMA table_info(apps)").all();
  const appCols = new Set(appsInfo.map((c) => c.name));

  if (!appCols.has("latest_version_id")) {
    db.run(`ALTER TABLE apps ADD COLUMN latest_version_id TEXT`);
  }
  if (!appCols.has("published_version_id")) {
    db.run(`ALTER TABLE apps ADD COLUMN published_version_id TEXT`);
  }

  if (appCols.has("config_json")) {
    const rows = db
      .query<LegacyAppRow, []>(
        `SELECT id, title, description, slug, visibility, owner_id, source_app_id,
                config_json, created_at, updated_at, published_at, is_draft, icon_id,
                category, tagline
         FROM apps`,
      )
      .all();

    const insertVersion = db.query(`
      INSERT INTO app_versions (
        id, app_id, version_number, status, prompt, description, tagline, category,
        tag_name, code, created_from_version_id, created_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);
    const setPointers = db.query(`
      UPDATE apps
      SET latest_version_id = ?,
          published_version_id = ?,
          description = CASE WHEN description = '' OR description IS NULL THEN ? ELSE description END,
          tagline = COALESCE(tagline, ?),
          category = COALESCE(category, ?),
          is_draft = ?
      WHERE id = ?
    `);

    let backfilled = 0;
    for (const row of rows) {
      const existing = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM app_versions WHERE app_id = ? AND version_number = 1 LIMIT 1",
        )
        .get(row.id);
      if (existing) continue;

      const fields = fallbackVersionFields(row);
      const versionId = crypto.randomUUID();
      insertVersion.run(
        versionId,
        row.id,
        fields.status,
        fields.prompt,
        fields.description,
        fields.tagline,
        fields.category,
        fields.tagName,
        fields.code,
        row.created_at || new Date().toISOString(),
      );

      const publishedId = row.visibility === "public" && fields.isReady ? versionId : null;
      setPointers.run(
        versionId,
        publishedId,
        fields.description,
        fields.tagline,
        fields.category,
        fields.isReady ? 0 : 1,
        row.id,
      );
      backfilled += 1;
    }
    console.info(`  → Backfilled ${backfilled} app version(s)`);

    // Drop config_json by rebuilding apps (SQLite has no DROP COLUMN on older builds).
    db.run("PRAGMA foreign_keys = OFF");
    db.run(`
      CREATE TABLE apps_new (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        slug TEXT NOT NULL UNIQUE,
        visibility TEXT NOT NULL DEFAULT 'private',
        source_app_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        published_at TEXT,
        is_draft INTEGER NOT NULL DEFAULT 1,
        icon_id TEXT,
        category TEXT,
        tagline TEXT,
        latest_version_id TEXT,
        published_version_id TEXT
      )
    `);

    db.run(`
      INSERT INTO apps_new (
        id, owner_id, title, description, slug, visibility, source_app_id,
        created_at, updated_at, published_at, is_draft, icon_id, category, tagline,
        latest_version_id, published_version_id
      )
      SELECT
        id, owner_id, title, description, slug, visibility, source_app_id,
        created_at, updated_at, published_at, is_draft, icon_id, category, tagline,
        latest_version_id, published_version_id
      FROM apps
    `);

    db.run(`DROP TABLE apps`);
    db.run(`ALTER TABLE apps_new RENAME TO apps`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_apps_owner ON apps(owner_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_apps_visibility ON apps(visibility)`);
    db.run("PRAGMA foreign_keys = ON");
  }
}
