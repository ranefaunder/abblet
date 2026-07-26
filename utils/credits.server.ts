import {
  dbDebitCredits,
  dbEnsureMonthlyFreeGrant,
  dbGetCreditBalance,
  type CreditReason,
} from "/server/database/queries/credits";
import { AiRequestError } from "/utils/ai-core.server";

const USD_MICROS = 1_000_000;

export type CreditFloorKind = "runtime" | "edit";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getCreditMarkup(): number {
  return envNumber("CREDIT_MARKUP", 5);
}

export function getFreeGrantEur(): number {
  return envNumber("CREDIT_FREE_GRANT_EUR", 2);
}

export function getEurUsdRate(): number {
  return envNumber("CREDIT_EUR_USD", 1.08);
}

export function getFloorUsd(kind: CreditFloorKind): number {
  if (kind === "runtime") return envNumber("CREDIT_FLOOR_RUNTIME_USD", 0.001);
  return envNumber("CREDIT_FLOOR_EDIT_USD", 0.01);
}

export function eurToUsdMicros(eur: number): number {
  return Math.round(eur * getEurUsdRate() * USD_MICROS);
}

export function usdMicrosToEur(micros: number): number {
  const rate = getEurUsdRate();
  if (rate <= 0) return 0;
  return micros / USD_MICROS / rate;
}

export function currentPeriodYm(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function freeGrantUsdMicros(): number {
  return eurToUsdMicros(getFreeGrantEur());
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

export function ensureMonthlyFreeGrant(userId: string): number {
  const { balanceUsdMicros } = dbEnsureMonthlyFreeGrant(
    userId,
    currentPeriodYm(),
    freeGrantUsdMicros(),
  );
  return balanceUsdMicros;
}

/** Throw before calling OpenRouter when the wallet is empty. */
export function assertHasCredits(userId: string): number {
  const balance = ensureMonthlyFreeGrant(userId);
  if (balance <= 0) {
    throw new AiRequestError("INSUFFICIENT_CREDITS", "INSUFFICIENT_CREDITS");
  }
  return balance;
}

export function debitOpenRouterUsage(opts: {
  userId: string;
  costUsd: number | null | undefined;
  floorKind: CreditFloorKind;
  reason: CreditReason;
  meta?: Record<string, unknown>;
}): number {
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
    return row?.credit_balance_usd_micros ?? 0;
  }
  return result.balanceUsdMicros;
}

export function getCreditsSnapshot(userId: string): {
  balanceUsdMicros: number;
  balanceEur: number;
  periodYm: string;
  freeGrantEur: number;
} {
  const balanceUsdMicros = ensureMonthlyFreeGrant(userId);
  return {
    balanceUsdMicros,
    balanceEur: usdMicrosToEur(balanceUsdMicros),
    periodYm: currentPeriodYm(),
    freeGrantEur: getFreeGrantEur(),
  };
}
