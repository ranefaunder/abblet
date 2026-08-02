import { db } from "/server/database/db";
import type { Database } from "bun:sqlite";
import {
  addCalendarMonthsUtc,
  parseIsoDate,
  utcDayOfMonth,
} from "/utils/credit-period";

export type CreditReason =
  | "grant_free"
  | "grant_premium"
  | "ai_generate"
  | "ai_edit"
  | "ai_intent"
  | "ai_icon"
  | "ai_runtime";

export type CreditBalanceRow = {
  credit_balance_usd_micros: number;
  credit_period_ym: string | null;
  credit_grant_at: string | null;
  credit_period_anchor_day: number | null;
};

export function dbGetCreditBalance(
  userId: string,
  database: Database = db,
): CreditBalanceRow | null {
  return (
    database
      .query<CreditBalanceRow, [string]>(
        `SELECT credit_balance_usd_micros, credit_period_ym,
                credit_grant_at, credit_period_anchor_day
         FROM users WHERE id = ?`,
      )
      .get(userId) ?? null
  );
}

function insertLedger(
  data: {
    id: string;
    userId: string;
    deltaUsdMicros: number;
    balanceAfter: number;
    reason: CreditReason;
    openrouterCostUsd?: number | null;
    markup?: number | null;
    metaJson?: string | null;
  },
  database: Database = db,
): void {
  database
    .query(
      `INSERT INTO credit_ledger
      (id, user_id, delta_usd_micros, balance_after, reason, openrouter_cost_usd, markup, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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

function periodYmFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function writeGrantPeriod(
  database: Database,
  userId: string,
  balanceUsdMicros: number,
  grantAt: Date,
  anchorDay: number,
): void {
  database
    .query(
      `UPDATE users
       SET credit_balance_usd_micros = ?,
           credit_grant_at = ?,
           credit_period_anchor_day = ?,
           credit_period_ym = ?
       WHERE id = ?`,
    )
    .run(
      balanceUsdMicros,
      grantAt.toISOString(),
      anchorDay,
      periodYmFromDate(grantAt),
      userId,
    );
}

/** Free: top up to grant if below. Premium: always add grant (stacks). */
export type MonthlyGrantMode = "floor" | "add";

/** Pure next-balance for a monthly (or mid-period) grant. */
export function nextBalanceAfterGrant(
  prevUsdMicros: number,
  grantUsdMicros: number,
  mode: MonthlyGrantMode,
): { next: number; delta: number } {
  if (mode === "add") {
    const next = prevUsdMicros + grantUsdMicros;
    return { next, delta: grantUsdMicros };
  }
  const next = prevUsdMicros < grantUsdMicros ? grantUsdMicros : prevUsdMicros;
  return { next, delta: next - prevUsdMicros };
}

const MAX_CATCH_UP_PERIODS = 36;

/**
 * Apply due anniversary grants (UTC calendar months, anchor day preserved).
 * - `floor` (Free): top up once after advancing all due periods.
 * - `add` (Premium): add grant for each due period (stacks / catch-up).
 */
export function dbEnsureMonthlyPlanGrant(
  userId: string,
  grantUsdMicros: number,
  reason: CreditReason = "grant_free",
  mode: MonthlyGrantMode = "floor",
  now: Date = new Date(),
  database: Database = db,
): { balanceUsdMicros: number; granted: boolean } {
  const run = database.transaction(() => {
    const row = dbGetCreditBalance(userId, database);
    if (!row) return { balanceUsdMicros: 0, granted: false };

    let balance = row.credit_balance_usd_micros;
    const grantAtParsed = row.credit_grant_at ? parseIsoDate(row.credit_grant_at) : null;

    // First grant ever: apply once and start the anniversary clock.
    if (!grantAtParsed) {
      const { next, delta } = nextBalanceAfterGrant(balance, grantUsdMicros, mode);
      const anchorDay = utcDayOfMonth(now);
      writeGrantPeriod(database, userId, next, now, anchorDay);
      if (delta !== 0) {
        insertLedger(
          {
            id: crypto.randomUUID(),
            userId,
            deltaUsdMicros: delta,
            balanceAfter: next,
            reason,
            metaJson: JSON.stringify({
              mode,
              grantUsdMicros,
              grantAt: now.toISOString(),
              anchorDay,
              init: true,
            }),
          },
          database,
        );
      }
      return { balanceUsdMicros: next, granted: delta > 0 };
    }

    const anchorDay =
      typeof row.credit_period_anchor_day === "number" &&
      row.credit_period_anchor_day >= 1 &&
      row.credit_period_anchor_day <= 31
        ? row.credit_period_anchor_day
        : utcDayOfMonth(grantAtParsed);

    let grantAt = grantAtParsed;
    let duePeriods = 0;
    let totalDelta = 0;

    while (duePeriods < MAX_CATCH_UP_PERIODS) {
      const nextDue = addCalendarMonthsUtc(grantAt, 1, anchorDay);
      if (now.getTime() < nextDue.getTime()) break;

      grantAt = nextDue;
      duePeriods += 1;

      if (mode === "add") {
        const { next, delta } = nextBalanceAfterGrant(balance, grantUsdMicros, "add");
        balance = next;
        totalDelta += delta;
      }
    }

    if (duePeriods === 0) {
      return { balanceUsdMicros: balance, granted: false };
    }

    if (mode === "floor") {
      const { next, delta } = nextBalanceAfterGrant(balance, grantUsdMicros, "floor");
      balance = next;
      totalDelta = delta;
    }

    writeGrantPeriod(database, userId, balance, grantAt, anchorDay);
    if (totalDelta !== 0) {
      insertLedger(
        {
          id: crypto.randomUUID(),
          userId,
          deltaUsdMicros: totalDelta,
          balanceAfter: balance,
          reason,
          metaJson: JSON.stringify({
            mode,
            grantUsdMicros,
            grantAt: grantAt.toISOString(),
            anchorDay,
            periods: duePeriods,
          }),
        },
        database,
      );
    }

    return { balanceUsdMicros: balance, granted: totalDelta > 0 };
  });

  return run();
}

/** @deprecated Use dbEnsureMonthlyPlanGrant. */
export function dbEnsureMonthlyFreeGrant(
  userId: string,
  _periodYm: string,
  grantUsdMicros: number,
  reason: CreditReason = "grant_free",
  database: Database = db,
): { balanceUsdMicros: number; granted: boolean } {
  return dbEnsureMonthlyPlanGrant(userId, grantUsdMicros, reason, "floor", new Date(), database);
}

/**
 * Mid-period bump when downgrading / Free floor. Tops up to grant cap.
 * Does not change anniversary clock.
 */
export function dbBumpBalanceToGrant(
  userId: string,
  grantUsdMicros: number,
  reason: CreditReason,
  meta?: Record<string, unknown>,
  database: Database = db,
): { balanceUsdMicros: number; granted: boolean } {
  const run = database.transaction(() => {
    const row = dbGetCreditBalance(userId, database);
    if (!row) return { balanceUsdMicros: 0, granted: false };

    const prev = row.credit_balance_usd_micros;
    const { next, delta } = nextBalanceAfterGrant(prev, grantUsdMicros, "floor");
    if (delta === 0) {
      return { balanceUsdMicros: prev, granted: false };
    }

    database
      .query(`UPDATE users SET credit_balance_usd_micros = ? WHERE id = ?`)
      .run(next, userId);
    insertLedger(
      {
        id: crypto.randomUUID(),
        userId,
        deltaUsdMicros: delta,
        balanceAfter: next,
        reason,
        metaJson: meta
          ? JSON.stringify({ ...meta, mode: "floor" })
          : JSON.stringify({ grantUsdMicros, mode: "floor" }),
      },
      database,
    );
    return { balanceUsdMicros: next, granted: true };
  });

  return run();
}

/**
 * Mid-period add (e.g. Premium upgrade). Always adds `grantUsdMicros`.
 * When `resetPeriodAt` is set, restarts the anniversary clock from that instant.
 */
export function dbAddCreditsGrant(
  userId: string,
  grantUsdMicros: number,
  reason: CreditReason,
  meta?: Record<string, unknown>,
  database: Database = db,
  opts?: { resetPeriodAt?: Date },
): { balanceUsdMicros: number; granted: boolean } {
  if (grantUsdMicros <= 0) {
    const row = dbGetCreditBalance(userId, database);
    return { balanceUsdMicros: row?.credit_balance_usd_micros ?? 0, granted: false };
  }

  const run = database.transaction(() => {
    const row = dbGetCreditBalance(userId, database);
    if (!row) return { balanceUsdMicros: 0, granted: false };

    const prev = row.credit_balance_usd_micros;
    const { next, delta } = nextBalanceAfterGrant(prev, grantUsdMicros, "add");
    const resetAt = opts?.resetPeriodAt;

    if (resetAt) {
      const anchorDay = utcDayOfMonth(resetAt);
      writeGrantPeriod(database, userId, next, resetAt, anchorDay);
    } else {
      database
        .query(`UPDATE users SET credit_balance_usd_micros = ? WHERE id = ?`)
        .run(next, userId);
    }

    insertLedger(
      {
        id: crypto.randomUUID(),
        userId,
        deltaUsdMicros: delta,
        balanceAfter: next,
        reason,
        metaJson: meta
          ? JSON.stringify({
              ...meta,
              mode: "add",
              resetPeriod: Boolean(resetAt),
            })
          : JSON.stringify({ grantUsdMicros, mode: "add", resetPeriod: Boolean(resetAt) }),
      },
      database,
    );
    return { balanceUsdMicros: next, granted: true };
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

export type CreditAppSpendKind = "create" | "edit" | "intent" | "icon" | "runtime";

export type CreditAppSpendRow = {
  kind: CreditAppSpendKind;
  slug: string | null;
  title: string | null;
  iconId: string | null;
  spentUsdMicros: number;
};

const CREDIT_APP_SPEND_KINDS = new Set<CreditAppSpendKind>([
  "create",
  "edit",
  "intent",
  "icon",
  "runtime",
]);

/**
 * Spend by app, split by purpose (create / edit / intent / icon / runtime).
 * Highest spend first.
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
         CASE l.reason
           WHEN 'ai_generate' THEN 'create'
           WHEN 'ai_edit' THEN 'edit'
           WHEN 'ai_intent' THEN 'intent'
           WHEN 'ai_icon' THEN 'icon'
           WHEN 'ai_runtime' THEN 'runtime'
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
         AND l.reason IN ('ai_generate', 'ai_edit', 'ai_intent', 'ai_icon', 'ai_runtime')
       GROUP BY kind, slug
       HAVING spent_usd_micros > 0
       ORDER BY spent_usd_micros DESC`,
    )
    .all(userId)
    .filter((r): r is typeof r & { kind: CreditAppSpendKind } =>
      CREDIT_APP_SPEND_KINDS.has(r.kind as CreditAppSpendKind),
    )
    .map((r) => ({
      kind: r.kind,
      slug: r.slug,
      title: r.title,
      iconId: r.icon_id,
      spentUsdMicros: r.spent_usd_micros,
    }));
}
