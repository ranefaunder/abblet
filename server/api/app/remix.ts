import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import {
  dbCreateApp,
  dbGenerateAppSlug,
  dbGetAppBySlug,
  dbUpdateApp,
} from "/server/database/queries/apps";
import { generateAppIcon } from "/utils/ai-app-icons.server";
import { isDraftConfig, parseAppConfig, type AppDetail } from "/types/app-config-types";
import { getClientIP } from "/utils/request.server";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/types/i18n-types";

/**
 * Remix = clone a public app into the current user's library as an editable copy.
 * Generates a fresh launcher icon for the clone.
 */
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

      const source = dbGetAppBySlug(slug);
      if (!source || source.visibility !== "public" || source.is_draft === 1) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      const config = parseAppConfig(source.config_json);
      if (!config || isDraftConfig(config)) {
        return apiError({
          code: "NOT_READY",
          message: t("App not found", language),
          status: 404,
        });
      }

      // Give the clone a unique tagName so customElements.define won't clash if both
      // source and remix ever load in the same document.
      const suffix = Math.random().toString(36).slice(2, 6);
      const tagName = `${config.tagName}-${suffix}`.replace(/[^a-z0-9-]/g, "");
      let code = config.code;
      // Replace define("old-tag" …) and string literals of the old tag carefully.
      code = code.split(config.tagName).join(tagName);

      const remixedConfig = {
        ...config,
        tagName,
        code,
        status: "ready" as const,
      };

      const id = crypto.randomUUID();
      const newSlug = dbGenerateAppSlug();
      dbCreateApp({
        id,
        ownerId: user.id,
        title: remixedConfig.title,
        description: remixedConfig.description,
        slug: newSlug,
        configJson: JSON.stringify(remixedConfig),
        sourceAppId: source.id,
        isDraft: false,
        category: remixedConfig.category ?? source.category ?? null,
        tagline: remixedConfig.tagline ?? source.tagline ?? null,
      });

      const clientIP = getClientIP(req);
      const iconResult = await generateAppIcon({
        title: remixedConfig.title,
        description: remixedConfig.description,
        clientIP,
      });
      if (iconResult) {
        dbUpdateApp(id, { iconId: iconResult.iconId });
      }

      const row = dbGetAppBySlug(newSlug)!;
      const detail: AppDetail = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        visibility: row.visibility,
        ownerId: row.owner_id,
        config: remixedConfig,
        canEdit: true,
        isDraft: false,
        iconId: row.icon_id ?? null,
        category: row.category ?? remixedConfig.category ?? null,
        tagline: row.tagline ?? remixedConfig.tagline ?? null,
      };

      return apiSuccess({ data: { app: detail }, status: 201 });
    });
  },
};
