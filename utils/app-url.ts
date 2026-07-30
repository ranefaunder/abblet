import { appOrigin, connectUrl as platformConnectUrl } from "/utils/app-host";

export function appPageUrl(_lang: string, slug: string): string {
  return `${appOrigin(slug)}/`;
}

/** App subdomain install UI (PWA Add to Home Screen). */
export function appInstallUrl(_lang: string, slug: string): string {
  return `${appOrigin(slug)}/install`;
}

export function appModuleUrl(_lang: string, slug: string): string {
  return `${appOrigin(slug)}/module.js`;
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
