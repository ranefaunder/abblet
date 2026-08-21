import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import migrate031 from "/server/database/migrations/031_app_user_data";
import {
  APP_USER_DATA_MAX_BYTES,
  dbDeleteAppUserData,
  dbGetAppUserData,
  dbUpsertAppUserData,
  parseAppUserDataPayload,
  serializeAppUserData,
} from "/server/database/queries/app-user-data";

function setupDb(): Database {
  const database = new Database(":memory:");
  database.run("PRAGMA foreign_keys = ON;");
  database.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.run(`INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')`);
  migrate031(database);
  return database;
}

describe("serializeAppUserData", () => {
  test("round-trips JSON and rejects oversized payloads", () => {
    expect(serializeAppUserData({ items: [1, 2] })).toEqual({
      ok: true,
      payload: '{"items":[1,2]}',
    });
    expect(parseAppUserDataPayload('{"items":[1,2]}')).toEqual({ items: [1, 2] });

    const huge = "x".repeat(APP_USER_DATA_MAX_BYTES + 1);
    const tooBig = serializeAppUserData({ huge });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.reason).toBe("too_large");
  });
});

describe("app_user_data queries", () => {
  let database: Database;

  beforeEach(() => {
    database = setupDb();
  });

  test("upsert, get, and delete a blob", () => {
    expect(dbGetAppUserData("u1", "12345", database)).toBeNull();

    const saved = dbUpsertAppUserData(
      "u1",
      "12345",
      '{"ok":true}',
      database,
    );
    expect(saved.payload).toBe('{"ok":true}');
    expect(saved.updated_at).toBeTruthy();

    const row = dbGetAppUserData("u1", "12345", database);
    expect(row?.payload).toBe('{"ok":true}');
    expect(parseAppUserDataPayload(row!.payload)).toEqual({ ok: true });

    const again = dbUpsertAppUserData("u1", "12345", '{"n":2}', database);
    expect(dbGetAppUserData("u1", "12345", database)?.payload).toBe('{"n":2}');
    expect(again.updated_at >= saved.updated_at).toBe(true);

    dbDeleteAppUserData("u1", "12345", database);
    expect(dbGetAppUserData("u1", "12345", database)).toBeNull();
  });

  test("scopes blobs per user × app", () => {
    database.run(`INSERT INTO users (id, email) VALUES ('u2', 'c@d.e')`);
    dbUpsertAppUserData("u1", "11111", '{"a":1}', database);
    dbUpsertAppUserData("u1", "22222", '{"a":2}', database);
    dbUpsertAppUserData("u2", "11111", '{"a":3}', database);

    expect(dbGetAppUserData("u1", "11111", database)?.payload).toBe('{"a":1}');
    expect(dbGetAppUserData("u1", "22222", database)?.payload).toBe('{"a":2}');
    expect(dbGetAppUserData("u2", "11111", database)?.payload).toBe('{"a":3}');
  });
});
