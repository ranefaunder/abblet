import type { Database } from "bun:sqlite";

/**
 * Per-app AI monthly budget on permission grants.
 * Default $1.00 / calendar month (USD micros; wallet is USD-denominated).
 */
export default function migration029(db: Database) {
  const cols = new Set(
    db
      .query<{ name: string }, []>(`PRAGMA table_info(app_connect_grants)`)
      .all()
      .map((c) => c.name),
  );

  if (!cols.has("monthly_limit_usd_micros")) {
    db.run(
      `ALTER TABLE app_connect_grants
       ADD COLUMN monthly_limit_usd_micros INTEGER NOT NULL DEFAULT 1000000`,
    );
  }
  if (!cols.has("period_ym")) {
    db.run(
      `ALTER TABLE app_connect_grants
       ADD COLUMN period_ym TEXT NOT NULL DEFAULT ''`,
    );
  }
  if (!cols.has("period_spent_usd_micros")) {
    db.run(
      `ALTER TABLE app_connect_grants
       ADD COLUMN period_spent_usd_micros INTEGER NOT NULL DEFAULT 0`,
    );
  }
}
