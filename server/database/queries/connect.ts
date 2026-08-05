import { db } from "/server/database/db";

export type AppConnectCodeRow = {
  code: string;
  user_id: string;
  app_slug: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export type AppRuntimeTokenRow = {
  id: string;
  user_id: string;
  app_slug: string;
  expires_at: string;
  created_at: string;
};

export const CONNECT_CODE_TTL_SEC = 60;
export const RUNTIME_TOKEN_TTL_SEC = 30 * 60;

export function dbCreateConnectCode(data: {
  code: string;
  userId: string;
  appSlug: string;
  expiresAt: string;
}): void {
  db.query(
    `INSERT INTO app_connect_codes (code, user_id, app_slug, expires_at) VALUES (?, ?, ?, ?)`,
  ).run(data.code, data.userId, data.appSlug, data.expiresAt);
}

export function dbGetConnectCode(code: string): AppConnectCodeRow | null {
  return (
    db
      .query<AppConnectCodeRow, [string]>(
        `SELECT code, user_id, app_slug, expires_at, used_at, created_at
         FROM app_connect_codes WHERE code = ?`,
      )
      .get(code) ?? null
  );
}

export function dbMarkConnectCodeUsed(code: string, usedAt: string): void {
  db.query(`UPDATE app_connect_codes SET used_at = ? WHERE code = ?`).run(usedAt, code);
}

export function dbCreateRuntimeToken(data: {
  id: string;
  userId: string;
  appSlug: string;
  expiresAt: string;
}): void {
  db.query(
    `INSERT INTO app_runtime_tokens (id, user_id, app_slug, expires_at) VALUES (?, ?, ?, ?)`,
  ).run(data.id, data.userId, data.appSlug, data.expiresAt);
}

export function dbGetRuntimeToken(id: string): AppRuntimeTokenRow | null {
  return (
    db
      .query<AppRuntimeTokenRow, [string]>(
        `SELECT id, user_id, app_slug, expires_at, created_at
         FROM app_runtime_tokens WHERE id = ?`,
      )
      .get(id) ?? null
  );
}

/** Has this user already granted this app access (consent screen shown + confirmed before)? */
export function dbHasConnectGrant(userId: string, appSlug: string): boolean {
  return (
    db
      .query<{ user_id: string }, [string, string]>(
        `SELECT user_id FROM app_connect_grants WHERE user_id = ? AND app_slug = ?`,
      )
      .get(userId, appSlug) !== null
  );
}

/** Remember that the user granted this app access — skips the consent screen next time. */
export function dbCreateConnectGrant(userId: string, appSlug: string): void {
  db.query(
    `INSERT OR IGNORE INTO app_connect_grants (user_id, app_slug) VALUES (?, ?)`,
  ).run(userId, appSlug);
}

/** Revoke a previously granted app connection (forces consent screen again next time). */
export function dbRevokeConnectGrant(userId: string, appSlug: string): void {
  db.query(`DELETE FROM app_connect_grants WHERE user_id = ? AND app_slug = ?`).run(
    userId,
    appSlug,
  );
}

/** Atomically consume a connect code and issue a runtime token. */
export function dbExchangeConnectCode(
  code: string,
  opts?: { originAllowed?: (appSlug: string) => boolean },
): {
  ok: true;
  tokenId: string;
  userId: string;
  appSlug: string;
  expiresAt: string;
} | { ok: false; reason: "not_found" | "used" | "expired" | "origin" } {
  const now = new Date();
  const nowIso = now.toISOString();

  const exchange = db.transaction(() => {
    const row = dbGetConnectCode(code);
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.used_at) return { ok: false as const, reason: "used" as const };
    if (new Date(row.expires_at).getTime() <= now.getTime()) {
      return { ok: false as const, reason: "expired" as const };
    }
    if (opts?.originAllowed && !opts.originAllowed(row.app_slug)) {
      return { ok: false as const, reason: "origin" as const };
    }

    dbMarkConnectCodeUsed(code, nowIso);

    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + RUNTIME_TOKEN_TTL_SEC * 1000).toISOString();
    dbCreateRuntimeToken({
      id: tokenId,
      userId: row.user_id,
      appSlug: row.app_slug,
      expiresAt,
    });

    return {
      ok: true as const,
      tokenId,
      userId: row.user_id,
      appSlug: row.app_slug,
      expiresAt,
    };
  });

  return exchange();
}
