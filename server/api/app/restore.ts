import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug } from "/server/database/queries/apps";
import {
  dbCommitAppVersion,
  dbGetAppVersion,
  resolveAppConfig,
} from "/server/database/queries/app-versions";
import { versionRowToAppConfig } from "/utils/app-config.server";
import { buildAppDetail } from "/utils/app-detail.server";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/types/i18n-types";

/**
 * Restore an old version by copying it to a new latest version (immutable).
 * Does not change app title or icon.
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
      const b = body as { slug?: string; versionId?: string };
      const slug = typeof b.slug === "string" ? b.slug.trim() : "";
      const versionId = typeof b.versionId === "string" ? b.versionId.trim() : "";
      if (!slug) return apiError({ code: "SLUG_REQUIRED" });
      if (!versionId) return apiError({ code: "VERSION_REQUIRED" });

      const row = dbGetAppBySlug(slug);
      if (!row) return apiError({ code: "NOT_FOUND", status: 404 });
      if (row.owner_id !== user.id) return apiError({ code: "FORBIDDEN", status: 403 });

      const source = dbGetAppVersion(versionId);
      if (!source || source.app_id !== row.id) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      if (source.id === row.latest_version_id) {
        const detail = buildAppDetail(row, user.id);
        return apiSuccess({ data: { app: detail } });
      }

      const config = versionRowToAppConfig(source, row.title);
      dbCommitAppVersion(row.id, config, {
        fromVersionId: source.id,
        syncListingMeta: true,
        summary: t("Restored version $n", { n: String(source.version_number) }, language),
      });

      const updated = dbGetAppBySlug(slug)!;
      const latest = resolveAppConfig(updated, { asOwner: true });
      if (!latest) {
        return apiError({
          code: "RESTORE_FAILED",
          message: t("Could not restore this version.", language),
          status: 500,
        });
      }

      return apiSuccess({
        data: { app: buildAppDetail(updated, user.id, latest) },
      });
    });
  },
};
