import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { cancelPremiumPlan } from "/utils/entitlements.server";
import { ensureMonthlyPlanGrant, getCreditsSnapshot } from "/utils/credits.server";

/** POST /api/:lang/billing/cancel-premium — gift/local Premium → Free. */
export default {
  async POST(req: BunRequest) {
    return withAuth(req, async (user) => {
      const result = cancelPremiumPlan(user.id);
      if (!result.ok) {
        return apiError({ code: result.code, status: 400 });
      }
      ensureMonthlyPlanGrant(user.id);
      const snap = getCreditsSnapshot(user.id);
      return apiSuccess({
        data: {
          plan: snap.plan,
          balanceUsd: Math.round(snap.balanceUsd * 100) / 100,
          grantUsd: snap.grantUsd,
        },
      });
    });
  },
};
