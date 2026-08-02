import type { Database } from "bun:sqlite";

/** Early-access redeem code shown as locked "GIFT" in Premium dialog. */
export default function (db: Database) {
  const seedId = crypto.randomUUID();
  db.run(
    `INSERT OR IGNORE INTO gift_codes (id, code, max_redemptions, redemption_count)
     VALUES ('${seedId}', 'GIFT', NULL, 0)`,
  );
}
