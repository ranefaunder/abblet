import type { Language } from "/types/i18n-types";
import type { BunRequest } from "bun";
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from "/i18n/languages";
import {
  getRequestHost,
  parseAppSubdomain,
  redirectToPlatformFromRequest,
  shouldBounceRuntimeApexToPlatform,
  isAppOnlyHost,
} from "/utils/app-host";
import { appSubdomainPage } from "/server/routes/app-page";

const SUPPORTED = new Set<string>(Object.keys(AVAILABLE_LANGUAGES));

function getLangFromCookie(req: BunRequest): Language | null {
  const cookie = req.cookies?.get("appstudo-language");
  if (cookie && cookie in AVAILABLE_LANGUAGES) return cookie as Language;
  return null;
}

function getLangFromAcceptLanguage(header: string | null): Language | null {
  if (!header) return null;
  const entries = header.split(",").map((s) => (s.trim().split(";")[0] ?? "").trim().toLowerCase());
  for (const entry of entries) {
    const primary = entry.split("-")[0] ?? "";
    if (primary && SUPPORTED.has(primary)) return primary as Language;
  }
  return null;
}

export default async function (req: BunRequest): Promise<Response> {
  const host = getRequestHost(req);

  if (parseAppSubdomain(host)) {
    return appSubdomainPage(req);
  }

  // Dedicated runtime apex (e.g. abblet.app ≠ platform) or unknown runtime subdomain.
  if (shouldBounceRuntimeApexToPlatform(host) || isAppOnlyHost(host)) {
    return redirectToPlatformFromRequest(req);
  }

  const pathParts = new URL(req.url).pathname.split("/").filter(Boolean);
  const firstSegment = pathParts[0];
  const lang: Language =
    firstSegment && firstSegment in AVAILABLE_LANGUAGES
      ? (firstSegment as Language)
      : getLangFromCookie(req) ??
        getLangFromAcceptLanguage(req.headers.get("Accept-Language")) ??
        DEFAULT_LANGUAGE;
  return Response.redirect(`/${lang}/`, 302);
}
