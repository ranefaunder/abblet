import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug } from "/server/database/queries/apps";
import { dbCommitAppVersion, resolveAppConfig } from "/server/database/queries/app-versions";
import { isDraftConfig, type AppConfig, type AppDetail } from "/types/app-config-types";
import type { Language } from "/types/i18n-types";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";

export default {
  async POST(req: BunRequest) {
    return withAuth(req, async (user) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ code: "INVALID_JSON" });
      }

      const b = body as { slug?: string; code?: string };
      const slug = typeof b.slug === "string" ? b.slug.trim() : "";
      const code = typeof b.code === "string" ? b.code : "";
      const language = (getLang(req.url) ?? "en") as Language;

      if (!slug) return apiError({ code: "SLUG_REQUIRED" });
      if (!code.trim()) return apiError({ code: "CODE_REQUIRED" });

      const row = dbGetAppBySlug(slug);
      if (!row) return apiError({ code: "NOT_FOUND", status: 404 });
      if (row.owner_id !== user.id) return apiError({ code: "FORBIDDEN", status: 403 });

      const current = resolveAppConfig(row, { asOwner: true });
      if (!current || isDraftConfig(current)) {
        return apiError({ code: "APP_NOT_READY", status: 409 });
      }

      if (!code.includes(current.tagName)) {
        return apiError({
          code: "INVALID_CODE",
          message: t("Code must still register <$tag>.", { tag: current.tagName }, language),
        });
      }

      const config: AppConfig = { ...current, status: "ready", code };
      dbCommitAppVersion(row.id, config, { fromVersionId: row.latest_version_id });

      const updated = dbGetAppBySlug(slug)!;
      const detail: AppDetail = {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        description: updated.description,
        visibility: updated.visibility,
        ownerId: updated.owner_id,
        config: { ...config, title: updated.title },
        canEdit: true,
        isDraft: updated.is_draft === 1,
        iconId: updated.icon_id ?? null,
        category: updated.category ?? config.category ?? null,
        tagline: updated.tagline ?? config.tagline ?? null,
        nextPrompt: updated.next_prompt ?? null,
      };

      return apiSuccess({ data: { app: detail } });
    });
  },
};
