import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import migrate024 from "/server/database/migrations/024_credit_anniversary";

describe("024_credit_anniversary migration", () => {
  test("adds grant columns and seeds from created_at / plan_updated_at", () => {
    const db = new Database(":memory:");
    db.run(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT,
        created_at TEXT NOT NULL,
        plan_updated_at TEXT,
        credit_balance_usd_micros INTEGER NOT NULL DEFAULT 0,
        credit_period_ym TEXT
      )
    `);
    db.run(
      `INSERT INTO users (id, email, created_at, plan_updated_at)
       VALUES ('u1', 'a@b.c', '2026-01-31T12:00:00.000Z', NULL)`,
    );
    db.run(
      `INSERT INTO users (id, email, created_at, plan_updated_at)
       VALUES ('u2', 'c@d.e', '2026-01-01T00:00:00.000Z', '2026-03-15T08:00:00.000Z')`,
    );

    migrate024(db);

    const free = db
      .query<{ credit_grant_at: string; credit_period_anchor_day: number }, [string]>(
        `SELECT credit_grant_at, credit_period_anchor_day FROM users WHERE id = ?`,
      )
      .get("u1");
    expect(free?.credit_grant_at).toBe("2026-01-31T12:00:00.000Z");
    expect(free?.credit_period_anchor_day).toBe(31);

    const prem = db
      .query<{ credit_grant_at: string; credit_period_anchor_day: number }, [string]>(
        `SELECT credit_grant_at, credit_period_anchor_day FROM users WHERE id = ?`,
      )
      .get("u2");
    expect(prem?.credit_grant_at).toBe("2026-03-15T08:00:00.000Z");
    expect(prem?.credit_period_anchor_day).toBe(15);
  });
});
