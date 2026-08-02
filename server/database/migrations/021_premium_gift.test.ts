import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import migrate021 from "/server/database/migrations/021_premium_gift";

describe("021_premium_gift migration", () => {
  test("adds plan columns, gift tables, and REMIIX-FRIENDS seed", () => {
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

    const cols = db
      .query<{ name: string }, []>(`PRAGMA table_info(users)`)
      .all()
      .map((c) => c.name);
    expect(cols).toContain("plan");
    expect(cols).toContain("plan_source");
    expect(cols).toContain("polar_customer_id");
    expect(cols).toContain("gift_code_id");

    const gift = db
      .query<{ code: string; redemption_count: number }, []>(
        `SELECT code, redemption_count FROM gift_codes WHERE code = 'REMIIX-FRIENDS'`,
      )
      .get();
    expect(gift?.code).toBe("REMIIX-FRIENDS");
    expect(gift?.redemption_count).toBe(0);

    db.run(`INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')`);
    const plan = db.query<{ plan: string }, [string]>(`SELECT plan FROM users WHERE id = ?`).get("u1");
    expect(plan?.plan).toBe("free");
  });
});
