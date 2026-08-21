import type { Database } from "bun:sqlite";
import { db } from "/server/database/db";

/** Max serialized JSON size for one user × app blob. */
export const APP_USER_DATA_MAX_BYTES = 128 * 1024;

export type AppUserDataRow = {
  user_id: string;
  app_slug: string;
  payload: string;
  updated_at: string;
};

export type SerializedAppUserData =
  | { ok: true; payload: string }
  | { ok: false; reason: "too_large" | "invalid" };

export function serializeAppUserData(data: unknown): SerializedAppUserData {
  let payload: string;
  try {
    payload = JSON.stringify(data);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof payload !== "string") {
    return { ok: false, reason: "invalid" };
  }
  if (new TextEncoder().encode(payload).byteLength > APP_USER_DATA_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  return { ok: true, payload };
}

export function parseAppUserDataPayload(payload: string): unknown | null {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

export function dbGetAppUserData(
  userId: string,
  appSlug: string,
  database: Database = db,
): AppUserDataRow | null {
  return (
    database
      .query<AppUserDataRow, [string, string]>(
        `SELECT user_id, app_slug, payload, updated_at
         FROM app_user_data
         WHERE user_id = ? AND app_slug = ?`,
      )
      .get(userId, appSlug) ?? null
  );
}

export function dbUpsertAppUserData(
  userId: string,
  appSlug: string,
  payload: string,
  database: Database = db,
): AppUserDataRow {
  const updatedAt = new Date().toISOString();
  database
    .query(
      `INSERT INTO app_user_data (user_id, app_slug, payload, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, app_slug) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    )
    .run(userId, appSlug, payload, updatedAt);
  return {
    user_id: userId,
    app_slug: appSlug,
    payload,
    updated_at: updatedAt,
  };
}

export function dbDeleteAppUserData(
  userId: string,
  appSlug: string,
  database: Database = db,
): void {
  database
    .query(`DELETE FROM app_user_data WHERE user_id = ? AND app_slug = ?`)
    .run(userId, appSlug);
}
