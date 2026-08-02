import type { Database } from "bun:sqlite";

/** Premium plan entitlement + gift codes (Polar columns reserved). */
export default function (db: Database) {
  db.run(`ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'`);
  db.run(`ALTER TABLE users ADD COLUMN plan_source TEXT`);
  db.run(`ALTER TABLE users ADD COLUMN plan_updated_at TEXT`);
  db.run(`ALTER TABLE users ADD COLUMN polar_customer_id TEXT`);
  db.run(`ALTER TABLE users ADD COLUMN polar_subscription_id TEXT`);
  db.run(`ALTER TABLE users ADD COLUMN gift_code_id TEXT`);

  db.run(`
    CREATE TABLE IF NOT EXISTS gift_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      max_redemptions INTEGER,
      redemption_count INTEGER NOT NULL DEFAULT 0,
      disabled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gift_codes_code ON gift_codes(code)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS gift_redemptions (
      id TEXT PRIMARY KEY,
      gift_code_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (gift_code_id) REFERENCES gift_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id)
    )
  `);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_gift_redemptions_code ON gift_redemptions(gift_code_id)`,
  );

  // Early-access shared code for testers / friends (unlimited until disabled).
  const seedId = crypto.randomUUID();
  db.run(
    `INSERT OR IGNORE INTO gift_codes (id, code, max_redemptions, redemption_count)
     VALUES ('${seedId}', 'REMIIX-FRIENDS', NULL, 0)`,
  );
}
