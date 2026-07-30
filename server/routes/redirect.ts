import type { BunRequest } from "bun";
import { AVAILABLE_LANGUAGES } from "/i18n/languages";
import { isNumericAppSlug } from "/server/database/queries/apps";
import { shortAppPage } from "/server/routes/app-page";
import { getRequestHost, isAppOnlyHost, parseAppRuntimeLabel } from "/utils/app-host";

/**
 * Single-segment path:
 * - /452352 on platform → redirect to app subdomain
 * - /fi → /fi/ (language redirect)
 * - on app subdomain → runtime at /
 */
export default function redirectRoute(req: BunRequest<"/:lang">) {
  const host = getRequestHost(req);

  if (parseAppRuntimeLabel(host)) {
    // /anything on app host → canonical runtime
    return Response.redirect(`/${new URL(req.url).search}`, 302);
  }

  if (isAppOnlyHost(host)) {
    return new Response("Not Found", { status: 404 });
  }

  const segment = req.params.lang;

  if (segment && isNumericAppSlug(segment)) {
    return shortAppPage(req);
  }

  const url = new URL(req.url);
  if (segment && segment in AVAILABLE_LANGUAGES) {
    return Response.redirect(`${url.origin}/${segment}/${url.search}`, 302);
  }

  return new Response("Not Found", { status: 404 });
}
