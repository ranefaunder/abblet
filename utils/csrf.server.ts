import { getPlatformOrigin } from "/utils/app-host";
import { apiError } from "/utils/api.server";

/**
 * Cookie-auth platform APIs (`/api/:lang/*` on remiix.app) must not accept
 * requests that browsers tag as coming from an app subdomain (`*.remiix.app`).
 * Those share the Domain-scoped session cookie (same-site CSRF).
 *
 * Allowed:
 * - `Origin` === PLATFORM_ORIGIN
 * - no `Origin` + `Sec-Fetch-Site: same-origin` | `none` (top-level / same-origin)
 *
 * Rejected:
 * - any other `Origin` (including `https://{slug}.remiix.app`)
 * - `Sec-Fetch-Site: same-site` | `cross-site` without a matching platform Origin
 */
export function platformCookieOriginForbidden(req: Request): Response | null {
  const origin = req.headers.get("Origin")?.trim() ?? "";
  const platform = getPlatformOrigin();

  if (origin) {
    if (origin === platform) return null;
    return apiError({ code: "FORBIDDEN_ORIGIN", status: 403 });
  }

  const site = (req.headers.get("Sec-Fetch-Site") ?? "").toLowerCase();
  if (site === "same-origin" || site === "none" || site === "") {
    // Empty Sec-Fetch-Site: curl / non-browser clients on the platform host.
    return null;
  }

  // same-site = subdomain→apex (the CSRF case); cross-site = foreign site
  return apiError({ code: "FORBIDDEN_ORIGIN", status: 403 });
}
