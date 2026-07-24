import type { Database } from "bun:sqlite";

/** Guest accounts: anonymous users with session cookies (no email login). */
export default function (db: Database) {
  db.run(`
    ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0
  `);
}
