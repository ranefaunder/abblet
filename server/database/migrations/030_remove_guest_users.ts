import type { Database } from "bun:sqlite";

/** Guest cleanup can touch many FK children — avoid wrapping in a single tx. */
export const runWithoutTransaction = true;

const USER_CHILD_TABLES = [
  "sessions",
  "credit_ledger",
  "app_installs",
  "app_install_events",
  "app_connect_codes",
  "app_runtime_tokens",
  "app_connect_grants",
  "gift_redemptions",
  "app_open_events",
] as const;

function tableColumns(db: Database, table: string): Set<string> {
  return new Set(
    db
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name),
  );
}

function tableExists(db: Database, table: string): boolean {
  return (
    db
      .query<{ n: number }, [string]>(
        `SELECT 1 as n FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
      )
      .get(table) != null
  );
}

/**
 * Remove legacy guest accounts (`is_guest = 1`) and drop the column.
 * Guest login is gone; column + rows are leftover from migration 013.
 */
export default function migration030(db: Database) {
  db.run("PRAGMA foreign_keys = ON");

  const userCols = tableColumns(db, "users");
  if (!userCols.has("is_guest")) return;

  // Apps may lack FK to users (table rebuilds dropped it) — delete owned apps first.
  db.run(`DELETE FROM apps WHERE owner_id IN (SELECT id FROM users WHERE is_guest = 1)`);

  for (const table of USER_CHILD_TABLES) {
    if (!tableExists(db, table)) continue;
    const cols = tableColumns(db, table);
    if (!cols.has("user_id")) continue;
    db.run(
      `DELETE FROM ${table} WHERE user_id IN (SELECT id FROM users WHERE is_guest = 1)`,
    );
  }

  db.run(`DELETE FROM users WHERE is_guest = 1`);
  db.run(`ALTER TABLE users DROP COLUMN is_guest`);
}
