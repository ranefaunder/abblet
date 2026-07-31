import type { BunRequest } from "bun";
import { apiError, apiSuccess } from "/utils/api.server";
import { isOriginForApp } from "/utils/app-host";
import { resolveAppFromOrigin } from "/utils/app-runtime.server";
import { getCreditsSnapshot } from "/utils/credits.server";
import { parseBearerToken, resolveRuntimeToken } from "/utils/sdk-auth.server";
import { sdkCorsOptions, withSdkCors } from "/utils/sdk-cors.server";

/**
 * GET /api/sdk/credits — wallet snapshot for a connected app runtime (Bearer token).
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCorsOptions(req);
  },

  async GET(req: BunRequest) {
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

    const snap = getCreditsSnapshot(userId);
    return withSdkCors(
      apiSuccess({
        data: {
          balanceUsd: Math.round(snap.balanceUsd * 100) / 100,
          balanceUsdMicros: snap.balanceUsdMicros,
          periodYm: snap.periodYm,
          freeGrantUsd: snap.freeGrantUsd,
          isOwner: fromOrigin.row.owner_id === userId,
        },
      }),
      origin,
    );
  },
};
