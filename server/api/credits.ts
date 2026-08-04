import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";
import { getCreditsSnapshot, usdMicrosToUsd } from "/utils/credits.server";
import {
  dbListCreditSpendByAppMonth,
  dbListDailyCreditSpendSplit,
} from "/server/database/queries/credits";

function roundCents(micros: number): number {
  const usd = usdMicrosToUsd(micros);
  if (!(usd > 0)) return 0;
  // Sub-cent spend must not become 0 — UI shows at least $0.01.
  return Math.max(0.01, Math.round(usd * 100) / 100);
}

/** GET /api/:lang/credits — wallet snapshot + spend history. */
export default {
  async GET(req: BunRequest) {
    return withAuth(req, async (user) => {
      const snap = getCreditsSnapshot(user.id);
      const dailySpend = dbListDailyCreditSpendSplit(user.id, 730).map((row) => ({
        day: row.day,
        creatingUsd: roundCents(row.creatingUsdMicros),
        usingUsd: roundCents(row.usingUsdMicros),
      }));
      const byAppMonth = dbListCreditSpendByAppMonth(user.id).map((row) => ({
        ym: row.ym,
        slug: row.slug,
        title: row.title,
        iconId: row.iconId,
        creatingUsd: roundCents(row.creatingUsdMicros),
        usingUsd: roundCents(row.usingUsdMicros),
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
          byAppMonth,
        },
      });
    });
  },
};
