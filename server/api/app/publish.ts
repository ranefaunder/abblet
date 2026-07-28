import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug, dbPublishApp, dbUpdateApp } from "/server/database/queries/apps";
import { isDraftConfig, parseAppConfig, type AppDetail } from "/types/app-config-types";
import { normalizeAppCategory } from "/utils/app-categories";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/types/i18n-types";

function toDetail(
  row: NonNullable<ReturnType<typeof dbGetAppBySlug>>,
  config: NonNullable<ReturnType<typeof parseAppConfig>>,
): AppDetail {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    ownerId: row.owner_id,
    config,
    canEdit: true,
    isDraft: row.is_draft === 1,
    iconId: row.icon_id ?? null,
    category: row.category ?? config.category ?? null,
    tagline: row.tagline ?? config.tagline ?? null,
  };
}

export default {
  async POST(req: BunRequest) {
    return withAuth(req, async (user) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ code: "INVALID_JSON" });
      }

      const language = (getLang(req.url) ?? "en") as Language;
      const slug =
        typeof (body as { slug?: string }).slug === "string"
          ? (body as { slug: string }).slug.trim()
          : "";
      if (!slug) return apiError({ code: "SLUG_REQUIRED" });

      const row = dbGetAppBySlug(slug);
      if (!row) return apiError({ code: "NOT_FOUND", status: 404 });
      if (row.owner_id !== user.id) return apiError({ code: "FORBIDDEN", status: 403 });

      const config = parseAppConfig(row.config_json);
      if (!config || isDraftConfig(config)) {
        return apiError({
          code: "NOT_READY",
          message: t("Finish building the app before adding it to My Apps.", language),
          status: 400,
        });
      }

      // Ensure store metadata columns are filled before publishing.
      const category = normalizeAppCategory(row.category ?? config.category);
      const tagline = (row.tagline ?? config.tagline ?? config.description.slice(0, 40)).trim();
      const nextConfig = { ...config, category, tagline: tagline || undefined };

      dbUpdateApp(row.id, {
        category,
        tagline: tagline || null,
        configJson: JSON.stringify(nextConfig),
      });

      if (!dbPublishApp(row.id, user.id)) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      const updated = dbGetAppBySlug(slug)!;
      return apiSuccess({ data: { app: toDetail(updated, nextConfig) } });
    });
  },
};
