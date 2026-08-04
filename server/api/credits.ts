import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";
import { getCreditsSnapshot, usdMicrosToUsd } from "/utils/credits.server";
import {
  dbListCreditSpendByApp,
  dbListDailyCreditSpend,
} from "/server/database/queries/credits";

function roundSpendUsd(micros: number): number {
  return Math.round(usdMicrosToUsd(micros) * 10000) / 10000;
}

/** GET /api/:lang/credits — wallet snapshot + spend history. */
export default {
  async GET(req: BunRequest) {
    return withAuth(req, async (user) => {
      const snap = getCreditsSnapshot(user.id);
      const dailySpend = dbListDailyCreditSpend(user.id, 31).map((row) => ({
        day: row.day,
        spentUsd: roundSpendUsd(row.spentUsdMicros),
      }));
      const byApp = dbListCreditSpendByApp(user.id).map((row) => ({
        kind: row.kind,
        slug: row.slug,
        title: row.title,
        iconId: row.iconId,
        spentUsd: roundSpendUsd(row.spentUsdMicros),
      }));
      return apiSuccess({
        data: {
          balanceUsdMicros: snap.balanceUsdMicros,
          balanceUsd: Math.round(snap.balanceUsd * 100) / 100,
          periodYm: snap.periodYm,
          freeGrantUsd: snap.freeGrantUsd,
          grantUsd: snap.grantUsd,
          plan: snap.plan,
          planSource: snap.planSource,
          nextGrantAt: snap.nextGrantAt,
          nextGrantUsd: snap.nextGrantUsd,
          nextGrantMode: snap.nextGrantMode,
          dailySpend,
          byApp,
        },
      });
    });
  },
};
