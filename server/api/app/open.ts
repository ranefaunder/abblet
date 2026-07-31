import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug, dbLogOpenEvent } from "/server/database/queries/apps";

/** POST /api/:lang/app/open — record that the signed-in user opened an app. */
export default {
  async POST(req: BunRequest) {
    return withAuth(req, async (user) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ code: "INVALID_JSON" });
      }

      const slug =
        typeof (body as { slug?: string }).slug === "string"
          ? (body as { slug: string }).slug.trim()
          : "";
      if (!slug) return apiError({ code: "SLUG_REQUIRED" });

      const row = dbGetAppBySlug(slug);
      if (!row || row.visibility !== "public" || row.is_draft === 1 || !row.published_version_id) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      dbLogOpenEvent(user.id, row.id);
      return apiSuccess({
        data: {
          slug,
          openedAt: new Date().toISOString(),
        },
      });
    });
  },
};
