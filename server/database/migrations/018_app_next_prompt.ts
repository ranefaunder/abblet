import type { Database } from "bun:sqlite";

/** Persist the intent-suggested composer placeholder across reloads. */
export default function (db: Database) {
  db.run(`ALTER TABLE apps ADD COLUMN next_prompt TEXT`);
}
