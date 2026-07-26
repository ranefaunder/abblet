import type { Database } from "bun:sqlite";

/** User AI credit wallet + audit ledger. */
export default function (db: Database) {
  db.run(`
    ALTER TABLE users ADD COLUMN credit_balance_usd_micros INTEGER NOT NULL DEFAULT 0
  `);
  db.run(`
    ALTER TABLE users ADD COLUMN credit_period_ym TEXT
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta_usd_micros INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      openrouter_cost_usd REAL,
      markup REAL,
      meta_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON credit_ledger(created_at)`);
}
