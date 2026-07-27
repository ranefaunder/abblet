import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug, dbUnpublishApp } from "/server/database/queries/apps";
import { parseAppConfig, type AppDetail } from "/types/app-config-types";

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
      if (!row) return apiError({ code: "NOT_FOUND", status: 404 });
      if (row.owner_id !== user.id) return apiError({ code: "FORBIDDEN", status: 403 });

      if (!dbUnpublishApp(row.id, user.id)) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      const updated = dbGetAppBySlug(slug)!;
      const config = parseAppConfig(updated.config_json);
      if (!config) return apiError({ code: "NOT_FOUND", status: 404 });

      const detail: AppDetail = {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        description: updated.description,
        visibility: updated.visibility,
        ownerId: updated.owner_id,
        config,
        canEdit: true,
        isDraft: updated.is_draft === 1,
        iconId: updated.icon_id ?? null,
        category: updated.category ?? config.category ?? null,
        tagline: updated.tagline ?? config.tagline ?? null,
      };

      return apiSuccess({ data: { app: detail } });
    });
  },
};
