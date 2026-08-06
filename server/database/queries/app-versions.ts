import { db } from "/server/database/db";
import type { AppConfig } from "/types/app-config-types";
import {
  appConfigToVersionFields,
  permissionsJson,
  versionRowToAppConfig,
  type AppVersionRow,
} from "/utils/app-config.server";

export type { AppVersionRow };

type AppPointerRow = {
  id: string;
  title: string;
  latest_version_id: string | null;
  published_version_id: string | null;
  owner_id: string;
};

export const dbGetAppVersion = (id: string): AppVersionRow | null =>
  db.query<AppVersionRow, [string]>("SELECT * FROM app_versions WHERE id = ?").get(id) ?? null;

export const dbListAppVersions = (appId: string): AppVersionRow[] =>
  db
    .query<AppVersionRow, [string]>(
      `SELECT * FROM app_versions WHERE app_id = ? ORDER BY version_number DESC`,
    )
    .all(appId);

export const dbNextVersionNumber = (appId: string): number => {
  const row = db
    .query<{ n: number | null }, [string]>(
      "SELECT MAX(version_number) as n FROM app_versions WHERE app_id = ?",
    )
    .get(appId);
  return (row?.n ?? 0) + 1;
};

export function dbInsertAppVersion(data: {
  id: string;
  appId: string;
  versionNumber: number;
  fields: ReturnType<typeof appConfigToVersionFields>;
  /** Short History line describing what changed. */
  summary?: string;
  createdFromVersionId?: string | null;
  createdAt?: string;
}): void {
  const now = data.createdAt ?? new Date().toISOString();
  db.query(
    `
    INSERT INTO app_versions (
      id, app_id, version_number, status, prompt, description, tagline, category,
      tag_name, code, required_permissions, created_from_version_id, created_at, summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    data.id,
    data.appId,
    data.versionNumber,
    data.fields.status,
    data.fields.prompt,
    data.fields.description,
    data.fields.tagline,
    data.fields.category,
    data.fields.tagName,
    data.fields.code,
    permissionsJson(data.fields),
    data.createdFromVersionId ?? null,
    now,
    (data.summary ?? "").trim(),
  );
}

export const dbSetLatestVersion = (appId: string, versionId: string): void => {
  const now = new Date().toISOString();
  db.query(`UPDATE apps SET latest_version_id = ?, updated_at = ? WHERE id = ?`).run(
    versionId,
    now,
    appId,
  );
};

export const dbSetPublishedVersion = (appId: string, versionId: string | null): void => {
  const now = new Date().toISOString();
  db.query(`UPDATE apps SET published_version_id = ?, updated_at = ? WHERE id = ?`).run(
    versionId,
    now,
    appId,
  );
};

/**
 * Insert immutable version, point latest at it, denormalize listing meta (not title/icon).
 * Title/icon stay on apps and are updated separately.
 */
export function dbCommitAppVersion(
  appId: string,
  config: AppConfig,
  opts?: {
    fromVersionId?: string | null;
    /** Also sync description/tagline/category onto apps (not title). Default true. */
    syncListingMeta?: boolean;
    /** Short History line for this version. */
    summary?: string;
  },
): AppVersionRow {
  const versionId = crypto.randomUUID();
  const versionNumber = dbNextVersionNumber(appId);
  const fields = appConfigToVersionFields(config);
  const fromId = opts?.fromVersionId ?? null;
  const permsJson = permissionsJson(fields);

  const run = db.transaction(() => {
    dbInsertAppVersion({
      id: versionId,
      appId,
      versionNumber,
      fields,
      summary: opts?.summary,
      createdFromVersionId: fromId,
    });
    dbSetLatestVersion(appId, versionId);

    if (opts?.syncListingMeta !== false) {
      const now = new Date().toISOString();
      db.query(
        `
        UPDATE apps
        SET description = ?,
            tagline = ?,
            category = ?,
            is_draft = ?,
            required_permissions = ?,
            updated_at = ?
        WHERE id = ?
      `,
      ).run(
        fields.description,
        fields.tagline,
        fields.category,
        fields.status === "ready" && fields.code ? 0 : 1,
        permsJson,
        now,
        appId,
      );
    } else {
      const now = new Date().toISOString();
      db.query(
        `UPDATE apps SET required_permissions = ?, updated_at = ? WHERE id = ?`,
      ).run(permsJson, now, appId);
    }
  });
  run();

  return dbGetAppVersion(versionId)!;
}

/** Owner → latest; everyone else → published (null if unpublished). */
export function resolveAppConfig(
  app: AppPointerRow,
  opts: { asOwner: boolean },
): AppConfig | null {
  const versionId = opts.asOwner ? app.latest_version_id : app.published_version_id;
  if (!versionId) return null;
  const row = dbGetAppVersion(versionId);
  if (!row) return null;
  return versionRowToAppConfig(row, app.title);
}

/** Prefer published for remix source; fall back to latest only for owner. */
export function resolveSourceConfigForRemix(
  app: AppPointerRow,
  requesterId: string,
): AppConfig | null {
  if (app.published_version_id) {
    const row = dbGetAppVersion(app.published_version_id);
    if (row) return versionRowToAppConfig(row, app.title);
  }
  if (app.owner_id === requesterId && app.latest_version_id) {
    const row = dbGetAppVersion(app.latest_version_id);
    if (row) return versionRowToAppConfig(row, app.title);
  }
  return null;
}

export function resolveVersionForRuntime(
  app: AppPointerRow,
  userId: string | null,
): AppVersionRow | null {
  const asOwner = userId != null && userId === app.owner_id;
  const versionId = asOwner ? app.latest_version_id : app.published_version_id;
  if (!versionId) return null;
  return dbGetAppVersion(versionId);
}
