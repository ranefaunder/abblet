import {
  dbDebitCredits,
  dbEnsureMonthlyPlanGrant,
  dbGetCreditBalance,
  dbReleaseCreditsReserve,
  dbReserveCredits,
  type CreditReason,
} from "/server/database/queries/credits";
import { dbGetUserPlan } from "/server/database/queries/entitlements";
import { AiRequestError } from "/utils/ai-core.server";
import {
  addCalendarMonthsUtc,
  parseIsoDate,
  utcDayOfMonth,
} from "/utils/credit-period";

const USD_MICROS = 1_000_000;

export type CreditFloorKind = "runtime" | "edit";
export type UserPlan = "free" | "premium";

export type CreditReservation = {
  userId: string;
  reservedUsdMicros: number;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getCreditMarkup(): number {
  return envNumber("CREDIT_MARKUP", 5);
}

/** @deprecated Prefer getPlanGrantUsd — kept for callers that mean the Free tier. */
export function getFreeGrantUsd(): number {
  return envNumber("CREDIT_FREE_GRANT_USD", 0.99);
}

export function getPremiumGrantUsd(): number {
  return envNumber("CREDIT_PREMIUM_GRANT_USD", 5.99);
}

export function getPlanGrantUsd(plan: UserPlan = "free"): number {
  return plan === "premium" ? getPremiumGrantUsd() : getFreeGrantUsd();
}

export function getFloorUsd(kind: CreditFloorKind): number {
  if (kind === "runtime") return envNumber("CREDIT_FLOOR_RUNTIME_USD", 0.001);
  return envNumber("CREDIT_FLOOR_EDIT_USD", 0.01);
}

export function usdToUsdMicros(usd: number): number {
  return Math.round(usd * USD_MICROS);
}

export function usdMicrosToUsd(micros: number): number {
  return micros / USD_MICROS;
}

export function currentPeriodYm(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function freeGrantUsdMicros(): number {
  return usdToUsdMicros(getFreeGrantUsd());
}

export function planGrantUsdMicros(plan: UserPlan): number {
  return usdToUsdMicros(getPlanGrantUsd(plan));
}

function userPlan(userId: string): UserPlan {
  const row = dbGetUserPlan(userId);
  return row?.plan === "premium" ? "premium" : "free";
}

/** OpenRouter USD → billed micros (markup × floor). */
export function chargeMicrosFromOpenRouterCost(
  costUsd: number | null | undefined,
  floorKind: CreditFloorKind,
): { openrouterCostUsd: number; billedUsdMicros: number; markup: number } {
  const floor = getFloorUsd(floorKind);
  const openrouterCostUsd =
    typeof costUsd === "number" && Number.isFinite(costUsd) && costUsd > 0
      ? costUsd
      : floor;
  const markup = getCreditMarkup();
  const billedUsdMicros = Math.max(1, Math.round(openrouterCostUsd * markup * USD_MICROS));
  return { openrouterCostUsd, billedUsdMicros, markup };
}

export function sumOpenRouterCosts(costs: Array<number | null | undefined>): number | null {
  let sum = 0;
  let any = false;
  for (const c of costs) {
    if (typeof c === "number" && Number.isFinite(c)) {
      sum += c;
      any = true;
    }
  }
  return any ? sum : null;
}

/**
 * Anniversary grant for the user's current plan (UTC +1 calendar month, anchor day).
 * Free: floor balance up to grant if below. Premium: always add grant (stacks).
 */
export function ensureMonthlyPlanGrant(userId: string, now = new Date()): number {
  const plan = userPlan(userId);
  const reason: CreditReason = plan === "premium" ? "grant_premium" : "grant_free";
  const mode = plan === "premium" ? "add" : "floor";
  const { balanceUsdMicros } = dbEnsureMonthlyPlanGrant(
    userId,
    planGrantUsdMicros(plan),
    reason,
    mode,
    now,
  );
  return balanceUsdMicros;
}

/** @deprecated Use ensureMonthlyPlanGrant */
export function ensureMonthlyFreeGrant(userId: string): number {
  return ensureMonthlyPlanGrant(userId);
}

/** Throw before calling OpenRouter when the wallet is empty; atomically reserve the floor. */
export function assertHasCredits(
  userId: string,
  floorKind: CreditFloorKind = "edit",
): CreditReservation {
  ensureMonthlyPlanGrant(userId);
  const reservedUsdMicros = Math.max(1, usdToUsdMicros(getFloorUsd(floorKind)));
  const result = dbReserveCredits(userId, reservedUsdMicros);
  if (!result.ok) {
    throw new AiRequestError("INSUFFICIENT_CREDITS", "INSUFFICIENT_CREDITS");
  }
  return { userId, reservedUsdMicros };
}

export function releaseCreditReservation(reservation: CreditReservation | null | undefined): void {
  if (!reservation || reservation.reservedUsdMicros <= 0) return;
  dbReleaseCreditsReserve(reservation.userId, reservation.reservedUsdMicros);
}

export function debitOpenRouterUsage(opts: {
  userId: string;
  costUsd: number | null | undefined;
  floorKind: CreditFloorKind;
  reason: CreditReason;
  meta?: Record<string, unknown>;
  /** Release this hold before debiting the real charge. */
  reservation?: CreditReservation | null;
}): { balanceUsdMicros: number; billedUsdMicros: number; billedUsd: number } {
  if (opts.reservation) {
    releaseCreditReservation(opts.reservation);
  }
  const { openrouterCostUsd, billedUsdMicros, markup } = chargeMicrosFromOpenRouterCost(
    opts.costUsd,
    opts.floorKind,
  );
  const result = dbDebitCredits({
    userId: opts.userId,
    debitUsdMicros: billedUsdMicros,
    reason: opts.reason,
    openrouterCostUsd,
    markup,
    metaJson: opts.meta ? JSON.stringify(opts.meta) : null,
  });
  if (!result.ok) {
    // Race / empty: treat as soft failure after the AI call already ran.
    const row = dbGetCreditBalance(opts.userId);
    return {
      balanceUsdMicros: row?.credit_balance_usd_micros ?? 0,
      billedUsdMicros: 0,
      billedUsd: 0,
    };
  }
  return {
    balanceUsdMicros: result.balanceUsdMicros,
    billedUsdMicros,
    billedUsd: usdMicrosToUsd(billedUsdMicros),
  };
}

/** Map usage-step tool → ledger reason for spend analytics. */
export function creditReasonForUsageTool(tool: string | null | undefined): CreditReason {
  switch (tool) {
    case "intent":
      return "ai_intent";
    case "generate":
      return "ai_generate";
    case "regenerateIcon":
      return "ai_icon";
    case "updateCode":
    case "patchCode":
    case "updateMeta":
    case "rename":
    default:
      return "ai_edit";
  }
}

/**
 * Debit once per purpose (intent / generate / edit / icon) from usage steps.
 * Skips empty buckets so floors don't invent charges without work.
 */
export function debitOpenRouterUsageSteps(opts: {
  userId: string;
  steps: Array<{ tool?: string | null; costUsd?: number | null }>;
  floorKind: CreditFloorKind;
  meta?: Record<string, unknown>;
  reservation?: CreditReservation | null;
}): void {
  if (opts.reservation) {
    releaseCreditReservation(opts.reservation);
  }
  const buckets = new Map<CreditReason, Array<number | null | undefined>>();
  for (const step of opts.steps) {
    const reason = creditReasonForUsageTool(step.tool);
    const list = buckets.get(reason) ?? [];
    list.push(step.costUsd);
    buckets.set(reason, list);
  }
  for (const [reason, costs] of buckets) {
    if (costs.length === 0) continue;
    debitOpenRouterUsage({
      userId: opts.userId,
      costUsd: sumOpenRouterCosts(costs),
      floorKind: opts.floorKind,
      reason,
      meta: opts.meta,
    });
  }
}

export function getCreditsSnapshot(userId: string): {
  balanceUsdMicros: number;
  balanceUsd: number;
  periodYm: string;
  freeGrantUsd: number;
  grantUsd: number;
  plan: UserPlan;
  planSource: "gift" | "polar" | null;
  /** ISO timestamp of the next anniversary grant (after ensuring due grants). */
  nextGrantAt: string | null;
  nextGrantUsd: number;
  nextGrantMode: "add" | "floor";
} {
  const plan = userPlan(userId);
  const balanceUsdMicros = ensureMonthlyPlanGrant(userId);
  const grantUsd = getPlanGrantUsd(plan);
  const planRow = dbGetUserPlan(userId);
  const planSource =
    planRow?.plan_source === "gift" || planRow?.plan_source === "polar"
      ? planRow.plan_source
      : null;
  const row = dbGetCreditBalance(userId);
  const reserved = row?.credit_reserved_usd_micros ?? 0;
  const availableUsdMicros = Math.max(0, balanceUsdMicros - reserved);
  const grantAt = row?.credit_grant_at ? parseIsoDate(row.credit_grant_at) : null;
  const anchorDay =
    typeof row?.credit_period_anchor_day === "number" &&
    row.credit_period_anchor_day >= 1 &&
    row.credit_period_anchor_day <= 31
      ? row.credit_period_anchor_day
      : grantAt
        ? utcDayOfMonth(grantAt)
        : utcDayOfMonth(new Date());
  const nextGrantAt = grantAt
    ? addCalendarMonthsUtc(grantAt, 1, anchorDay).toISOString()
    : null;
  return {
    balanceUsdMicros: availableUsdMicros,
    balanceUsd: usdMicrosToUsd(availableUsdMicros),
    periodYm: currentPeriodYm(),
    freeGrantUsd: getFreeGrantUsd(),
    grantUsd,
    plan,
    planSource,
    nextGrantAt,
    nextGrantUsd: grantUsd,
    nextGrantMode: plan === "premium" ? "add" : "floor",
  };
}
