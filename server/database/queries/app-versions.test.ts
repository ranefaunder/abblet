import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { runMigrations } from "/server/database/migrate";
import {
  appConfigToVersionFields,
  versionRowToAppConfig,
} from "/utils/app-config.server";
import { remixFallbackTitle } from "/utils/remix-title";
import type { AppConfig } from "/types/app-config-types";

const sampleConfig: AppConfig = {
  version: 2,
  status: "ready",
  prompt: "Make a timer",
  title: "Timer",
  description: "A simple timer",
  tagline: "Tick tock",
  category: "Utilities",
  tagName: "simple-timer",
  code: `customElements.define("simple-timer", class extends HTMLElement {});`,
  permissions: [],
};

describe("remixFallbackTitle", () => {
  test("keeps short remix name within 12 chars", () => {
    expect(remixFallbackTitle("Timer").length).toBeLessThanOrEqual(12);
    expect(remixFallbackTitle("Timer")).toContain("Remix");
  });
});

describe("app config version mappers", () => {
  test("version row uses app title, not a versioned title", () => {
    const fields = appConfigToVersionFields(sampleConfig);
    expect(fields).not.toHaveProperty("title");
    const config = versionRowToAppConfig(
      {
        id: "v1",
        app_id: "a1",
        version_number: 1,
        status: fields.status,
        prompt: fields.prompt,
        summary: "",
        description: fields.description,
        tagline: fields.tagline,
        category: fields.category,
        tag_name: fields.tagName,
        code: fields.code,
        required_permissions: "[]",
        created_from_version_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      "Owned Name",
    );
    expect(config.title).toBe("Owned Name");
    expect(config.code).toBe(sampleConfig.code);
  });
});

describe("app versions migration + commit", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON;");
    // Minimal users table for FK
    db.run(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT,
        nickname TEXT,
        created_at TEXT
      )
    `);
    db.run(`INSERT INTO users (id, email, nickname, created_at) VALUES ('u1', 'a@b.c', 'ann', datetime('now'))`);

    // Seed legacy apps schema with config_json so 017 can migrate
    db.run(`
      CREATE TABLE apps (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        slug TEXT NOT NULL UNIQUE,
        visibility TEXT NOT NULL DEFAULT 'private',
        source_app_id TEXT,
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        published_at TEXT,
        is_draft INTEGER NOT NULL DEFAULT 1,
        icon_id TEXT,
        category TEXT,
        tagline TEXT,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    db.run(`CREATE TABLE migrations (name TEXT PRIMARY KEY, applied_at TEXT)`);

    // Mark prior migrations applied so only 017 runs from file — instead import 017 directly
    const migrate017 = (await import("/server/database/migrations/017_app_versions.ts")).default;
    const configJson = JSON.stringify(sampleConfig);
    db.run(
      `INSERT INTO apps (id, owner_id, title, description, slug, visibility, config_json, is_draft, icon_id, category, tagline)
       VALUES ('app1', 'u1', 'Timer', 'A simple timer', '12345', 'public', ?, 0, 'icon1.svg', 'Utilities', 'Tick tock')`,
      [configJson],
    );
    migrate017(db);
  });

  test("backfill creates v1 and pointers; title stays on apps", () => {
    const app = db
      .query<{
        title: string;
        icon_id: string | null;
        latest_version_id: string | null;
        published_version_id: string | null;
      }, []>("SELECT title, icon_id, latest_version_id, published_version_id FROM apps WHERE id = 'app1'")
      .get()!;
    expect(app.title).toBe("Timer");
    expect(app.icon_id).toBe("icon1.svg");
    expect(app.latest_version_id).toBeTruthy();
    expect(app.published_version_id).toBe(app.latest_version_id);

    const version = db
      .query<{ tag_name: string; code: string; version_number: number }, [string]>(
        "SELECT tag_name, code, version_number FROM app_versions WHERE id = ?",
      )
      .get(app.latest_version_id!)!;
    expect(version.version_number).toBe(1);
    expect(version.tag_name).toBe("simple-timer");
    expect(version.code).toContain("simple-timer");

    const cols = db.query<{ name: string }, []>("PRAGMA table_info(apps)").all().map((c) => c.name);
    expect(cols).toContain("title");
    expect(cols).not.toContain("config_json");
  });

  test("commit-style insert creates v2 without changing title/icon", () => {
    const app = db
      .query<{ latest_version_id: string; title: string; icon_id: string | null }, []>(
        "SELECT latest_version_id, title, icon_id FROM apps WHERE id = 'app1'",
      )
      .get()!;
    const v2 = crypto.randomUUID();
    db.run(
      `INSERT INTO app_versions (
        id, app_id, version_number, status, prompt, description, tagline, category,
        tag_name, code, created_from_version_id, created_at
      ) VALUES (?, 'app1', 2, 'ready', 'Add pause', 'A simple timer', 'Tick tock', 'Utilities',
        'simple-timer', ?, ?, datetime('now'))`,
      [v2, sampleConfig.code + "\n// pause", app.latest_version_id],
    );
    db.run(`UPDATE apps SET latest_version_id = ? WHERE id = 'app1'`, [v2]);

    const updated = db
      .query<{ latest_version_id: string; published_version_id: string; title: string; icon_id: string | null }, []>(
        "SELECT latest_version_id, published_version_id, title, icon_id FROM apps WHERE id = 'app1'",
      )
      .get()!;
    expect(updated.latest_version_id).toBe(v2);
    expect(updated.published_version_id).not.toBe(v2);
    expect(updated.title).toBe("Timer");
    expect(updated.icon_id).toBe("icon1.svg");

    // publish points published to latest
    db.run(`UPDATE apps SET published_version_id = latest_version_id WHERE id = 'app1'`);
    const published = db
      .query<{ published_version_id: string }, []>(
        "SELECT published_version_id FROM apps WHERE id = 'app1'",
      )
      .get()!;
    expect(published.published_version_id).toBe(v2);

    // restore v1 → v3
    const v1 = app.latest_version_id;
    const v1row = db
      .query<{ code: string; tag_name: string }, [string]>(
        "SELECT code, tag_name FROM app_versions WHERE id = ?",
      )
      .get(v1)!;
    const v3 = crypto.randomUUID();
    db.run(
      `INSERT INTO app_versions (
        id, app_id, version_number, status, prompt, description, tagline, category,
        tag_name, code, created_from_version_id, created_at
      ) VALUES (?, 'app1', 3, 'ready', 'Make a timer', 'A simple timer', 'Tick tock', 'Utilities',
        ?, ?, ?, datetime('now'))`,
      [v3, v1row.tag_name, v1row.code, v1],
    );
    db.run(`UPDATE apps SET latest_version_id = ? WHERE id = 'app1'`, [v3]);
    const afterRestore = db
      .query<{ latest_version_id: string; n: number }, []>(
        `SELECT latest_version_id,
                (SELECT COUNT(*) FROM app_versions WHERE app_id = 'app1') as n
         FROM apps WHERE id = 'app1'`,
      )
      .get()!;
    expect(afterRestore.latest_version_id).toBe(v3);
    expect(afterRestore.n).toBe(3);
    expect(
      db.query<{ id: string }, [string]>("SELECT id FROM app_versions WHERE id = ?").get(v1),
    ).toBeTruthy();
  });
});
