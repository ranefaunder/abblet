import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import {
  dbGetAppBySlug,
  dbInstallApp,
  dbIsAppInstalled,
  dbLogInstallEvent,
} from "/server/database/queries/apps";
import { isDraftConfig } from "/types/app-config-types";
import { resolveAppConfig } from "/server/database/queries/app-versions";
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
      if (!row || row.visibility !== "public" || row.is_draft === 1 || !row.published_version_id) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      const config = resolveAppConfig(row, { asOwner: false });
      if (!config || isDraftConfig(config)) {
        return apiError({
          code: "NOT_READY",
          message: t("App not found", language),
          status: 404,
        });
      }

      const wasInstalled = dbIsAppInstalled(user.id, row.id);
      if (!wasInstalled) {
        dbInstallApp(user.id, row.id);
      }
      dbLogInstallEvent(user.id, row.id);

      return apiSuccess({
        data: {
          slug,
          installed: true,
          owned: row.owner_id === user.id,
          installedAt: new Date().toISOString(),
        },
      });
    });
  },
};
