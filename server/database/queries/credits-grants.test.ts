import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  dbAddCreditsGrant,
  dbEnsureMonthlyPlanGrant,
  dbGetCreditBalance,
  nextBalanceAfterGrant,
} from "/server/database/queries/credits";
import { usdToUsdMicros } from "/utils/credits.server";

const FREE = usdToUsdMicros(0.99);
const PREMIUM = usdToUsdMicros(5.99);

function setupDb(): Database {
  const database = new Database(":memory:");
  database.run("PRAGMA foreign_keys = ON;");
  database.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      credit_balance_usd_micros INTEGER NOT NULL DEFAULT 0,
      credit_period_ym TEXT,
      credit_grant_at TEXT,
      credit_period_anchor_day INTEGER
    )
  `);
  database.run(`
    CREATE TABLE credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta_usd_micros INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      openrouter_cost_usd REAL,
      markup REAL,
      meta_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return database;
}

function insertUser(
  database: Database,
  id: string,
  balance: number,
  grantAt: string | null,
  anchorDay: number | null = null,
): void {
  const anchor =
    anchorDay ??
    (grantAt ? new Date(grantAt).getUTCDate() : null);
  database
    .query(
      `INSERT INTO users (
         id, email, credit_balance_usd_micros, credit_grant_at, credit_period_anchor_day
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, `${id}@test.local`, balance, grantAt, anchor);
}

describe("nextBalanceAfterGrant", () => {
  test("Free floor: fills up from empty or below, keeps surplus", () => {
    expect(nextBalanceAfterGrant(0, FREE, "floor")).toEqual({ next: FREE, delta: FREE });
    expect(nextBalanceAfterGrant(usdToUsdMicros(0.5), FREE, "floor")).toEqual({
      next: FREE,
      delta: FREE - usdToUsdMicros(0.5),
    });
    expect(nextBalanceAfterGrant(usdToUsdMicros(1.5), FREE, "floor")).toEqual({
      next: usdToUsdMicros(1.5),
      delta: 0,
    });
  });

  test("Premium add: always stacks the full grant", () => {
    expect(nextBalanceAfterGrant(0, PREMIUM, "add")).toEqual({ next: PREMIUM, delta: PREMIUM });
    expect(nextBalanceAfterGrant(usdToUsdMicros(2), PREMIUM, "add")).toEqual({
      next: usdToUsdMicros(2) + PREMIUM,
      delta: PREMIUM,
    });
  });
});

describe("dbEnsureMonthlyPlanGrant anniversary", () => {
  let database: Database;

  beforeEach(() => {
    database = setupDb();
  });

  test("first grant initializes period from now", () => {
    insertUser(database, "new", 0, null);
    const now = new Date("2026-08-02T10:00:00.000Z");
    const result = dbEnsureMonthlyPlanGrant(
      "new",
      FREE,
      "grant_free",
      "floor",
      now,
      database,
    );
    expect(result).toEqual({ balanceUsdMicros: FREE, granted: true });
    const row = dbGetCreditBalance("new", database);
    expect(row?.credit_grant_at).toBe(now.toISOString());
    expect(row?.credit_period_anchor_day).toBe(2);
  });

  test("same period does not double the grant", () => {
    insertUser(database, "once", 0, "2026-08-02T10:00:00.000Z", 2);
    const now = new Date("2026-08-15T10:00:00.000Z");
    // First call with null grant would init — user already has grant_at; balance 0 and due?
    // grant_at Aug 2, next due Sep 2 — Aug 15 not due. Need first fill:
    database
      .query(`UPDATE users SET credit_balance_usd_micros = ? WHERE id = ?`)
      .run(PREMIUM, "once");
    const a = dbEnsureMonthlyPlanGrant(
      "once",
      PREMIUM,
      "grant_premium",
      "add",
      now,
      database,
    );
    const b = dbEnsureMonthlyPlanGrant(
      "once",
      PREMIUM,
      "grant_premium",
      "add",
      now,
      database,
    );
    expect(a.granted).toBe(false);
    expect(b).toEqual({ balanceUsdMicros: PREMIUM, granted: false });
  });

  test("Premium stacks on next anniversary month", () => {
    insertUser(database, "p2", usdToUsdMicros(2), "2026-08-02T10:00:00.000Z", 2);
    const nextMonth = new Date("2026-09-02T10:00:00.000Z");
    const result = dbEnsureMonthlyPlanGrant(
      "p2",
      PREMIUM,
      "grant_premium",
      "add",
      nextMonth,
      database,
    );
    expect(result).toEqual({
      balanceUsdMicros: usdToUsdMicros(2) + PREMIUM,
      granted: true,
    });
    expect(dbGetCreditBalance("p2", database)?.credit_grant_at).toBe(
      nextMonth.toISOString(),
    );
  });

  test("Free floors when due; surplus unchanged", () => {
    insertUser(database, "f05", usdToUsdMicros(0.5), "2026-07-02T10:00:00.000Z", 2);
    const due = new Date("2026-08-02T10:00:00.000Z");
    expect(
      dbEnsureMonthlyPlanGrant("f05", FREE, "grant_free", "floor", due, database),
    ).toEqual({ balanceUsdMicros: FREE, granted: true });

    insertUser(database, "f15", usdToUsdMicros(1.5), "2026-07-02T10:00:00.000Z", 2);
    expect(
      dbEnsureMonthlyPlanGrant("f15", FREE, "grant_free", "floor", due, database),
    ).toEqual({ balanceUsdMicros: usdToUsdMicros(1.5), granted: false });
    expect(dbGetCreditBalance("f15", database)?.credit_grant_at).toBe(due.toISOString());
  });

  test("31 Jan → 28 Feb → 31 Mar Premium catch-up keeps anchor", () => {
    insertUser(database, "edge", 0, "2026-01-31T12:00:00.000Z", 31);
    const mar31 = new Date("2026-03-31T12:00:00.000Z");
    const result = dbEnsureMonthlyPlanGrant(
      "edge",
      PREMIUM,
      "grant_premium",
      "add",
      mar31,
      database,
    );
    // Due: Feb 28 and Mar 31 → two adds
    expect(result.balanceUsdMicros).toBe(PREMIUM * 2);
    expect(result.granted).toBe(true);
    const row = dbGetCreditBalance("edge", database);
    expect(row?.credit_grant_at).toBe(mar31.toISOString());
    expect(row?.credit_period_anchor_day).toBe(31);
  });
});

describe("dbAddCreditsGrant mid-upgrade", () => {
  test("gift upgrade adds Premium and resets anniversary clock", () => {
    const database = setupDb();
    insertUser(database, "up", usdToUsdMicros(0.4), "2026-08-01T00:00:00.000Z", 1);
    const resetAt = new Date("2026-08-15T18:00:00.000Z");
    const result = dbAddCreditsGrant(
      "up",
      PREMIUM,
      "grant_premium",
      { plan: "premium" },
      database,
      { resetPeriodAt: resetAt },
    );
    expect(result).toEqual({
      balanceUsdMicros: usdToUsdMicros(0.4) + PREMIUM,
      granted: true,
    });
    const row = dbGetCreditBalance("up", database);
    expect(row?.credit_grant_at).toBe(resetAt.toISOString());
    expect(row?.credit_period_anchor_day).toBe(15);

    // Not due again until +1 month
    const sameMonth = new Date("2026-08-20T18:00:00.000Z");
    expect(
      dbEnsureMonthlyPlanGrant(
        "up",
        PREMIUM,
        "grant_premium",
        "add",
        sameMonth,
        database,
      ).granted,
    ).toBe(false);
  });
});
