import type { Database } from "bun:sqlite";

/** Short change line for History UI (what changed in this version). */
export default function (db: Database) {
  const cols = db.query(`PRAGMA table_info(app_versions)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "summary")) {
    db.run(`ALTER TABLE app_versions ADD COLUMN summary TEXT NOT NULL DEFAULT ''`);
  }
}
