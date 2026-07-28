import { db } from "/server/database/db";
import type { AppSummary, AppVisibility, StoreAppCard, StoreAppDetail } from "/types/app-types";
import { isAppCategory } from "/utils/app-categories";

type AppRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  slug: string;
  visibility: AppVisibility;
  source_app_id: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  is_draft: number;
  icon_id: string | null;
  category: string | null;
  tagline: string | null;
  owner_nickname?: string | null;
  remix_count?: number;
  install_count?: number;
  owned?: number;
  installed?: number;
  is_owner?: number;
};

function toSummary(row: AppRow, ownedFallback = true): AppSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    slug: row.slug,
    visibility: row.visibility,
    ownerId: row.owner_id,
    ownerNickname: row.owner_nickname ?? null,
    remixCount: row.remix_count ?? 0,
    updatedAt: row.updated_at,
    isDraft: row.is_draft === 1,
    iconId: row.icon_id ?? null,
    category: row.category ?? null,
    tagline: row.tagline ?? null,
    installCount: row.install_count ?? 0,
    owned: row.owned !== undefined ? row.owned === 1 : ownedFallback,
  };
}

function toStoreCard(row: AppRow): StoreAppCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    tagline: row.tagline ?? null,
    category: row.category ?? null,
    iconId: row.icon_id ?? null,
    ownerNickname: row.owner_nickname ?? null,
    installCount: row.install_count ?? 0,
    remixCount: row.remix_count ?? 0,
    installed: row.installed === 1,
    isOwner: row.is_owner === 1,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

export const dbGetAppById = (id: string): AppRow | null =>
  db.query<AppRow, [string]>("SELECT * FROM apps WHERE id = ?").get(id) ?? null;

export const dbGetAppBySlug = (slug: string): AppRow | null =>
  db.query<AppRow, [string]>("SELECT * FROM apps WHERE slug = ?").get(slug) ?? null;

const LIBRARY_SELECT = `
  SELECT a.*, u.nickname as owner_nickname,
    (SELECT COUNT(*) FROM apps r WHERE r.source_app_id = a.id) as remix_count,
    (SELECT COUNT(*) FROM app_installs i WHERE i.app_id = a.id) as install_count,
    CASE WHEN a.owner_id = ? THEN 1 ELSE 0 END as owned
  FROM apps a
  LEFT JOIN users u ON u.id = a.owner_id
`;

/** Home library = apps the user has installed (owned or not). */
export const dbListLibraryApps = (userId: string): AppSummary[] =>
  db
    .query<AppRow, [string, string]>(`
      ${LIBRARY_SELECT}
      INNER JOIN app_installs ai ON ai.app_id = a.id AND ai.user_id = ?
      ORDER BY ai.created_at DESC
    `)
    .all(userId, userId)
    .map((row) => toSummary(row, row.owned === 1));

/** @deprecated Prefer dbListLibraryApps — kept for any callers expecting library list. */
export const dbListUserApps = (ownerId: string): AppSummary[] => dbListLibraryApps(ownerId);

export const dbListPublicApps = (limit = 24): AppSummary[] =>
  db
    .query<AppRow, [number]>(`
      SELECT a.*, u.nickname as owner_nickname,
        (SELECT COUNT(*) FROM apps r WHERE r.source_app_id = a.id) as remix_count,
        (SELECT COUNT(*) FROM app_installs i WHERE i.app_id = a.id) as install_count,
        0 as owned
      FROM apps a
      LEFT JOIN users u ON u.id = a.owner_id
      WHERE a.visibility = 'public' AND a.is_draft = 0
      ORDER BY a.published_at DESC, a.updated_at DESC
      LIMIT ?
    `)
    .all(limit)
    .map((row) => toSummary(row, false));

export function dbListStoreApps(opts: {
  q?: string;
  category?: string | null;
  userId?: string | null;
  limit?: number;
}): StoreAppCard[] {
  const limit = Math.min(Math.max(opts.limit ?? 48, 1), 100);
  const q = opts.q?.trim() ?? "";
  const category = opts.category?.trim() || null;
  const userId = opts.userId ?? null;

  const where: string[] = ["a.visibility = 'public'", "a.is_draft = 0"];
  const params: Array<string | number | null> = [];

  if (category) {
    where.push("a.category = ?");
    params.push(category);
  }
  if (q) {
    where.push("(a.title LIKE ? OR a.description LIKE ? OR IFNULL(a.tagline, '') LIKE ?)");
    const like = `%${q.replace(/%/g, "")}%`;
    params.push(like, like, like);
  }

  // CASE expressions need userId twice each at the front of SELECT binds
  const allParams: Array<string | number | null> = [userId, userId, userId, userId, ...params, limit];

  return db
    .query<AppRow, Array<string | number | null>>(`
      SELECT a.*, u.nickname as owner_nickname,
        (SELECT COUNT(*) FROM apps r WHERE r.source_app_id = a.id) as remix_count,
        (SELECT COUNT(*) FROM app_installs i WHERE i.app_id = a.id) as install_count,
        CASE WHEN ? IS NOT NULL AND EXISTS (
          SELECT 1 FROM app_installs ai WHERE ai.app_id = a.id AND ai.user_id = ?
        ) THEN 1 ELSE 0 END as installed,
        CASE WHEN ? IS NOT NULL AND a.owner_id = ? THEN 1 ELSE 0 END as is_owner
      FROM apps a
      LEFT JOIN users u ON u.id = a.owner_id
      WHERE ${where.join(" AND ")}
      ORDER BY a.published_at DESC, a.updated_at DESC
      LIMIT ?
    `)
    .all(...allParams)
    .map(toStoreCard);
}

