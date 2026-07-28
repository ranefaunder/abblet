import type { BunRequest } from "bun";
import { getAuthenticatedUser } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetStoreAppBySlug } from "/server/database/queries/apps";

export default {
  async GET(req: BunRequest) {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim() ?? "";
    if (!slug) return apiError({ code: "SLUG_REQUIRED" });

    const user = getAuthenticatedUser(req);
    const app = dbGetStoreAppBySlug(slug, user?.id ?? null);
    if (!app) return apiError({ code: "NOT_FOUND", status: 404 });

    return apiSuccess({ data: { app } });
  },
};
