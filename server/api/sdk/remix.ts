import type { BunRequest } from "bun";
import {
  dbCreateApp,
  dbGenerateAppSlug,
  dbGetAppBySlug,
  dbUpdateApp,
} from "/server/database/queries/apps";
import { generateAppIcon } from "/utils/ai-app-icons.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { isAppRuntimeOrigin } from "/utils/app-host";
import { getAuthenticatedUser } from "/utils/auth.server";
import { isDraftConfig, parseAppConfig } from "/types/app-config-types";
import { getClientIP } from "/utils/request.server";
import { sdkCredentialCorsOptions, withSdkCredentialCors } from "/utils/sdk-cors.server";

/**
 * POST /api/sdk/remix — remix the app identified by Origin into the signed-in user's library.
 * Cookie auth + credentialed CORS (same as /api/sdk/session).
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCredentialCorsOptions(req);
  },

  async POST(req: BunRequest) {
    const origin = req.headers.get("Origin");
    const slug = isAppRuntimeOrigin(origin);
    if (!slug) {
      return apiError({ code: "ORIGIN_DENIED", status: 403 });
    }

    const user = getAuthenticatedUser(req);
    if (!user) {
      return withSdkCredentialCors(apiError({ code: "UNAUTHORIZED", status: 401 }), origin);
    }

    const source = dbGetAppBySlug(slug);
    if (!source || source.visibility !== "public" || source.is_draft === 1) {
      return withSdkCredentialCors(apiError({ code: "NOT_FOUND", status: 404 }), origin);
    }

    if (source.owner_id === user.id) {
      return withSdkCredentialCors(
        apiError({ code: "ALREADY_OWNER", status: 400 }),
        origin,
      );
    }

    const config = parseAppConfig(source.config_json);
    if (!config || isDraftConfig(config)) {
      return withSdkCredentialCors(apiError({ code: "NOT_READY", status: 404 }), origin);
    }

    const suffix = Math.random().toString(36).slice(2, 6);
    const tagName = `${config.tagName}-${suffix}`.replace(/[^a-z0-9-]/g, "");
    const code = config.code.split(config.tagName).join(tagName);

    const remixedConfig = {
      ...config,
      tagName,
      code,
      status: "ready" as const,
    };

    const id = crypto.randomUUID();
    const newSlug = dbGenerateAppSlug();
    dbCreateApp({
      id,
      ownerId: user.id,
      title: remixedConfig.title,
      description: remixedConfig.description,
      slug: newSlug,
      configJson: JSON.stringify(remixedConfig),
      sourceAppId: source.id,
      isDraft: false,
      category: remixedConfig.category ?? source.category ?? null,
      tagline: remixedConfig.tagline ?? source.tagline ?? null,
    });

    const clientIP = getClientIP(req);
    const iconResult = await generateAppIcon({
      title: remixedConfig.title,
      description: remixedConfig.description,
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