/** Distinct Store categories that currently have at least one public app. */
export function dbListStoreCategories(opts?: { q?: string }): string[] {
  const q = opts?.q?.trim() ?? "";
  const where: string[] = [
    "a.visibility = 'public'",
    "a.is_draft = 0",
    "a.category IS NOT NULL",
    "TRIM(a.category) != ''",
  ];
  const params: string[] = [];

  if (q) {
    where.push("(a.title LIKE ? OR a.description LIKE ? OR IFNULL(a.tagline, '') LIKE ?)");
    const like = `%${q.replace(/%/g, "")}%`;
    params.push(like, like, like);
  }

  const rows = db
    .query<{ category: string }, string[]>(`
      SELECT DISTINCT a.category as category
      FROM apps a
      WHERE ${where.join(" AND ")}
      ORDER BY a.category ASC
    `)
    .all(...params);

  return rows.map((r) => r.category).filter(isAppCategory);
}

export function dbGetStoreAppBySlug(slug: string, userId: string | null): StoreAppDetail | null {
  const row =
    db
      .query<AppRow, [string | null, string | null, string | null, string | null, string]>(`
        SELECT a.*, u.nickname as owner_nickname,
          (SELECT COUNT(*) FROM apps r WHERE r.source_app_id = a.id) as remix_count,
          (SELECT COUNT(*) FROM app_installs i WHERE i.app_id = a.id) as install_count,
          CASE WHEN ? IS NOT NULL AND EXISTS (
            SELECT 1 FROM app_installs ai WHERE ai.app_id = a.id AND ai.user_id = ?
          ) THEN 1 ELSE 0 END as installed,
          CASE WHEN ? IS NOT NULL AND a.owner_id = ? THEN 1 ELSE 0 END as is_owner
        FROM apps a
        LEFT JOIN users u ON u.id = a.owner_id
        WHERE a.slug = ? AND a.visibility = 'public' AND a.is_draft = 0
        LIMIT 1
      `)
      .get(userId, userId, userId, userId, slug) ?? null;

  if (!row) return null;
  return {
    ...toStoreCard(row),
    ownerId: row.owner_id,
  };
}

