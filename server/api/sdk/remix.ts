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
import { resolveAppFromOrigin } from "/utils/app-runtime.server";
import { getAuthenticatedUser } from "/utils/auth.server";
import { isDraftConfig } from "/types/app-config-types";
import { getClientIP } from "/utils/request.server";
import { remixFallbackTitle } from "/utils/remix-title";
import { sdkCredentialCorsOptions, withSdkCredentialCors } from "/utils/sdk-cors.server";

/**
 * POST /api/sdk/remix — remix into the signed-in user's library.
 * Requires platform cookie (host-only on remiix.app). App subdomains cannot
 * send that cookie — use the platform Remix flow / login instead.
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCredentialCorsOptions(req);
  },

  async POST(req: BunRequest) {
    const origin = req.headers.get("Origin");
    const resolved = resolveAppFromOrigin(origin);
    if (!resolved) {
      return apiError({ code: "ORIGIN_DENIED", status: 403 });
    }

    const user = getAuthenticatedUser(req);
    if (!user) {
      return withSdkCredentialCors(apiError({ code: "UNAUTHORIZED", status: 401 }), origin);
    }

    const source = resolved.row;
    if (source.visibility !== "public" || source.is_draft === 1) {
      return withSdkCredentialCors(apiError({ code: "NOT_FOUND", status: 404 }), origin);
    }

    if (source.owner_id === user.id) {
      return withSdkCredentialCors(
        apiError({ code: "ALREADY_OWNER", status: 400 }),
        origin,
      );
    }

    const config = resolveSourceConfigForRemix(source, user.id);
    if (!config || isDraftConfig(config)) {
      return withSdkCredentialCors(apiError({ code: "NOT_READY", status: 404 }), origin);
    }

    const suffix = Math.random().toString(36).slice(2, 6);
    const tagName = `${config.tagName}-${suffix}`.replace(/[^a-z0-9-]/g, "");
    const code = config.code.split(config.tagName).join(tagName);

    let title = remixFallbackTitle(source.title);
    let description = config.description;
    let tagline = config.tagline ?? source.tagline ?? null;
    let category = config.category ?? source.category ?? null;

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
      ownerId: user.id,
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

    return withSdkCredentialCors(
      apiSuccess({
        data: { slug: newSlug },
        status: 201,
      }),
      origin,
    );
  },
};
