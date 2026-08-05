import { isIPv4, isIPv6 } from "node:net";
import type { Language } from "/types/i18n-types";

function getRegionFromLocale(locale: string): string | null {
  const parts = locale.split("-");
  for (let i = parts.length - 1; i >= 1; i--) {
    const region = (parts[i] ?? "").toUpperCase();
    if (/^[A-Z]{2}$/.test(region)) return region;
  }
  return null;
}

/**
 * Poistaa mahdollisen portin ja sulkumerkit. IPv6 zone (%eth0) poistetaan parsintaa varten.
 */
function parseForwardedAddress(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end !== -1) {
      return s.slice(1, end).split("%")[0]!;
    }
  }
  const noZone = s.split("%")[0]!;
  if (isIPv4(noZone)) return noZone;
  const lastColon = noZone.lastIndexOf(":");
  if (lastColon > 0 && noZone.includes(".")) {
    const after = noZone.slice(lastColon + 1);
    if (/^\d+$/.test(after)) {
      return noZone.slice(0, lastColon);
    }
  }
  return noZone;
}

/** Viimeinen (oikeanpuoleisin) osoite X-Forwarded-For -ketjusta — proxy-lisäämä hop. */
function lastForwardedClient(forwarded: string): string | null {
  const parts = forwarded.split(",");
  const last = parts[parts.length - 1];
  if (!last) return null;
  const ip = parseForwardedAddress(last);
  if (!ip || ip === "localhost" || ip === "unknown") return null;
  return ip;
}

function isValidPublicClientIp(ip: string): boolean {
  return isIPv4(ip) || isIPv6(ip);
}

function expandIPv6Hextets(ip: string): string[] | null {
  const s = ip.split("%")[0]!.toLowerCase();

  if (s.includes("::")) {
    const [left, right = ""] = s.split("::", 2);
    const leftParts = left ? left.split(":").filter(Boolean) : [];
    const rightParts = right.split(":").filter(Boolean);
    const missing = 8 - leftParts.length - rightParts.length;
    if (missing < 0) return null;
    const all = [...leftParts, ...Array(missing).fill("0"), ...rightParts];
    if (all.length !== 8) return null;
    return all.map((h) => h.padStart(4, "0"));
  }
  const parts = s.split(":").filter((p) => p.length > 0);
  if (parts.length !== 8) return null;
  return parts.map((h) => h.padStart(4, "0"));
}

/**
 * Anonymisoi osoite: IPv4 → viimeinen oktetti 0 (/24). IPv6 → /64 (jälkimmäiset 64 bittiä nolliksi, tulos `xxxx:xxxx:xxxx:xxxx::`).
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) käsitellään IPv4:nä.
 */
export function anonymizeClientIP(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith("fingerprint:")) return trimmed;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  if (mapped && isIPv4(mapped[1]!)) {
    const parts = mapped[1]!.split(".");
    // Muodostetaan IPv6-näköinen esitys, jotta tallennettu arvo ei näytä “täydeltä” IPv4-osoitteelta.
    // Silti anonymisoidaan vain /24 tarkkuudelle.
    return `::ffff:${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  if (isIPv4(trimmed)) {
    const parts = trimmed.split(".");
    if (parts.length === 4) return `::ffff:${parts[0]}.${parts[1]}.${parts[2]}.0`;
    return trimmed;
  }

  if (isIPv6(trimmed)) {
    const hextets = expandIPv6Hextets(trimmed);
    if (hextets) {
      const prefix = hextets
        .slice(0, 4)
        .map((h) => parseInt(h, 16).toString(16))
        .join(":");
      return `${prefix}::`;
    }
    const tailV4 = /(^|:)([0-9]{1,3}(?:\.[0-9]{1,3}){3})$/;
    const tail = tailV4.exec(trimmed);
    if (tail && isIPv4(tail[2]!)) {
      const parts = tail[2]!.split(".");
      return `::ffff:${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }

  return trimmed;
}

/**
 * Lukee asiakkaan IP:n luotetusta edge-otsakkeesta.
 * Tuotanto / Cloudflare: `CF-Connecting-IP`.
 * X-Forwarded-For vain kun `TRUSTED_PROXY=1` — käytetään ketjun viimeistä hoppia
 * (ei asiakkaan asettamaa vasenta arvoa).
 * Palauttaa anonymisoidun arvon (ei täyttä osoitetta).
 */
export function getClientIP(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf && isValidPublicClientIp(parseForwardedAddress(cf))) {
    return anonymizeClientIP(parseForwardedAddress(cf));
  }

  const trustProxy = process.env.TRUSTED_PROXY === "1";
  if (trustProxy) {
    const xForwardedFor = req.headers.get("x-forwarded-for");
    if (xForwardedFor) {
      const last = lastForwardedClient(xForwardedFor);
      if (last) return anonymizeClientIP(last);
    }
  }

  const userAgent = req.headers.get("user-agent") || "";
  const acceptLang = req.headers.get("accept-language") || "";
  const fingerprint = `${userAgent}:${acceptLang}`;
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `fingerprint:${Math.abs(hash).toString(36)}`;
}

/**
 * Maakoodi pyynnöstä (reverse proxy / edge). Palauttaa ISO 3166-1 alpha-2 tai null.
 */
const COUNTRY_HEADER_KEYS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
] as const;

export function getRequestCountry(req: Request): string | null {
  for (const key of COUNTRY_HEADER_KEYS) {
    const raw = req.headers.get(key);
    if (raw == null || raw === "") continue;
    const t = raw.trim().toUpperCase();
    if (t === "" || t === "XX" || t === "T1") continue;
    if (/^[A-Z]{2}$/.test(t)) return t;
  }
  return null;
}

/** Accept-Languagesta maakoodi; suosii annettua sovelluksen kieltä (esim. de-DE ennen en-US). */
export function getRegionFromAcceptLanguageHeader(
  header: string | null,
  lang?: Language | null,
): string | null {
  if (!header) return null;
  const entries = header.split(",").map((s) => (s.trim().split(";")[0] ?? "").trim());

  if (lang) {
    for (const entry of entries) {
      const primary = (entry.split("-")[0] ?? "").toLowerCase();
      if (primary !== lang) continue;
      const region = getRegionFromLocale(entry);
      if (region) return region;
    }
  }

  for (const entry of entries) {
    const region = getRegionFromLocale(entry);
    if (region) return region;
  }
  return null;
}

/** Vierailijan alue: proxy-maa tai Accept-Language (sama idea kuin rekisteröinnissä). */
export function guessRegionFromRequest(req: Request): string | null {
  return getRequestCountry(req) ?? getRegionFromAcceptLanguageHeader(req.headers.get("accept-language"));
}
