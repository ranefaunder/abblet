import type { BunRequest } from "bun";
import {
  dbCreateApp,
  dbGenerateAppSlug,
  dbUpdateApp,
} from "/server/database/queries/apps";
import { resolveSourceConfigForRemix } from "/server/database/queries/app-versions";
import { generateAppIcon } from "/utils/ai-app-icons.server";
import { generateAppName } from "/utils/ai-apps.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { apiErrorFromAi } from "/utils/ai-api.server";
import { isOriginForApp } from "/utils/app-host";
import { resolveAppFromOrigin } from "/utils/app-runtime.server";
import { assertHasCredits, debitOpenRouterUsage, releaseCreditReservation } from "/utils/credits.server";
import { isDraftConfig } from "/types/app-config-types";
import { getClientIP } from "/utils/request.server";
import { remixFallbackTitle } from "/utils/remix-title";
import { parseBearerToken, resolveRuntimeToken } from "/utils/sdk-auth.server";
import { sdkCorsOptions, withSdkCors } from "/utils/sdk-cors.server";
import { checkRateLimit } from "/utils/rate-limit.server";

/**
 * POST /api/sdk/remix — remix into the signed-in user's library via Bearer token.
 * Cookie auth is not accepted (CSRF from app subdomains). Use platform Remix UI otherwise.
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCorsOptions(req);
  },

  async POST(req: BunRequest) {
    const origin = req.headers.get("Origin");
    const resolvedOrigin = resolveAppFromOrigin(origin);
    if (!resolvedOrigin) {
      return apiError({ code: "ORIGIN_DENIED", status: 403 });
    }

    const tokenResolved = resolveRuntimeToken(parseBearerToken(req));
    if (!tokenResolved.ok) {
      const code = tokenResolved.reason === "expired" ? "TOKEN_EXPIRED" : "UNAUTHORIZED";
      return withSdkCors(apiError({ code, status: 401 }), origin);
    }

    const { userId, appSlug } = tokenResolved.token;
    if (
      resolvedOrigin.row.slug !== appSlug ||
      !isOriginForApp(origin, resolvedOrigin.row)
    ) {
      return apiError({ code: "ORIGIN_DENIED", status: 403 });
    }

    if (!checkRateLimit(userId, "app_remix", 20, 60)) {
      return withSdkCors(apiError({ code: "RATE_LIMITED", status: 429 }), origin);
    }

    const source = resolvedOrigin.row;
    if (source.visibility !== "public" || source.is_draft === 1) {
      return withSdkCors(apiError({ code: "NOT_FOUND", status: 404 }), origin);
    }

    if (source.owner_id === userId) {
      return withSdkCors(apiError({ code: "ALREADY_OWNER", status: 400 }), origin);
    }

    const config = resolveSourceConfigForRemix(source, userId);
    if (!config || isDraftConfig(config)) {
      return withSdkCors(apiError({ code: "NOT_READY", status: 404 }), origin);
    }

    let reservation;
    try {
      reservation = assertHasCredits(userId, "edit");
    } catch (err) {
      const aiError = apiErrorFromAi(err, "en");
      if (aiError) return withSdkCors(aiError, origin);
      throw err;
    }

    const suffix = Math.random().toString(36).slice(2, 6);
    const tagName = `${config.tagName}-${suffix}`.replace(/[^a-z0-9-]/g, "");
    const code = config.code.split(config.tagName).join(tagName);

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
        language: "en",
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
      // Keep fallback.
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
      ownerId: userId,
      title,
      description,
      slug: newSlug,
      config: remixedConfig,
      sourceAppId: source.id,
      isDraft: false,
      category,
      tagline,
      summary: "Created the app",
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
        userId,
        costUsd: renameCostUsd ?? null,
        floorKind: "edit",
        reason: "ai_edit",
        meta: { appId: id, slug: newSlug, tool: "remix_rename" },
        reservation,
      });
      reservation = undefined as typeof reservation;
    }
    if (iconResult) {
      debitOpenRouterUsage({
        userId,
        costUsd: iconResult.costUsd,
        floorKind: "edit",
        reason: "ai_icon",
        meta: { appId: id, slug: newSlug },
        reservation,
      });
      reservation = undefined as typeof reservation;
    }
    releaseCreditReservation(reservation);

    return withSdkCors(
      apiSuccess({
        data: { slug: newSlug },
        status: 201,
      }),
      origin,
    );
  },
};
