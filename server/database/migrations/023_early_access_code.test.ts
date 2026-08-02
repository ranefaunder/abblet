import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import migrate021 from "/server/database/migrations/021_premium_gift";
import migrate023 from "/server/database/migrations/023_early_access_code";

describe("023_early_access_code migration", () => {
  test("seeds EARLYACCESS and disables legacy GIFT", () => {
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
    db.run(
      `INSERT INTO gift_codes (id, code, max_redemptions, redemption_count)
       VALUES ('legacy-gift', 'GIFT', NULL, 0)`,
    );
    migrate023(db);

    const early = db
      .query<{ code: string }, []>(`SELECT code FROM gift_codes WHERE code = 'EARLYACCESS'`)
      .get();
    expect(early?.code).toBe("EARLYACCESS");

    const legacy = db
      .query<{ disabled_at: string | null }, []>(
        `SELECT disabled_at FROM gift_codes WHERE code = 'GIFT'`,
      )
      .get();
    expect(legacy?.disabled_at).toBeTruthy();
  });
});
