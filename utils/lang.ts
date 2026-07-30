import type { Language } from "/types/i18n-types";
import { AVAILABLE_LANGUAGES } from "/i18n/languages";

const DUMMY_ORIGIN = "http://127.0.0.1";

/**
 * Kieli URLista (merkkijono): polku `/:lang/...` tai `/api/:lang/...`.
 * Palvelin: `getLang(req.url)`. `new URL(raw, base)` toimii myös suhteellisella polulla.
 * Ei riippuvuuksia i18n.ts / storeihin — välttää syklisiä importteja.
 */
export function getLang(url: string): Language | null {
  const u = new URL(url, DUMMY_ORIGIN);

  const segments = u.pathname.split("/").filter(Boolean);
  if (segments[0] != null && segments[0] in AVAILABLE_LANGUAGES) {
    return segments[0] as Language;
  }
  if (segments[0] === "api" && segments[1] != null && segments[1] in AVAILABLE_LANGUAGES) {
    return segments[1] as Language;
  }
  return null;
}

/** Vaihtaa polun kielisegmentin (`/fi/store` → `/en/store`). */
export function pathWithLang(path: string, lang: Language): string {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const rest = pathname.replace(/^\/[^/]+/, "") || "/";
  return rest === "/" ? `/${lang}/` : `/${lang}${rest}`;
}
