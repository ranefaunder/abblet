import type { BunRequest } from "bun";
import { apiError, apiSuccess } from "/utils/api.server";
import { resolveAppFromOrigin } from "/utils/app-runtime.server";
import { sdkCredentialCorsOptions, withSdkCredentialCors } from "/utils/sdk-cors.server";

/**
 * GET /api/sdk/session — public metadata for the calling app Origin.
 * No platform cookie (host-only on remiix.app). Ownership/login live on the platform.
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCredentialCorsOptions(req);
  },

  async GET(req: BunRequest) {
    const origin = req.headers.get("Origin");
    const resolved = resolveAppFromOrigin(origin);
    if (!resolved) {
      return apiError({ code: "ORIGIN_DENIED", status: 403 });
    }

    const { row } = resolved;
    const published = row.visibility === "public" && row.published_version_id != null && row.is_draft !== 1;

    return withSdkCredentialCors(
      apiSuccess({
        data: {
          user: null,
          isOwner: false,
          published: published === true,
        },
      }),
      origin,
    );
  },
};
