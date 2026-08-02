import type { Database } from "bun:sqlite";

/**
 * Anniversary credit periods: last grant time + day-of-month anchor (31→28 Feb→31 Mar).
 * Seeds from plan_updated_at (Premium) or created_at (Free).
 */
export default function (db: Database) {
  db.run(`ALTER TABLE users ADD COLUMN credit_grant_at TEXT`);
  db.run(`ALTER TABLE users ADD COLUMN credit_period_anchor_day INTEGER`);

  db.run(`
    UPDATE users
    SET
      credit_grant_at = COALESCE(plan_updated_at, created_at),
      credit_period_anchor_day = CAST(
        strftime('%d', COALESCE(plan_updated_at, created_at)) AS INTEGER
      )
    WHERE credit_grant_at IS NULL
      AND COALESCE(plan_updated_at, created_at) IS NOT NULL
  `);
}
