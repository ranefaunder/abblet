import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import migrate021 from "/server/database/migrations/021_premium_gift";
import migrate022 from "/server/database/migrations/022_gift_code";

describe("022_gift_code migration", () => {
  test("seeds EARLYACCESS early-access code", () => {
    const db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON;");
    db.run(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    migrate021(db);
    migrate022(db);

    const gift = db
      .query<{ code: string }, []>(`SELECT code FROM gift_codes WHERE code = 'EARLYACCESS'`)
      .get();
    expect(gift?.code).toBe("EARLYACCESS");
  });
});
