import type { BunRequest } from "bun";
import { getAuthenticatedUser } from "/utils/auth.server";
import { canViewApp } from "/utils/app-access.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug, dbUpdateApp } from "/server/database/queries/apps";
import { dbCommitAppVersion, resolveAppConfig } from "/server/database/queries/app-versions";
import { generateAppConfig } from "/utils/ai-apps.server";
import { apiErrorFromAi } from "/utils/ai-api.server";
import { buildAppDetail } from "/utils/app-detail.server";
import { assertHasCredits, debitOpenRouterUsage, releaseCreditReservation } from "/utils/credits.server";
import { isDraftConfig } from "/types/app-config-types";
import type { Language } from "/types/i18n-types";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";
import { resolveAppFromRequestHost } from "/utils/app-runtime.server";
import { checkRateLimit } from "/utils/rate-limit.server";

function viewOptsForReq(req: BunRequest, row: { id: string; slug: string }) {
  const resolved = resolveAppFromRequestHost(req);
  const viaCapabilityIdHost =
    resolved?.viaCapabilityIdHost === true && resolved.row.id === row.id;
  return { viaCapabilityIdHost };
}

export default {
  async GET(req: BunRequest) {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim();
    if (!slug) return apiError({ code: "SLUG_REQUIRED" });

    const user = getAuthenticatedUser(req);
    const row = dbGetAppBySlug(slug);
    if (!row) return apiError({ code: "NOT_FOUND", status: 404 });

    const viewOpts = viewOptsForReq(req, row);
    if (!canViewApp(row, user?.id ?? null, viewOpts)) {
      return apiError({ code: "FORBIDDEN", status: 403 });
    }

    const detail = buildAppDetail(row, user?.id ?? null);
    if (!detail) return apiError({ code: "FORBIDDEN", status: 403 });

    return apiSuccess({ data: { app: detail } });
  },

  async POST(req: BunRequest) {
    const user = getAuthenticatedUser(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError({ code: "INVALID_JSON" });
    }

    const slug = typeof (body as { slug?: string }).slug === "string" ? (body as { slug: string }).slug.trim() : "";
    if (!slug) return apiError({ code: "SLUG_REQUIRED" });

    const row = dbGetAppBySlug(slug);
    if (!row) return apiError({ code: "NOT_FOUND", status: 404 });

    const viewOpts = viewOptsForReq(req, row);
    const isOwner = user?.id === row.owner_id;
    // Owner session required for paid draft completion (capability host alone is not enough).
    if (!isOwner) {
      if (!user) return apiError({ code: "UNAUTHORIZED", status: 401 });
      if (!viewOpts.viaCapabilityIdHost) {
        return apiError({ code: "FORBIDDEN", status: 403 });
      }
      return apiError({
        code: "UNAUTHORIZED",
        message: "Sign in to finish building this app.",
        status: 401,
      });
    }

    const existing = resolveAppConfig(row, { asOwner: true });
    if (!isDraftConfig(existing)) {
      const detail = buildAppDetail(row, user.id, existing);
      return apiSuccess({ data: { app: detail } });
    }

    const language = (getLang(req.url) ?? "en") as Language;

    if (!checkRateLimit(user.id, "app_generate", 20, 60)) {
      return apiError({
        code: "RATE_LIMIT_EXCEEDED",
        message: t("Too many requests. Wait a moment before retrying.", language),
        status: 429,
      });
    }

    let reservation;
    try {
      reservation = assertHasCredits(user.id, "edit");
    } catch (err) {
      const aiError = apiErrorFromAi(err, language);
      if (aiError) return aiError;
      throw err;
    }

    const prompt = existing?.prompt ?? row.description;
    let generated;
    try {
      generated = await generateAppConfig(prompt, language);
    } catch (err) {
      releaseCreditReservation(reservation);
      const aiError = apiErrorFromAi(err, language);
      if (aiError) return aiError;
      throw err;
    }
    if (!generated) {
      releaseCreditReservation(reservation);
      return apiError({
        code: "GENERATION_FAILED",
        message: t("Could not create app. Try again.", language),
        status: 500,
      });
    }
    const config = generated.config;

    dbCommitAppVersion(row.id, config, {
      fromVersionId: row.latest_version_id,
      summary: t("Created the app", language),
    });
    dbUpdateApp(row.id, {
      title: config.title,
      description: config.description,
      category: config.category ?? null,
      tagline: config.tagline ?? null,
      isDraft: false,
    });

    debitOpenRouterUsage({
      userId: user.id,
      costUsd: generated.costUsd,
      floorKind: "edit",
      reason: "ai_generate",
      meta: { appId: row.id, slug },
      reservation,
    });

    const updated = dbGetAppBySlug(slug)!;
    const detail = buildAppDetail(updated, user.id, { ...config, title: updated.title });
    return apiSuccess({ data: { app: detail } });
  },
};
