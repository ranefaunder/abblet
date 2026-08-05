import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import {
  dbCreateApp,
  dbGenerateAppSlug,
  dbGetAppBySlug,
  dbUpdateApp,
} from "/server/database/queries/apps";
import { resolveSourceConfigForRemix } from "/server/database/queries/app-versions";
import { generateAppIcon } from "/utils/ai-app-icons.server";
import { generateAppName } from "/utils/ai-apps.server";
import { apiErrorFromAi } from "/utils/ai-api.server";
import { assertHasCredits, debitOpenRouterUsage, releaseCreditReservation } from "/utils/credits.server";
import { isDraftConfig, type AppDetail } from "/types/app-config-types";
import { getClientIP } from "/utils/request.server";
import { remixFallbackTitle } from "/utils/remix-title";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/types/i18n-types";
import { checkRateLimit } from "/utils/rate-limit.server";

/**
 * Remix = clone into a new owned app project with a fresh name + icon.
 * Code/content starts as v1 of the new app.
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

      const language = (getLang(req.url) ?? "en") as Language;
      const slug =
        typeof (body as { slug?: string }).slug === "string"
          ? (body as { slug: string }).slug.trim()
          : "";
      if (!slug) return apiError({ code: "SLUG_REQUIRED" });

      if (!checkRateLimit(user.id, "app_remix", 20, 60)) {
        return apiError({
          code: "RATE_LIMIT_EXCEEDED",
          message: t("Too many requests. Wait a moment before retrying.", language),
          status: 429,
        });
      }

      const source = dbGetAppBySlug(slug);
      if (!source || source.visibility !== "public" || source.is_draft === 1) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      const config = resolveSourceConfigForRemix(source, user.id);
      if (!config || isDraftConfig(config)) {
        return apiError({
          code: "NOT_READY",
          message: t("App not found", language),
          status: 404,
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

      const suffix = Math.random().toString(36).slice(2, 6);
      const tagName = `${config.tagName}-${suffix}`.replace(/[^a-z0-9-]/g, "");
      let code = config.code.split(config.tagName).join(tagName);

      let title = remixFallbackTitle(source.title);
      let description = config.description;
      let tagline = config.tagline ?? source.tagline ?? null;
      let category = config.category ?? source.category ?? null;
      let renameCostUsd: number | null | undefined;
      let renamedOk = false;

      try {
        const renamed = await generateAppName({
          current: { ...config, title: source.title },
          instruction:
            "This is a remix of another app. Give it a fresh short home-screen name related to the same idea.",
          language,
        });
        if (renamed) {
          title = renamed.title;
          description = renamed.description;
          tagline = renamed.tagline || tagline;
          category = renamed.category || category;
          renameCostUsd = renamed.costUsd;
          renamedOk = true;
        }
      } catch {
        // Keep fallback title/description.
      }

      const remixedConfig = {
        ...config,
        title,
        description,
        tagline: tagline || undefined,
        category: category as typeof config.category,
        tagName,
        code,
        status: "ready" as const,
      };

      const id = crypto.randomUUID();
      const newSlug = dbGenerateAppSlug();
      dbCreateApp({
        id,
        ownerId: user.id,
        title,
        description,
        slug: newSlug,
        config: remixedConfig,
        sourceAppId: source.id,
        isDraft: false,
        category,
        tagline,
        summary: t("Created the app", language),
      });

      const clientIP = getClientIP(req);
      const iconResult = await generateAppIcon({
        title,
        description,
        clientIP,
      });
      if (iconResult) {
        dbUpdateApp(id, { iconId: iconResult.iconId });
      }

      if (renamedOk) {
        debitOpenRouterUsage({
          userId: user.id,
          costUsd: renameCostUsd ?? null,
          floorKind: "edit",
          reason: "ai_edit",
          meta: { appId: id, slug: newSlug, tool: "remix_rename" },
          reservation,
        });
        reservation = null as typeof reservation;
      }
      if (iconResult) {
        debitOpenRouterUsage({
          userId: user.id,
          costUsd: iconResult.costUsd,
          floorKind: "edit",
          reason: "ai_icon",
          meta: { appId: id, slug: newSlug },
          reservation,
        });
        reservation = null as typeof reservation;
      }
      releaseCreditReservation(reservation);

      const row = dbGetAppBySlug(newSlug)!;
      const detail: AppDetail = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        visibility: row.visibility,
        ownerId: row.owner_id,
        config: { ...remixedConfig, title: row.title },
        canEdit: true,
        isDraft: false,
        iconId: row.icon_id ?? null,
        category: row.category ?? remixedConfig.category ?? null,
        tagline: row.tagline ?? remixedConfig.tagline ?? null,
        nextPrompt: row.next_prompt ?? null,
      };

      return apiSuccess({ data: { app: detail }, status: 201 });
    });
  },
};
