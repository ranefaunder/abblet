import { db } from "/server/database/db";

export type UserPlan = "free" | "premium";
export type PlanSource = "gift" | "polar";

export type UserPlanRow = {
  plan: string;
  plan_source: string | null;
  gift_code_id: string | null;
  polar_customer_id: string | null;
  polar_subscription_id: string | null;
};

export type GiftCodeRow = {
  id: string;
  code: string;
  max_redemptions: number | null;
  redemption_count: number;
  disabled_at: string | null;
};

export function dbGetUserPlan(userId: string): UserPlanRow | null {
  return (
    db
      .query<UserPlanRow, [string]>(
        `SELECT plan, plan_source, gift_code_id, polar_customer_id, polar_subscription_id
         FROM users WHERE id = ?`,
      )
      .get(userId) ?? null
  );
}

export function dbSetUserPlan(data: {
  userId: string;
  plan: UserPlan;
  planSource: PlanSource | null;
  giftCodeId?: string | null;
  updatedAt: string;
}): void {
  db.query(
    `UPDATE users
     SET plan = ?,
         plan_source = ?,
         plan_updated_at = ?,
         gift_code_id = COALESCE(?, gift_code_id)
     WHERE id = ?`,
  ).run(
    data.plan,
    data.planSource,
    data.updatedAt,
    data.giftCodeId ?? null,
    data.userId,
  );
}

export function normalizeGiftCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function dbGetGiftCodeByCode(code: string): GiftCodeRow | null {
  return (
    db
      .query<GiftCodeRow, [string]>(
        `SELECT id, code, max_redemptions, redemption_count, disabled_at
         FROM gift_codes WHERE code = ?`,
      )
      .get(code) ?? null
  );
}

export function dbUserHasGiftRedemption(userId: string): boolean {
  return (
    db
      .query<{ n: number }, [string]>(
        `SELECT 1 as n FROM gift_redemptions WHERE user_id = ? LIMIT 1`,
      )
      .get(userId) != null
  );
}

export function dbUserRedeemedGiftCode(userId: string, giftCodeId: string): boolean {
  return (
    db
      .query<{ n: number }, [string, string]>(
        `SELECT 1 as n FROM gift_redemptions
         WHERE user_id = ? AND gift_code_id = ?
         LIMIT 1`,
      )
      .get(userId, giftCodeId) != null
  );
}

/**
 * Redeem a gift code for Premium. Returns error code or success payload.
 * Re-activating after cancel (same code already redeemed) is allowed without a new redemption
 * and without another grant (`reactivated: true`).
 */
export function dbRedeemGiftCode(
  userId: string,
  rawCode: string,
):
  | { ok: true; giftCodeId: string; reactivated: boolean }
  | {
      ok: false;
      reason:
        | "invalid_code"
        | "disabled"
        | "exhausted"
        | "already_redeemed"
        | "already_premium"
        | "user_not_found";
    } {
  const code = normalizeGiftCode(rawCode);
  if (!code) return { ok: false, reason: "invalid_code" };

  const run = db.transaction(() => {
    const user = dbGetUserPlan(userId);
    if (!user) return { ok: false as const, reason: "user_not_found" as const };
    if (user.plan === "premium") {
      return { ok: false as const, reason: "already_premium" as const };
    }

    const gift = dbGetGiftCodeByCode(code);
    if (!gift) return { ok: false as const, reason: "invalid_code" as const };
    if (gift.disabled_at) return { ok: false as const, reason: "disabled" as const };

    const now = new Date().toISOString();

    // Cancelled Premium but still holds this gift redemption → re-entitle only.
    if (dbUserRedeemedGiftCode(userId, gift.id)) {
      dbSetUserPlan({
        userId,
        plan: "premium",
        planSource: "gift",
        giftCodeId: gift.id,
        updatedAt: now,
      });
      return { ok: true as const, giftCodeId: gift.id, reactivated: true };
    }

    if (dbUserHasGiftRedemption(userId)) {
      return { ok: false as const, reason: "already_redeemed" as const };
    }

    if (
      gift.max_redemptions != null &&
      gift.redemption_count >= gift.max_redemptions
    ) {
      return { ok: false as const, reason: "exhausted" as const };
    }

    db.query(
      `INSERT INTO gift_redemptions (id, gift_code_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), gift.id, userId, now);

    db.query(
      `UPDATE gift_codes SET redemption_count = redemption_count + 1 WHERE id = ?`,
    ).run(gift.id);

    dbSetUserPlan({
      userId,
      plan: "premium",
      planSource: "gift",
      giftCodeId: gift.id,
      updatedAt: now,
    });

    return { ok: true as const, giftCodeId: gift.id, reactivated: false };
  });

  return run();
}
