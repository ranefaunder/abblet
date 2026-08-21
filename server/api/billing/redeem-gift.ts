import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { redeemGiftForPremium } from "/utils/entitlements.server";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/types/i18n-types";
import { checkRateLimit } from "/utils/rate-limit.server";

/** POST /api/:lang/billing/redeem-gift — entitle Premium via gift code. */
export default {
  async POST(req: BunRequest) {
    return withAuth(req, async (user) => {
      const language = (getLang(req.url) ?? "en") as Language;

      if (!checkRateLimit(user.id, "redeem_gift", 10, 60)) {
        return apiError({
          code: "RATE_LIMIT_EXCEEDED",
          message: t("Too many requests. Wait a moment before retrying.", language),
          status: 429,
        });
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ code: "INVALID_JSON" });
      }
      const code =
        typeof (body as { code?: unknown }).code === "string"
          ? (body as { code: string }).code
          : "";
      if (!code.trim()) {
        return apiError({
          code: "GIFT_CODE_REQUIRED",
          message: t("Enter a gift code", language),
          status: 400,
        });
      }

      const result = redeemGiftForPremium(user.id, code);
      if (!result.ok) {
        const messages: Record<typeof result.code, string> = {
          INVALID_GIFT_CODE: t("That gift code is not valid.", language),
          GIFT_CODE_DISABLED: t("That gift code is no longer active.", language),
          GIFT_CODE_EXHAUSTED: t("That gift code has been fully used.", language),
          GIFT_ALREADY_REDEEMED: t("You already redeemed a gift code.", language),
          ALREADY_PREMIUM: t("You already have Abblet Premium.", language),
          USER_NOT_FOUND: t("Account not found.", language),
        };
        return apiError({
          code: result.code,
          message: messages[result.code],
          status: 400,
        });
      }

      return apiSuccess({
        data: {
          plan: result.plan,
          balanceUsd: result.balanceUsd,
          grantUsd: result.grantUsd,
        },
      });
    });
  },
};
