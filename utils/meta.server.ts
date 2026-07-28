import type { BunRequest } from "bun";
import { resolveStaticRootFromUrl } from "/utils/static.server";
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from "/i18n/languages";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/types/i18n-types";
import { escapeHtmlAttribute, metaPlainForHtmlAttribute, metaPlainForTitleElement } from "/utils/sanitize.server";

function ogLocale(lang: Language): string {
  const map: Record<Language, string> = {
    fi: "fi_FI", en: "en_US", sv: "sv_SE", zh: "zh_CN", es: "es_ES",
    ja: "ja_JP", de: "de_DE", fr: "fr_FR", hi: "hi_IN", ko: "ko_KR",
    it: "it_IT", pt: "pt_BR", nl: "nl_NL",
  };
  return map[lang];
}

function isAboutPath(pathname: string): boolean {
  return /\/[^/]+\/about\/?$/.test(pathname);
}

function metaCopy(lang: Language, pathname: string): { title: string; description: string } {
  if (isAboutPath(pathname)) {
    return {
      title: metaPlainForTitleElement(t("Rmix — About", lang)),
      description: metaPlainForHtmlAttribute(
        t("Rmix is an app store where apps are not fixed products. Start with an app someone has already made and adapt it to your needs with a prompt, or turn your own idea into a new app from scratch. Instead of settling for software that almost fits, make software that does.", lang),
      ),
    };
  }
  return {
    title: metaPlainForTitleElement(t("Rmix — Remix any app, or make your own.", lang)),
    description: metaPlainForHtmlAttribute(
      t("Remix any app, or make your own.", lang),
    ),
  };
}

export async function getMeta(req: BunRequest): Promise<string> {
  const lang = getLang(req.url) ?? DEFAULT_LANGUAGE;
  const { origin, pathname } = new URL(req.url);
  const staticRoot = resolveStaticRootFromUrl(req.url);
  const { title, description } = metaCopy(lang, pathname);
  const ogImage = `${staticRoot}/favicons/android-chrome-512x512.png`;
  const themeColor = isAboutPath(pathname) ? "#0f1419" : "#1a1848";

  return /*html*/ `
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Rmix" />
    <meta name="format-detection" content="telephone=no, date=no, email=no, address=no" />
    <meta name="color-scheme" content="light" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${ogLocale(lang)}" />
    <meta property="og:url" content="${escapeHtmlAttribute(origin + pathname)}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${escapeHtmlAttribute(ogImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <link rel="icon" href="${escapeHtmlAttribute(`${staticRoot}/favicon-dark.svg`)}" type="image/svg+xml" />
    <link rel="icon" href="${escapeHtmlAttribute(`${staticRoot}/favicon-dark.svg`)}" type="image/svg+xml" media="(prefers-color-scheme: light)" />
    <link rel="icon" href="${escapeHtmlAttribute(`${staticRoot}/favicon-light.svg`)}" type="image/svg+xml" media="(prefers-color-scheme: dark)" />
    <link rel="apple-touch-icon" sizes="180x180" href="${escapeHtmlAttribute(`${staticRoot}/favicons/apple-touch-icon.png`)}" />
    <link rel="manifest" href="${escapeHtmlAttribute(`/${lang}/site.webmanifest`)}" />
    <meta name="theme-color" content="${themeColor}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${themeColor}" />
    ${Object.keys(AVAILABLE_LANGUAGES).map((code) => {
      const rest = pathname.replace(/^\/[^/]+/, "") || "/";
      return `<link rel="alternate" hreflang="${code}" href="${escapeHtmlAttribute(`${origin}/${code}${rest === "/" ? "/" : rest}`)}" />`;
    }).join("\n    ")}
    <link rel="alternate" hreflang="x-default" href="${escapeHtmlAttribute(`${origin}/${DEFAULT_LANGUAGE}/`)}" />
  `;
}

export type ClientMeta = Record<string, string>;

export async function getClientMeta(req: Pick<Request, "url">): Promise<ClientMeta> {
  const lang = getLang(req.url) ?? DEFAULT_LANGUAGE;
  const { pathname } = new URL(req.url);
  const { title, description } = metaCopy(lang, pathname);
  return {
    title,
    description,
    "og:title": title,
    "og:description": description,
  };
}
