import type { BunRequest } from "bun";
import { AVAILABLE_LANGUAGES } from "/i18n/languages";

function redirectLangPath(
  req: BunRequest,
  lang: string,
  nextPath: string,
): Response {
  if (!(lang in AVAILABLE_LANGUAGES)) {
    return new Response("Not Found", { status: 404 });
  }
  const url = new URL(req.url);
  return Response.redirect(`${url.origin}/${lang}${nextPath}${url.search}`, 301);
}

/** /:lang/store → /:lang/apps */
export function storeToApps(req: BunRequest<"/:lang/store" | "/:lang/store/">): Response {
  return redirectLangPath(req, req.params.lang, "/apps");
}

/** /:lang/store/:slug → /:lang/apps/:slug */
export function storeSlugToApps(
  req: BunRequest<"/:lang/store/:slug">,
): Response {
  const slug = encodeURIComponent(req.params.slug);
  return redirectLangPath(req, req.params.lang, `/apps/${slug}`);
}

/** /:lang/edit → /:lang/create */
export function editToCreate(req: BunRequest<"/:lang/edit" | "/:lang/edit/">): Response {
  return redirectLangPath(req, req.params.lang, "/create");
}

/** /:lang/edit/:slug → /:lang/create/:slug */
export function editSlugToCreate(req: BunRequest<"/:lang/edit/:slug">): Response {
  const slug = encodeURIComponent(req.params.slug);
  return redirectLangPath(req, req.params.lang, `/create/${slug}`);
}

/** /:lang/account → /:lang/me */
export function accountToMe(req: BunRequest<"/:lang/account" | "/:lang/account/">): Response {
  return redirectLangPath(req, req.params.lang, "/me");
}

/** /:lang/connect/:appId → /:lang/permission/:appId */
export function connectToPermission(
  req: BunRequest<"/:lang/connect/:appId">,
): Response {
  const slug = encodeURIComponent(req.params.appId);
  return redirectLangPath(req, req.params.lang, `/permission/${slug}`);
}

/** /connect/:appId → /permission/:appId (preserve query) */
export function connectApexToPermission(
  req: BunRequest<"/connect/:appId">,
): Response {
  const url = new URL(req.url);
  const slug = encodeURIComponent(req.params.appId);
  return Response.redirect(`${url.origin}/permission/${slug}${url.search}`, 301);
}
