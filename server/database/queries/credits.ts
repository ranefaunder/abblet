import { db } from "/server/database/db";

export type CreditReason =
  | "grant_free"
  | "ai_generate"
  | "ai_edit"
  | "ai_icon"
  | "ai_runtime";

export type CreditBalanceRow = {
  credit_balance_usd_micros: number;
  credit_period_ym: string | null;
};

export function dbGetCreditBalance(userId: string): CreditBalanceRow | null {
  return (
    db
      .query<CreditBalanceRow, [string]>(
        `SELECT credit_balance_usd_micros, credit_period_ym FROM users WHERE id = ?`,
      )
      .get(userId) ?? null
  );
}

function insertLedger(data: {
  id: string;
  userId: string;
  deltaUsdMicros: number;
  balanceAfter: number;
  reason: CreditReason;
  openrouterCostUsd?: number | null;
  markup?: number | null;
  metaJson?: string | null;
}): void {
  db.query(
    `INSERT INTO credit_ledger
      (id, user_id, delta_usd_micros, balance_after, reason, openrouter_cost_usd, markup, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.userId,
    data.deltaUsdMicros,
    data.balanceAfter,
    data.reason,
    data.openrouterCostUsd ?? null,
    data.markup ?? null,
    data.metaJson ?? null,
  );
}

/**
 * If the user's free-grant period is stale, top balance up to `grantUsdMicros` (cap).
 * Does not reduce a balance already above the grant.
 */
export function dbEnsureMonthlyFreeGrant(
  userId: string,
  periodYm: string,
  grantUsdMicros: number,
): { balanceUsdMicros: number; granted: boolean } {
  const run = db.transaction(() => {
    const row = dbGetCreditBalance(userId);
    if (!row) return { balanceUsdMicros: 0, granted: false };

    if (row.credit_period_ym === periodYm) {
      return { balanceUsdMicros: row.credit_balance_usd_micros, granted: false };
    }

    const prev = row.credit_balance_usd_micros;
    const next = prev < grantUsdMicros ? grantUsdMicros : prev;
    const delta = next - prev;

    db.query(
      `UPDATE users SET credit_balance_usd_micros = ?, credit_period_ym = ? WHERE id = ?`,
    ).run(next, periodYm, userId);

    if (delta !== 0) {
      insertLedger({
        id: crypto.randomUUID(),
        userId,
        deltaUsdMicros: delta,
        balanceAfter: next,
        reason: "grant_free",
        metaJson: JSON.stringify({ periodYm, grantUsdMicros }),
      });
    } else {
      // Still advance the period so we don't re-check every call.
      db.query(`UPDATE users SET credit_period_ym = ? WHERE id = ?`).run(periodYm, userId);
    }

    return { balanceUsdMicros: next, granted: delta > 0 };
  });

  return run();
}

export function dbDebitCredits(data: {
  userId: string;
  debitUsdMicros: number;
  reason: CreditReason;
  openrouterCostUsd?: number | null;
  markup?: number | null;
  metaJson?: string | null;
}): { ok: true; balanceUsdMicros: number } | { ok: false; reason: "not_found" | "insufficient" } {
  if (data.debitUsdMicros <= 0) {
    const row = dbGetCreditBalance(data.userId);
    if (!row) return { ok: false, reason: "not_found" };
    return { ok: true, balanceUsdMicros: row.credit_balance_usd_micros };
  }

  const run = db.transaction(() => {
    const row = dbGetCreditBalance(data.userId);
    if (!row) return { ok: false as const, reason: "not_found" as const };

    const prev = row.credit_balance_usd_micros;
    if (prev <= 0) return { ok: false as const, reason: "insufficient" as const };

    // Clamp to available (race after pre-check); never go negative.
    const debit = Math.min(data.debitUsdMicros, prev);
    const next = prev - debit;

    db.query(`UPDATE users SET credit_balance_usd_micros = ? WHERE id = ?`).run(next, data.userId);
    insertLedger({
      id: crypto.randomUUID(),
      userId: data.userId,
      deltaUsdMicros: -debit,
      balanceAfter: next,
      reason: data.reason,
      openrouterCostUsd: data.openrouterCostUsd,
      markup: data.markup,
      metaJson: data.metaJson,
    });

    return { ok: true as const, balanceUsdMicros: next };
  });

  return run();
}

export type CreditDailySpendRow = {
  day: string;
  spentUsdMicros: number;
};

/** Daily AI credit spend (debits only), newest first. */
export function dbListDailyCreditSpend(
  userId: string,
  limit = 31,
): CreditDailySpendRow[] {
  return db
    .query<
      { day: string; spent_usd_micros: number },
      [string, number]
    >(
      `SELECT substr(created_at, 1, 10) as day,
              SUM(CASE WHEN delta_usd_micros < 0 THEN -delta_usd_micros ELSE 0 END) as spent_usd_micros
       FROM credit_ledger
       WHERE user_id = ?
       GROUP BY day
       HAVING spent_usd_micros > 0
       ORDER BY day DESC
       LIMIT ?`,
    )
    .all(userId, limit)
    .map((r) => ({
      day: r.day,
      spentUsdMicros: r.spent_usd_micros,
    }));
}

export type CreditAppSpendKind = "build" | "runtime";

export type CreditAppSpendRow = {
  kind: CreditAppSpendKind;
  slug: string | null;
  title: string | null;
  iconId: string | null;
  spentUsdMicros: number;
};

/**
 * Spend by app, split into building (generate/edit/icon) vs using (runtime AI).
 * Newest / highest spend first within each kind (caller can group).
 */
export function dbListCreditSpendByApp(userId: string): CreditAppSpendRow[] {
  return db
    .query<
      {
        kind: string;
        slug: string | null;
        title: string | null;
        icon_id: string | null;
        spent_usd_micros: number;
      },
      [string]
    >(
      `SELECT
         CASE
           WHEN l.reason IN ('ai_generate', 'ai_edit', 'ai_icon') THEN 'build'
           WHEN l.reason = 'ai_runtime' THEN 'runtime'
           ELSE 'other'
         END as kind,
         NULLIF(
           COALESCE(
             json_extract(l.meta_json, '$.slug'),
             json_extract(l.meta_json, '$.appSlug')
           ),
           ''
         ) as slug,
         a.title as title,
         a.icon_id as icon_id,
         SUM(-l.delta_usd_micros) as spent_usd_micros
       FROM credit_ledger l
       LEFT JOIN apps a
         ON a.slug = COALESCE(
           json_extract(l.meta_json, '$.slug'),
           json_extract(l.meta_json, '$.appSlug')
         )
       WHERE l.user_id = ?
         AND l.delta_usd_micros < 0
         AND l.reason IN ('ai_generate', 'ai_edit', 'ai_icon', 'ai_runtime')
       GROUP BY kind, slug
       HAVING spent_usd_micros > 0
       ORDER BY spent_usd_micros DESC`,
    )
    .all(userId)
    .filter((r) => r.kind === "build" || r.kind === "runtime")
    .map((r) => ({
      kind: r.kind as CreditAppSpendKind,
      slug: r.slug,
      title: r.title,
      iconId: r.icon_id,
      spentUsdMicros: r.spent_usd_micros,
    }));
}
