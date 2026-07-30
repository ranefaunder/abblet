import type { BunRequest } from "bun";
import { getAuthenticatedUser } from "/utils/auth.server";
import { canViewApp } from "/utils/app-access.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug, dbUpdateApp } from "/server/database/queries/apps";
import { dbCommitAppVersion, resolveAppConfig } from "/server/database/queries/app-versions";
import { generateAppConfig } from "/utils/ai-apps.server";
import { apiErrorFromAi } from "/utils/ai-api.server";
import { buildAppDetail } from "/utils/app-detail.server";
import { isDraftConfig } from "/types/app-config-types";
import type { Language } from "/types/i18n-types";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";

export default {
  async GET(req: BunRequest) {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim();
    if (!slug) return apiError({ code: "SLUG_REQUIRED" });

    const user = getAuthenticatedUser(req);
    const row = dbGetAppBySlug(slug);
    if (!row) return apiError({ code: "NOT_FOUND", status: 404 });

    if (!canViewApp(row, user?.id ?? null)) {
      return apiError({ code: "FORBIDDEN", status: 403 });
    }

    const detail = buildAppDetail(row, user?.id ?? null);
    if (!detail) return apiError({ code: "FORBIDDEN", status: 403 });

    return apiSuccess({ data: { app: detail } });
  },

  async POST(req: BunRequest) {
    const user = getAuthenticatedUser(req);
    if (!user) return apiError({ code: "UNAUTHORIZED", status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError({ code: "INVALID_JSON" });
    }

    const slug = typeof (body as { slug?: string }).slug === "string" ? (body as { slug: string }).slug.trim() : "";
    if (!slug) return apiError({ code: "SLUG_REQUIRED" });

    const row = dbGetAppBySlug(slug);
    if (!row) return apiError({ code: "NOT_FOUND", status: 404 });
    if (row.owner_id !== user.id) return apiError({ code: "FORBIDDEN", status: 403 });

    const existing = resolveAppConfig(row, { asOwner: true });
    if (!isDraftConfig(existing)) {
      const detail = buildAppDetail(row, user.id, existing);
      return apiSuccess({ data: { app: detail } });
    }

    const language = (getLang(req.url) ?? "en") as Language;
    const prompt = existing?.prompt ?? row.description;
    let generated;
    try {
      generated = await generateAppConfig(prompt, language);
    } catch (err) {
      const aiError = apiErrorFromAi(err, language);
      if (aiError) return aiError;
      throw err;
    }
    if (!generated) {
      return apiError({
        code: "GENERATION_FAILED",
        message: t("Could not create app. Try again.", language),
        status: 500,
      });
    }
    const config = generated.config;

    dbCommitAppVersion(row.id, config, { fromVersionId: row.latest_version_id });
    dbUpdateApp(row.id, {
      title: config.title,
      description: config.description,
      category: config.category ?? null,
      tagline: config.tagline ?? null,
      isDraft: false,
    });

    const updated = dbGetAppBySlug(slug)!;
    const detail = buildAppDetail(updated, user.id, { ...config, title: updated.title });
    return apiSuccess({ data: { app: detail } });
  },
};
