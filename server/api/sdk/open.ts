import type { BunRequest } from "bun";
import { apiError, apiSuccess } from "/utils/api.server";
import { isOriginForApp } from "/utils/app-host";
import { resolveAppFromOrigin } from "/utils/app-runtime.server";
import { dbGetAppBySlug, dbLogOpenEvent } from "/server/database/queries/apps";
import { parseBearerToken, resolveRuntimeToken } from "/utils/sdk-auth.server";
import { sdkCorsOptions, withSdkCors } from "/utils/sdk-cors.server";

/**
 * POST /api/sdk/open — Remiix Patch records an open when the user has a connect token.
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCorsOptions(req);
  },

  async POST(req: BunRequest) {
    const origin = req.headers.get("Origin");

    const resolved = resolveRuntimeToken(parseBearerToken(req));
    if (!resolved.ok) {
      const code = resolved.reason === "expired" ? "TOKEN_EXPIRED" : "UNAUTHORIZED";
      return withSdkCors(apiError({ code, status: 401 }), origin);
    }

    const { userId, appSlug } = resolved.token;
    const fromOrigin = resolveAppFromOrigin(origin);
    if (!fromOrigin || fromOrigin.row.slug !== appSlug || !isOriginForApp(origin, fromOrigin.row)) {
      return withSdkCors(apiError({ code: "ORIGIN_DENIED", status: 403 }), origin);
    }

    const row = dbGetAppBySlug(appSlug);
    if (!row || row.visibility !== "public" || row.is_draft === 1 || !row.published_version_id) {
      return withSdkCors(apiError({ code: "NOT_FOUND", status: 404 }), origin);
    }

    dbLogOpenEvent(userId, row.id);
    return withSdkCors(
      apiSuccess({
        data: {
          slug: appSlug,
          openedAt: new Date().toISOString(),
        },
      }),
      origin,
    );
  },
};
