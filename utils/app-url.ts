import {
  appOrigin,
  appRuntimeOrigin,
  permissionUrl as platformPermissionUrl,
  type AppRuntimeRow,
} from "/utils/app-host";
import { AVAILABLE_LANGUAGES } from "/i18n/languages";

/** Runtime URL for an app row (UUID host if unpublished, slug host if published). */
export function appRuntimePageUrl(row: AppRuntimeRow): string {
  return `${appRuntimeOrigin(row)}/`;
}

/**
 * Owner working-copy preview — always the UUID capability host (latest version),
 * even when a Store (slug) URL exists for the published snapshot.
 */
export function appOwnerPreviewUrl(app: { id: string }): string {
  return `${appOrigin(app.id)}/`;
}

/**
 * Prefer passing `app` with id + visibility (+ publishedVersionId) when available
 * so unpublished apps open on the UUID capability host.
 * Incomplete objects (e.g. Store cards with only `id`) must not default to private —
 * that incorrectly routes published Store apps to the UUID preview host.
 */
export function appPageUrl(
  _lang: string,
  slug: string,
  app?: {
    id?: string;
    slug?: string;
    visibility?: string;
    publishedVersionId?: string | null;
    published_version_id?: string | null;
  } | null,
): string {
  if (app?.id && app.visibility != null) {
    const published =
      app.publishedVersionId ?? app.published_version_id ?? null;
    return appRuntimePageUrl({
      id: app.id,
      slug: app.slug ?? slug,
      visibility: app.visibility,
      published_version_id: published,
    });
  }
  return `${appOrigin(app?.slug ?? slug)}/`;
}

/** App subdomain install UI (PWA Add to Home Screen). */
export function appInstallUrl(
  _lang: string,
  slug: string,
  app?: Parameters<typeof appPageUrl>[2],
): string {
  const base = appPageUrl(_lang, slug, app).replace(/\/$/, "");
  return `${base}/install`;
}

export function appModuleUrl(
  _lang: string,
  slug: string,
  app?: Parameters<typeof appPageUrl>[2],
): string {
  const base = appPageUrl(_lang, slug, app).replace(/\/$/, "");
  return `${base}/module.js`;
}

/** Same-origin module path for the app runtime document (subdomain). */
export function appRuntimeModulePath(): string {
  return "/module.js";
}

export function permissionUrl(slug: string): string {
  return platformPermissionUrl(slug);
}

/**
 * URL to open a runnable app on its runtime host.
 * Prefer `openFromStore` on Store detail pages (permission grant for AI apps via /permission).
 * Direct links / guest open use this; abblet-app.js `ensurePermissions` handles AI token.
 */
export function openAppUrl(
  lang: string,
  slug: string,
  opts?: {
    app?: Parameters<typeof appPageUrl>[2];
  },
): string {
  return appPageUrl(lang, slug, opts?.app);
}

/** Splash / marketing index. */
export function splashUrl(lang: string): string {
  return `/${lang}/`;
}

export function createUrl(lang: string, slug?: string): string {
  return slug ? `/${lang}/create/${slug}` : `/${lang}/create`;
}

export function appsUrl(lang: string): string {
  return `/${lang}/apps`;
}

export function appsAppUrl(lang: string, slug: string): string {
  return `/${lang}/apps/${slug}`;
}

export function gamesUrl(lang: string): string {
  return `/${lang}/games`;
}

export function gamesAppUrl(lang: string, slug: string): string {
  return `/${lang}/games/${slug}`;
}

/** Detail URL in the apps or games catalog. */
export function catalogAppUrl(
  lang: string,
  slug: string,
  catalog: "apps" | "games" = "apps",
): string {
  return catalog === "games" ? gamesAppUrl(lang, slug) : appsAppUrl(lang, slug);
}

export function meUrl(lang: string): string {
  return `/${lang}/me`;
}

export function aboutUrl(lang: string): string {
  return `/${lang}/about`;
}

/** @deprecated Use createUrl */
export function appEditUrl(lang: string, slug?: string): string {
  return createUrl(lang, slug);
}

/** @deprecated Use appsUrl */
export function storeUrl(lang: string): string {
  return appsUrl(lang);
}

/** @deprecated Use appsAppUrl */
export function storeAppUrl(lang: string, slug: string): string {
  return appsAppUrl(lang, slug);
}

/**
 * SPA router scope for all site languages. Excludes /{lang}/app/:slug so that
 * path does a full load to the standalone runtime (or legacy redirect).
 */
export function spaRouterScope(_lang?: string): RegExp {
  const langs = Object.keys(AVAILABLE_LANGUAGES).join("|");
  return new RegExp(`^/(?:${langs})/(?!app/[^/]+$)`);
}
