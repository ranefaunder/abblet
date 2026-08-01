import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug, dbPublishApp, dbUpdateApp } from "/server/database/queries/apps";
import { resolveAppConfig } from "/server/database/queries/app-versions";
import { isDraftConfig, type AppDetail } from "/types/app-config-types";
import { normalizeAppCategory } from "/utils/app-categories";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/types/i18n-types";

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

      const config = resolveAppConfig(row, { asOwner: true });
      if (!config || isDraftConfig(config)) {
        return apiError({
          code: "NOT_READY",
          message: t("Finish building the app before adding it to My Apps.", language),
          status: 400,
        });
      }

      const category = normalizeAppCategory(row.category ?? config.category);
      const tagline = (row.tagline ?? config.tagline ?? config.description.slice(0, 40)).trim();
      const nextConfig = {
        ...config,
        title: row.title,
        category,
        tagline: tagline || undefined,
      };

      dbUpdateApp(row.id, {
        category,
        tagline: tagline || null,
      });

      if (!dbPublishApp(row.id, user.id)) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      const updated = dbGetAppBySlug(slug)!;
      const detail: AppDetail = {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        description: updated.description,
        visibility: updated.visibility,
        ownerId: updated.owner_id,
        config: nextConfig,
        canEdit: true,
        isDraft: updated.is_draft === 1,
        iconId: updated.icon_id ?? null,
        category: updated.category ?? nextConfig.category ?? null,
        tagline: updated.tagline ?? nextConfig.tagline ?? null,
        nextPrompt: updated.next_prompt ?? null,
        latestVersionId: updated.latest_version_id ?? null,
        publishedVersionId: updated.published_version_id ?? null,
      };

      return apiSuccess({ data: { app: detail } });
    });
  },
};
