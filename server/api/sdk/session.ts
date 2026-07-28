import type { BunRequest } from "bun";
import { dbGetAppBySlug } from "/server/database/queries/apps";
import { apiError, apiSuccess } from "/utils/api.server";
import { isAppRuntimeOrigin } from "/utils/app-host";
import { getAuthenticatedUser } from "/utils/auth.server";
import { sdkCredentialCorsOptions, withSdkCredentialCors } from "/utils/sdk-cors.server";

/**
 * GET /api/sdk/session — platform cookie session + ownership for the calling app Origin.
 * Called cross-origin from `{slug}.{APP_RUNTIME_HOST}` with credentials: "include".
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCredentialCorsOptions(req);
  },

  async GET(req: BunRequest) {
    const origin = req.headers.get("Origin");
    const slug = isAppRuntimeOrigin(origin);
    if (!slug) {
      return apiError({ code: "ORIGIN_DENIED", status: 403 });
    }

    const user = getAuthenticatedUser(req);
    const row = dbGetAppBySlug(slug);
    const isOwner = !!(user && row && row.owner_id === user.id);
    const published = row?.visibility === "public" && row.is_draft !== 1;

    return withSdkCredentialCors(
      apiSuccess({
        data: {
          user: user
            ? {
                id: user.id,
                email: user.email,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                nickname: user.nickname ?? null,
                marketingOptIn: user.marketingOptIn === true,
              }
            : null,
          isOwner,
          published: published === true,
        },
      }),
      origin,
    );
  },
};
