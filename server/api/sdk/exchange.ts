import type { BunRequest } from "bun";
import { dbExchangePermissionCode } from "/server/database/queries/permission";
import { apiError, apiSuccess } from "/utils/api.server";
import { resolveAppFromOrigin } from "/utils/app-runtime.server";
import { sdkCorsOptions, withSdkCors } from "/utils/sdk-cors.server";

/**
 * POST /api/sdk/exchange — swap one-time permission code for an opaque runtime token.
 * Called cross-origin from `{slug|uuid}.{APP_RUNTIME_HOST}` (no cookies).
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCorsOptions(req);
  },

  async POST(req: BunRequest) {
    const origin = req.headers.get("Origin");

    let body: { code?: unknown };
    try {
      body = (await req.json()) as { code?: unknown };
    } catch {
      return withSdkCors(apiError({ code: "INVALID_JSON", status: 400 }), origin);
    }

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      return withSdkCors(apiError({ code: "MISSING_CODE", status: 400 }), origin);
    }

    const result = dbExchangePermissionCode(code, {
      originAllowed: (appSlug) => {
        const resolved = resolveAppFromOrigin(origin);
        return resolved?.row.slug === appSlug;
      },
    });
    if (!result.ok) {
      if (result.reason === "origin") {
        return apiError({ code: "ORIGIN_DENIED", status: 403 });
      }
      const status = result.reason === "not_found" ? 404 : 400;
      const codeName =
        result.reason === "used"
          ? "CODE_USED"
          : result.reason === "expired"
            ? "CODE_EXPIRED"
            : "CODE_NOT_FOUND";
      return withSdkCors(apiError({ code: codeName, status }), origin);
    }

    return withSdkCors(
      apiSuccess({
        data: {
          accessToken: result.tokenId,
          expiresAt: result.expiresAt,
        },
      }),
      origin,
    );
  },
};
