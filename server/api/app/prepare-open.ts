import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import {
  DEFAULT_AI_MONTHLY_LIMIT_USD,
  DEFAULT_AI_MONTHLY_LIMIT_USD_MICROS,
  dbHasPermissionGrant,
} from "/server/database/queries/permission";
import { mintPermissionNonce } from "/utils/permission-nonce.server";
import { appRuntimeOrigin, permissionUrl } from "/utils/app-host";
import { appNeedsAi } from "/utils/app-permissions";
import { usdToUsdMicros } from "/utils/credits.server";

const MIN_MONTHLY_LIMIT_USD = 0.1;
const MAX_MONTHLY_LIMIT_USD = 100;

function parseMonthlyLimitUsd(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_AI_MONTHLY_LIMIT_USD;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n)) return DEFAULT_AI_MONTHLY_LIMIT_USD;
  return Math.min(MAX_MONTHLY_LIMIT_USD, Math.max(MIN_MONTHLY_LIMIT_USD, Math.round(n * 100) / 100));
}

function hasExplicitMonthlyLimit(raw: unknown): boolean {
  return raw !== undefined && raw !== null && raw !== "";
}

/**
 * POST /api/:lang/app/prepare-open — Store "Open" / permission Allow.
 * Non-AI apps: direct runtime URL (no permission flow).
 * AI apps: permission-grant URL with optional confirm nonce (Open = allow AI).
 * Body: { slug, monthlyLimitUsd? } — when set (Allow), upserts the monthly AI budget.
 */
export default {
  async POST(req: BunRequest) {
    return withAuth(req, async (user) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ code: "INVALID_JSON" });
      }

      const slug =
        typeof (body as { slug?: string }).slug === "string"
          ? (body as { slug: string }).slug.trim()
          : "";
      if (!slug || !isNumericAppSlug(slug)) {
        return apiError({ code: "SLUG_REQUIRED" });
      }

      const rawMonthlyLimit = (body as { monthlyLimitUsd?: unknown }).monthlyLimitUsd;
      const setBudget = hasExplicitMonthlyLimit(rawMonthlyLimit);
      const monthlyLimitUsd = parseMonthlyLimitUsd(rawMonthlyLimit);
      const monthlyLimitUsdMicros =
        usdToUsdMicros(monthlyLimitUsd) || DEFAULT_AI_MONTHLY_LIMIT_USD_MICROS;

      const row = dbGetAppBySlug(slug);
      if (!row) return apiError({ code: "NOT_FOUND", status: 404 });

      const canOpen =
        row.owner_id === user.id || (row.visibility === "public" && row.is_draft === 0);
      if (!canOpen) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      if (!appNeedsAi(row.required_permissions)) {
        return apiSuccess({ data: { url: `${appRuntimeOrigin(row)}/` } });
      }

      const base = permissionUrl(slug);
      // Store Open with an existing grant: skip consent. Allow always passes monthlyLimitUsd
      // so the chosen budget is written even when a grant already exists.
      if (dbHasPermissionGrant(user.id, slug, "ai") && !setBudget) {
        return apiSuccess({ data: { url: base } });
      }

      const nonce = mintPermissionNonce(user.id, slug, monthlyLimitUsdMicros);
      return apiSuccess({
        data: { url: `${base}?confirm=${encodeURIComponent(nonce)}` },
      });
    });
  },
};
