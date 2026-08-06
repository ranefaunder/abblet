import { db } from "/server/database/db";
import { currentPeriodYm } from "/utils/credits.server";

/** One-time permission codes (table `app_connect_codes` — legacy name). */
export type AppPermissionCodeRow = {
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

/** Scope grants (table `app_connect_grants` — legacy name). */
export type AppPermissionGrantRow = {
  user_id: string;
  app_slug: string;
  scope: string;
  granted_at: string;
  monthly_limit_usd_micros: number;
  period_ym: string;
  period_spent_usd_micros: number;
};

/** Default AI app monthly budget: $1.00 (wallet is USD). */
export const DEFAULT_AI_MONTHLY_LIMIT_USD = 1;
export const DEFAULT_AI_MONTHLY_LIMIT_USD_MICROS = 1_000_000;

export const PERMISSION_CODE_TTL_SEC = 60;
export const RUNTIME_TOKEN_TTL_SEC = 30 * 60;

export function dbCreatePermissionCode(data: {
  code: string;
  userId: string;
  appSlug: string;
  expiresAt: string;
}): void {
  db.query(
    `INSERT INTO app_connect_codes (code, user_id, app_slug, expires_at) VALUES (?, ?, ?, ?)`,
  ).run(data.code, data.userId, data.appSlug, data.expiresAt);
}

export function dbGetPermissionCode(code: string): AppPermissionCodeRow | null {
  return (
    db
      .query<AppPermissionCodeRow, [string]>(
        `SELECT code, user_id, app_slug, expires_at, used_at, created_at
         FROM app_connect_codes WHERE code = ?`,
      )
      .get(code) ?? null
  );
}

export function dbMarkPermissionCodeUsed(code: string, usedAt: string): void {
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

/** Drop all runtime tokens for this user+app (e.g. after revoking permission). */
export function dbDeleteRuntimeTokensForApp(userId: string, appSlug: string): void {
  db.query(`DELETE FROM app_runtime_tokens WHERE user_id = ? AND app_slug = ?`).run(
    userId,
    appSlug,
  );
}

/** Has this user already granted this scope for the app? Default scope = ai. */
export function dbHasPermissionGrant(
  userId: string,
  appSlug: string,
  scope: string = "ai",
): boolean {
  return dbGetPermissionGrant(userId, appSlug, scope) != null;
}

export function dbGetPermissionGrant(
  userId: string,
  appSlug: string,
  scope: string = "ai",
): AppPermissionGrantRow | null {
  return (
    db
      .query<AppPermissionGrantRow, [string, string, string]>(
        `SELECT user_id, app_slug, scope, granted_at,
                monthly_limit_usd_micros, period_ym, period_spent_usd_micros
         FROM app_connect_grants
         WHERE user_id = ? AND app_slug = ? AND scope = ?`,
      )
      .get(userId, appSlug, scope) ?? null
  );
}

/** All scopes this user has granted for the app (rolls monthly spend if needed). */
export function dbListPermissionGrants(
  userId: string,
  appSlug: string,
): AppPermissionGrantRow[] {
  const rows = db
    .query<AppPermissionGrantRow, [string, string]>(
      `SELECT user_id, app_slug, scope, granted_at,
              monthly_limit_usd_micros, period_ym, period_spent_usd_micros
       FROM app_connect_grants
       WHERE user_id = ? AND app_slug = ?
       ORDER BY granted_at ASC`,
    )
    .all(userId, appSlug);
  return rows
    .map((row) => dbEnsureGrantPeriod(userId, appSlug, row.scope))
    .filter((g): g is AppPermissionGrantRow => g != null);
}

/**
 * Remember that the user granted a scope — skips the consent screen next time.
 * Re-allow with a new monthly limit updates `monthly_limit_usd_micros` (spend counter kept).
 */
export function dbCreatePermissionGrant(
  userId: string,
  appSlug: string,
  scope: string = "ai",
  monthlyLimitUsdMicros: number = DEFAULT_AI_MONTHLY_LIMIT_USD_MICROS,
): void {
  const limit = Math.max(0, Math.floor(monthlyLimitUsdMicros));
  const periodYm = currentPeriodYm();
  db.query(
    `INSERT INTO app_connect_grants
       (user_id, app_slug, scope, monthly_limit_usd_micros, period_ym, period_spent_usd_micros)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(user_id, app_slug, scope) DO UPDATE SET
       monthly_limit_usd_micros = excluded.monthly_limit_usd_micros`,
  ).run(userId, appSlug, scope, limit, periodYm);
}

/** Roll calendar-month spend counter if needed; return grant after roll. */
export function dbEnsureGrantPeriod(
  userId: string,
  appSlug: string,
  scope: string = "ai",
): AppPermissionGrantRow | null {
  const grant = dbGetPermissionGrant(userId, appSlug, scope);
  if (!grant) return null;
  const periodYm = currentPeriodYm();
  if (grant.period_ym === periodYm) return grant;
  db.query(
    `UPDATE app_connect_grants
     SET period_ym = ?, period_spent_usd_micros = 0
     WHERE user_id = ? AND app_slug = ? AND scope = ?`,
  ).run(periodYm, userId, appSlug, scope);
  return dbGetPermissionGrant(userId, appSlug, scope);
}

/** True if spending `extraUsdMicros` would exceed the app's monthly limit. */
export function dbGrantBudgetWouldExceed(
  userId: string,
  appSlug: string,
  extraUsdMicros: number,
  scope: string = "ai",
): boolean {
  const grant = dbEnsureGrantPeriod(userId, appSlug, scope);
  if (!grant) return true;
  return grant.period_spent_usd_micros + Math.max(0, extraUsdMicros) > grant.monthly_limit_usd_micros;
}

/** Add billed runtime spend toward this app's monthly budget. */
export function dbAddGrantSpend(
  userId: string,
  appSlug: string,
  billedUsdMicros: number,
  scope: string = "ai",
): void {
  if (billedUsdMicros <= 0) return;
  dbEnsureGrantPeriod(userId, appSlug, scope);
  db.query(
    `UPDATE app_connect_grants
     SET period_spent_usd_micros = period_spent_usd_micros + ?
     WHERE user_id = ? AND app_slug = ? AND scope = ?`,
  ).run(Math.floor(billedUsdMicros), userId, appSlug, scope);
}

/** Revoke a previously granted scope (forces consent screen again next time). */
export function dbRevokePermissionGrant(
  userId: string,
  appSlug: string,
  scope: string = "ai",
): void {
  db.query(
    `DELETE FROM app_connect_grants WHERE user_id = ? AND app_slug = ? AND scope = ?`,
  ).run(userId, appSlug, scope);
}

/** Atomically consume a permission code and issue a runtime token. */
export function dbExchangePermissionCode(
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
    const row = dbGetPermissionCode(code);
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.used_at) return { ok: false as const, reason: "used" as const };
    if (new Date(row.expires_at).getTime() <= now.getTime()) {
      return { ok: false as const, reason: "expired" as const };
    }
    if (opts?.originAllowed && !opts.originAllowed(row.app_slug)) {
      return { ok: false as const, reason: "origin" as const };
    }

    dbMarkPermissionCodeUsed(code, nowIso);

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
