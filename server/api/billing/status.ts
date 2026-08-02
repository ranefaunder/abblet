import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";
import { billingStatusForUser } from "/utils/entitlements.server";
import { ensureMonthlyPlanGrant } from "/utils/credits.server";

/** GET /api/:lang/billing/status — plan + grant (Polar-ready provider field). */
export default {
  async GET(req: BunRequest) {
    return withAuth(req, async (user) => {
      ensureMonthlyPlanGrant(user.id);
      return apiSuccess({ data: billingStatusForUser(user.id) });
    });
  },
};
