import {
  appOrigin,
  appRuntimeOrigin,
  connectUrl as platformConnectUrl,
  type AppRuntimeRow,
} from "/utils/app-host";

/** Runtime URL for an app row (UUID host if unpublished, slug host if published). */
export function appRuntimePageUrl(row: AppRuntimeRow): string {
  return `${appRuntimeOrigin(row)}/`;
}

/**
 * Prefer passing `app` with id/visibility/publishedVersionId when available so
 * unpublished apps open on the UUID capability host.
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
  if (app?.id) {
    const published =
      app.publishedVersionId ?? app.published_version_id ?? null;
    return appRuntimePageUrl({
      id: app.id,
      slug: app.slug ?? slug,
      visibility: app.visibility ?? "private",
      published_version_id: published,
    });
  }
  return `${appOrigin(slug)}/`;
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

export function connectUrl(slug: string): string {
  return platformConnectUrl(slug);
}

export function appEditUrl(lang: string, slug?: string): string {
  return slug ? `/${lang}/edit/${slug}` : `/${lang}/edit`;
}

export function storeUrl(lang: string): string {
  return `/${lang}/store`;
}

export function aboutUrl(lang: string): string {
  return `/${lang}/`;
}

export function storeAppUrl(lang: string, slug: string): string {
  return `/${lang}/store/${slug}`;
}

/**
 * SPA router scope. Site pages under /{lang}/ are handled client-side, plus the
 * app edit views (/{lang}/edit and /{lang}/edit/{slug}). The bare app run page
 * (/{lang}/app/{slug} or /{slug}) is excluded so it does a full page load to the
 * standalone server-rendered runtime.
 */
export function spaRouterScope(lang: string): RegExp {
  return new RegExp(`^/${lang}/(?!app/[^/]+$)`);
}
