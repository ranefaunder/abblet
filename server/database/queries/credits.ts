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
