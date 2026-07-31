import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";
import { getCreditsSnapshot } from "/utils/credits.server";

/** GET /api/:lang/credits — wallet snapshot (lazy monthly free grant). */
export default {
  async GET(req: BunRequest) {
    return withAuth(req, async (user) => {
      const snap = getCreditsSnapshot(user.id);
      return apiSuccess({
        data: {
          balanceUsdMicros: snap.balanceUsdMicros,
          balanceUsd: Math.round(snap.balanceUsd * 100) / 100,
          periodYm: snap.periodYm,
          freeGrantUsd: snap.freeGrantUsd,
        },
      });
    });
  },
};
