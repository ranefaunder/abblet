import type { BunRequest } from "bun";
import type { InitialConfig, SsrContext } from "/types/ssr-types";
import type { AuthenticatedUser } from "/types/user-types";
import type { Language } from "/types/i18n-types";
import type { AppDetail } from "/types/app-config-types";
import { getAuthenticatedUser } from "/utils/auth.server";
import { canViewApp } from "/utils/app-access.server";
import { getLang } from "/utils/lang";
import { resolveStaticRootFromUrl } from "/utils/static.server";
import { translations } from "/i18n/translations";
import { dbListLibraryApps, dbGetAppBySlug } from "/server/database/queries/apps";
import { resolveAppConfig } from "/server/database/queries/app-versions";

export function createSsrContext(req: BunRequest): SsrContext {
  const language = getLang(req.url) ?? "en";
  const initialUser = getAuthenticatedUser(req);
  return {
    language,
    initialConfig: getInitialConfig(req),
    initialUser,
    initialTranslations: getInitialTranslations(language),
    initialApps: getInitialApps(req, initialUser),
    initialApp: getInitialApp(req, initialUser),
  };
}

function getInitialConfig(req: BunRequest): InitialConfig {
  return { staticRoot: resolveStaticRootFromUrl(req.url) };
}

function getInitialApp(req: BunRequest, user: AuthenticatedUser | null): AppDetail | null {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  // /:lang/create/:slug (legacy: /:lang/edit/:slug)
  const slug =
    (parts[1] === "create" || parts[1] === "edit") && parts[2] ? parts[2] : null;
  if (!slug) return null;

  const row = dbGetAppBySlug(slug);
  if (!row) return null;

  if (!canViewApp(row, user?.id ?? null)) return null;

  const isOwner = user?.id === row.owner_id;
  const config = resolveAppConfig(row, { asOwner: isOwner });
  if (!config) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    ownerId: row.owner_id,
    config: { ...config, title: row.title },
    canEdit: isOwner,
    isDraft: row.is_draft === 1,
    iconId: row.icon_id ?? null,
    category: row.category ?? config.category ?? null,
    tagline: row.tagline ?? config.tagline ?? null,
    nextPrompt: row.next_prompt ?? null,
  };
}

function getInitialApps(req: BunRequest, initialUser: AuthenticatedUser | null) {
  if (!initialUser) return undefined;

  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const segment = parts[1];

  // Splash, me, and create need the app list.
  if (segment === undefined || segment === "create" || segment === "edit" || segment === "me") {
    return dbListLibraryApps(initialUser.id);
  }
  return undefined;
}

function getInitialTranslations(lang: Language): Record<string, string> {
  const result: Record<string, string> = {};
  const keys = Object.keys(translations) as (keyof typeof translations)[];
  for (const key of keys) {
    const val = translations[key];
    if (val && typeof val === "object" && "serverOnly" in val && (val as { serverOnly?: boolean }).serverOnly) continue;
    result[key] = lang === "en" ? key : (val?.[lang] ?? key);
  }
  return result;
}
