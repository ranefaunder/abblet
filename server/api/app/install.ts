import type { BunRequest } from "bun";
import { withAuthOrGuest } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import {
  dbGetAppBySlug,
  dbInstallApp,
  dbIsAppInstalled,
} from "/server/database/queries/apps";
import { isDraftConfig, parseAppConfig } from "/types/app-config-types";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/types/i18n-types";

export default {
  async POST(req: BunRequest) {
    return withAuthOrGuest(req, async (user) => {
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
      if (!row || row.visibility !== "public" || row.is_draft === 1) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      const config = parseAppConfig(row.config_json);
      if (!config || isDraftConfig(config)) {
        return apiError({
          code: "NOT_READY",
          message: t("App not found", language),
          status: 404,
        });
      }

      if (!dbIsAppInstalled(user.id, row.id)) {
        dbInstallApp(user.id, row.id);
      }

      return apiSuccess({
        data: {
          slug,
          installed: true,
          owned: row.owner_id === user.id,
          user: {
            id: user.id,
            email: user.email,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            nickname: user.nickname ?? null,
            marketingOptIn: user.marketingOptIn === true,
            isGuest: user.isGuest === true,
          },
        },
      });
    });
  },
};
