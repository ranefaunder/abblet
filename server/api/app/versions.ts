import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug } from "/server/database/queries/apps";
import { dbListAppVersions } from "/server/database/queries/app-versions";

export default {
  async GET(req: BunRequest) {
    return withAuth(req, async (user) => {
      const url = new URL(req.url);
      const slug = url.searchParams.get("slug")?.trim() ?? "";
      if (!slug) return apiError({ code: "SLUG_REQUIRED" });

      const row = dbGetAppBySlug(slug);
      if (!row) return apiError({ code: "NOT_FOUND", status: 404 });
      if (row.owner_id !== user.id) return apiError({ code: "FORBIDDEN", status: 403 });

      const versions = dbListAppVersions(row.id).map((v) => ({
        id: v.id,
        versionNumber: v.version_number,
        status: v.status,
        summary: (v.summary ?? "").trim(),
        createdAt: v.created_at,
        isLatest: v.id === row.latest_version_id,
        isPublished: v.id === row.published_version_id,
      }));

      return apiSuccess({ data: { versions } });
    });
  },
};
