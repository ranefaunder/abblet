import {
  dbGetUserPlan,
  dbRedeemGiftCode,
  dbSetUserPlan,
  type PlanSource,
  type UserPlan,
} from "/server/database/queries/entitlements";
import { dbBumpBalanceToGrant } from "/server/database/queries/credits";
import {
  currentPeriodYm,
  getPlanGrantUsd,
  planGrantUsdMicros,
  usdMicrosToUsd,
} from "/utils/credits.server";

export type { UserPlan, PlanSource };

export const PREMIUM_PRICE_USD = 5.99;

export function parseUserPlan(raw: string | null | undefined): UserPlan {
  return raw === "premium" ? "premium" : "free";
}

export function getUserPlan(userId: string): UserPlan {
  const row = dbGetUserPlan(userId);
  return parseUserPlan(row?.plan);
}

export function getUserPlanSource(userId: string): PlanSource | null {
  const row = dbGetUserPlan(userId);
  if (row?.plan_source === "gift" || row?.plan_source === "polar") {
    return row.plan_source;
  }
  return null;
}

/** Set plan entitlement (gift redeem or future Polar webhook). */
export function setUserPlan(
  userId: string,
  plan: UserPlan,
  opts: { source: PlanSource | null; giftCodeId?: string | null },
): void {
  dbSetUserPlan({
    userId,
    plan,
    planSource: opts.source,
    giftCodeId: opts.giftCodeId,
    updatedAt: new Date().toISOString(),
  });
}

/** After upgrading to Premium, top wallet up to the Premium monthly grant. */
export function applyPlanGrant(userId: string, plan: UserPlan): {
  balanceUsdMicros: number;
  granted: boolean;
} {
  const grantUsdMicros = planGrantUsdMicros(plan);
  const reason = plan === "premium" ? "grant_premium" : "grant_free";
  return dbBumpBalanceToGrant(userId, grantUsdMicros, reason, {
    plan,
    periodYm: currentPeriodYm(),
    grantUsdMicros,
  });
}

export function redeemGiftForPremium(userId: string, code: string):
  | {
      ok: true;
      plan: "premium";
      balanceUsd: number;
      grantUsd: number;
    }
  | {
      ok: false;
      code:
        | "INVALID_GIFT_CODE"
        | "GIFT_CODE_DISABLED"
        | "GIFT_CODE_EXHAUSTED"
        | "GIFT_ALREADY_REDEEMED"
        | "ALREADY_PREMIUM"
        | "USER_NOT_FOUND";
    } {
  const result = dbRedeemGiftCode(userId, code);
  if (!result.ok) {
    const map = {
      invalid_code: "INVALID_GIFT_CODE",
      disabled: "GIFT_CODE_DISABLED",
      exhausted: "GIFT_CODE_EXHAUSTED",
      already_redeemed: "GIFT_ALREADY_REDEEMED",
      already_premium: "ALREADY_PREMIUM",
      user_not_found: "USER_NOT_FOUND",
    } as const;
    return { ok: false, code: map[result.reason] };
  }

  const { balanceUsdMicros } = applyPlanGrant(userId, "premium");
  return {
    ok: true,
    plan: "premium",
    balanceUsd: Math.round(usdMicrosToUsd(balanceUsdMicros) * 100) / 100,
    grantUsd: getPlanGrantUsd("premium"),
  };
}

export function billingStatusForUser(userId: string): {
  plan: UserPlan;
  planSource: PlanSource | null;
  grantUsd: number;
  premiumPriceUsd: number;
  provider: "gift";
} {
  const plan = getUserPlan(userId);
  return {
    plan,
    planSource: getUserPlanSource(userId),
    grantUsd: getPlanGrantUsd(plan),
    premiumPriceUsd: PREMIUM_PRICE_USD,
    provider: "gift",
  };
}