export const dbCreateApp = (data: {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  slug: string;
  configJson: string;
  sourceAppId?: string | null;
  isDraft?: boolean;
  category?: string | null;
  tagline?: string | null;
  iconId?: string | null;
  /** When true (default), add the app to the owner's home library. */
  installForOwner?: boolean;
}) => {
  const now = new Date().toISOString();
  db.query(`
      INSERT INTO apps (
        id, owner_id, title, description, slug, config_json, source_app_id,
        is_draft, category, tagline, icon_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      data.id,
      data.ownerId,
      data.title,
      data.description,
      data.slug,
      data.configJson,
      data.sourceAppId ?? null,
      data.isDraft === true ? 1 : 0,
      data.category ?? null,
      data.tagline ?? null,
      data.iconId ?? null,
      now,
      now,
    );

  if (data.installForOwner !== false) {
    dbInstallApp(data.ownerId, data.id);
    dbLogInstallEvent(data.ownerId, data.id);
  }
};

export const dbExistsAppSlug = (slug: string): boolean =>
  db.query<{ n: number }, [string]>("SELECT 1 as n FROM apps WHERE slug = ? LIMIT 1").get(slug) !== null;

/** Satunnainen 5+ numeroinen julkinen ID (slug), sama malli kuin Cuukbuuk-resepteillä. */
export function dbGenerateAppSlug(): string {
  const maxAttempts = 20;
  let length = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const slug = String(Math.floor(Math.random() * (max - min + 1)) + min);

    if (!dbExistsAppSlug(slug)) {
      return slug;
    }

    length++;
  }

  throw new Error(`Failed to generate unique app slug after ${maxAttempts} attempts`);
}

export const isNumericAppSlug = (slug: string): boolean => /^\d{5,}$/.test(slug);

export const dbUpdateApp = (
  id: string,
  data: {
    title?: string;
    description?: string;
    configJson?: string;
    isDraft?: boolean;
    iconId?: string | null;
    category?: string | null;
    tagline?: string | null;
  },
) => {
  const now = new Date().toISOString();
  const title = data.title;
  const description = data.description;
  const configJson = data.configJson;
  const isDraft = data.isDraft === undefined ? null : data.isDraft ? 1 : 0;
  const hasIcon = data.iconId !== undefined;
  const iconId = data.iconId ?? null;
  const hasCategory = data.category !== undefined;
  const category = data.category ?? null;
  const hasTagline = data.tagline !== undefined;
  const tagline = data.tagline ?? null;

  return db
    .query(`
      UPDATE apps
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          config_json = COALESCE(?, config_json),
          is_draft = COALESCE(?, is_draft),
          icon_id = CASE WHEN ? THEN ? ELSE icon_id END,
          category = CASE WHEN ? THEN ? ELSE category END,
          tagline = CASE WHEN ? THEN ? ELSE tagline END,
          updated_at = ?
      WHERE id = ?
    `)
    .run(
      title ?? null,
      description ?? null,
      configJson ?? null,
      isDraft,
      hasIcon ? 1 : 0,
      iconId,
      hasCategory ? 1 : 0,
      category,
      hasTagline ? 1 : 0,
      tagline,
      now,
      id,
    );
};

export const dbPublishApp = (id: string, ownerId: string): boolean => {
  const now = new Date().toISOString();
  const result = db
    .query(
      `
      UPDATE apps
      SET visibility = 'public',
          published_at = COALESCE(published_at, ?),
          updated_at = ?
      WHERE id = ? AND owner_id = ? AND is_draft = 0
    `,
    )
    .run(now, now, id, ownerId);
  return result.changes > 0;
};

export const dbUnpublishApp = (id: string, ownerId: string): boolean => {
  const now = new Date().toISOString();
  const result = db
    .query(
      `
      UPDATE apps
      SET visibility = 'private',
          published_at = NULL,
          updated_at = ?
      WHERE id = ? AND owner_id = ?
    `,
    )
    .run(now, id, ownerId);
  return result.changes > 0;
};

export const dbIsAppInstalled = (userId: string, appId: string): boolean =>
  db
    .query<{ n: number }, [string, string]>(
      "SELECT 1 as n FROM app_installs WHERE user_id = ? AND app_id = ? LIMIT 1",
    )
    .get(userId, appId) !== null;

export const dbInstallApp = (userId: string, appId: string): void => {
  const now = new Date().toISOString();
  db.query(
    `
    INSERT OR IGNORE INTO app_installs (user_id, app_id, created_at)
    VALUES (?, ?, ?)
  `,
  ).run(userId, appId, now);
};

/** Append-only install history for "Previously installed". */
export const dbLogInstallEvent = (
  userId: string,
  appId: string,
  installedAt = new Date().toISOString(),
): void => {
  db.query(
    `
    INSERT INTO app_install_events (id, user_id, app_id, installed_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run(crypto.randomUUID(), userId, appId, installedAt);
};

export type InstallHistoryRow = {
  slug: string;
  title: string;
  tagline: string | null;
  iconId: string | null;
  installedAt: string;
};

/** Latest install event per app for a user, newest first. */
export const dbListInstallHistory = (userId: string, limit = 40): InstallHistoryRow[] => {
  const rows = db
    .query<
      {
        slug: string;
        title: string;
        tagline: string | null;
        icon_id: string | null;
        installed_at: string;
      },
      [string, string, number]
    >(
      `
      SELECT a.slug, a.title, a.tagline, a.icon_id, e.installed_at
      FROM app_install_events e
      INNER JOIN apps a ON a.id = e.app_id
      INNER JOIN (
        SELECT app_id, MAX(installed_at) AS max_at
        FROM app_install_events
        WHERE user_id = ?
        GROUP BY app_id
      ) latest ON latest.app_id = e.app_id AND latest.max_at = e.installed_at
      WHERE e.user_id = ?
      ORDER BY e.installed_at DESC
      LIMIT ?
    `,
    )
    .all(userId, userId, limit);

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    tagline: row.tagline,
    iconId: row.icon_id,
    installedAt: row.installed_at,
  }));
};

export const dbUninstallApp = (userId: string, appId: string): boolean => {
  const result = db
    .query("DELETE FROM app_installs WHERE user_id = ? AND app_id = ?")
    .run(userId, appId);
  return result.changes > 0;
};

/** Delete an app owned by the given user. Cascades to messages/records/installs. */
export const dbDeleteApp = (id: string, ownerId: string): boolean => {
  const result = db.query("DELETE FROM apps WHERE id = ? AND owner_id = ?").run(id, ownerId);
  return result.changes > 0;
};
