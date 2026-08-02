import type { Database } from "bun:sqlite";

/**
 * Rename early-access gift code GIFT → EARLYACCESS (UI shows "EARLY ACCESS").
 * Safe on DBs that already applied 022 with GIFT.
 */
export default function (db: Database) {
  const seedId = crypto.randomUUID();
  db.run(
    `INSERT OR IGNORE INTO gift_codes (id, code, max_redemptions, redemption_count)
     VALUES ('${seedId}', 'EARLYACCESS', NULL, 0)`,
  );
  db.run(
    `UPDATE gift_codes SET disabled_at = datetime('now')
     WHERE code = 'GIFT' AND disabled_at IS NULL`,
  );
}
