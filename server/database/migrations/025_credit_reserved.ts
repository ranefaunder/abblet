import type { Database } from "bun:sqlite";

/** Soft hold on credits before OpenRouter calls (TOCTOU). */
export default function migration025(db: Database) {
  const cols = db.query(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "credit_reserved_usd_micros")) {
    db.run(
      `ALTER TABLE users ADD COLUMN credit_reserved_usd_micros INTEGER NOT NULL DEFAULT 0`,
    );
  }
}
