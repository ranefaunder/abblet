import type { BunRequest } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from "/i18n/languages";
import type { Language } from "/i18n/languages";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import { getAuthenticatedUser } from "/utils/auth.server";
import { canViewApp } from "/utils/app-access.server";
import { escapeHtmlAttribute, escapeHtmlTextContent } from "/utils/sanitize.server";
import { isDraftConfig, parseAppConfig } from "/types/app-config-types";
import { appOrigin, connectUrl, getPlatformOrigin, getRequestHost, parseAppSubdomain } from "/utils/app-host";
import { appRuntimeModulePath } from "/utils/app-url";
import { appIconMimeType, appIconPngSrc, appIconSrc } from "/utils/app-icon";

const ABBLET_SDK_PATH = join(import.meta.dir, "../sdk/abblet-sdk.js");
let abbletSdkCache: string | null = null;

function loadAbbletSdkSource(): string {
  if (process.env.NODE_ENV === "production" && abbletSdkCache != null) {
    return abbletSdkCache;
  }
  const source = readFileSync(ABBLET_SDK_PATH, "utf8");
  if (process.env.NODE_ENV === "production") abbletSdkCache = source;
  return source;
}

type LangAppRequest = BunRequest<"/:lang/app/:slug">;
type ShortAppRequest = BunRequest<"/:appId">;
type ShortModuleRequest = BunRequest<"/:appId/module.js">;

type AppModuleRequest =
  | BunRequest<"/:lang/app/:slug/module.js">
  | BunRequest<"/:lang/app/:slug/run.js">
  | ShortModuleRequest;

type AppRunRedirectRequest = BunRequest<"/:lang/app/:slug/run">;

type AppAccess =
  | {
      kind: "ready";
      lang: Language;
      slug: string;
      title: string;
      tagName: string;
      iconId: string | null;
      published: boolean;
    }
  | { kind: "building"; lang: Language; slug: string; title: string; iconId: string | null }
  | { kind: "error"; status: number };

const BUILDING_COPY: Record<Language, { building: string; buildingHint: string }> = {
  en: { building: "Applying your idea…", buildingHint: "AI is building your app." },
  fi: { building: "Toteutetaan ideaasi…", buildingHint: "Tekoäly rakentaa appiasi." },
  sv: { building: "Tillämpar din idé…", buildingHint: "AI bygger din app." },
  zh: { building: "Applying your idea…", buildingHint: "AI is building your app." },
  es: { building: "Aplicando tu idea…", buildingHint: "La IA está creando tu app." },
  ja: { building: "Applying your idea…", buildingHint: "AI is building your app." },
  de: { building: "Idee wird umgesetzt…", buildingHint: "KI erstellt deine App." },
  fr: { building: "Application de votre idée…", buildingHint: "L'IA construit votre app." },
  hi: { building: "Applying your idea…", buildingHint: "AI is building your app." },
  ko: { building: "Applying your idea…", buildingHint: "AI is building your app." },
  it: { building: "Applicazione dell'idea…", buildingHint: "L'IA sta costruendo l'app." },
  pt: { building: "A aplicar a sua ideia…", buildingHint: "A IA está a construir a app." },
  nl: { building: "Idee wordt toegepast…", buildingHint: "AI bouwt je app." },
};

function buildingCopy(lang: Language) {
  return BUILDING_COPY[lang] ?? BUILDING_COPY.en;
}

function resolveRequestLang(req: {
  params?: { lang?: string };
  cookies?: { get(name: string): string | undefined };
  headers: Headers;
}): Language {
  const paramLang = req.params?.lang;
  if (paramLang && paramLang in AVAILABLE_LANGUAGES) return paramLang as Language;

  const cookie = req.cookies?.get("appstudo-language");
  if (cookie && cookie in AVAILABLE_LANGUAGES) return cookie as Language;

  const header = req.headers.get("Accept-Language");
  if (header) {
    for (const part of header.split(",")) {
      const primary = (part.trim().split(";")[0] ?? "").trim().toLowerCase().split("-")[0] ?? "";
      if (primary && primary in AVAILABLE_LANGUAGES) return primary as Language;
    }
  }

  return DEFAULT_LANGUAGE;
}

function resolveAppAccess(
  lang: Language,
  slug: string,
  req: BunRequest,
  opts?: { allowDraftBySlug?: boolean },
): AppAccess {
  if (!slug) return { kind: "error", status: 404 };

  const row = dbGetAppBySlug(slug);
  if (!row) return { kind: "error", status: 404 };

  const user = getAuthenticatedUser(req);
  const config = parseAppConfig(row.config_json);
  const isOwner = user?.id === row.owner_id;
  const iconId = row.icon_id ?? null;
  const isDraft = !config || isDraftConfig(config);

  if (isDraft) {
    if (isOwner || opts?.allowDraftBySlug) {
      return { kind: "building", lang, slug, title: row.title, iconId };
    }
    return { kind: "error", status: 404 };
  }

  if (!canViewApp(row, user?.id ?? null)) return { kind: "error", status: 403 };

  return {
    kind: "ready",
    lang,
    slug,
    title: row.title,
    tagName: config.tagName,
    iconId,
    published: row.visibility === "public",
  };
}

function getReadyApp(lang: Language, slug: string, req: BunRequest) {
  if (!slug) return { error: 404 as const };

  const row = dbGetAppBySlug(slug);
  if (!row) return { error: 404 as const };

  const user = getAuthenticatedUser(req);
  if (!canViewApp(row, user?.id ?? null)) return { error: 403 as const };

  const config = parseAppConfig(row.config_json);
  if (!config || isDraftConfig(config)) return { error: 404 as const };

  return { lang, slug, config };
}

const PAGE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    background: #f2f2f7;
    color: #000;
  }
  .main {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
  .main > :first-child { display: block; flex: 1; min-height: 100%; }
  .state {
    flex: 1;
    display: grid;
    place-content: center;
    text-align: center;
    padding: 48px 24px;
    color: #6e6e73;
  }
  .state p { margin: 0; }
  .state .hint { margin-top: 8px; font-size: 14px; }
`;

/** Per-app favicon + home-screen icon links for the standalone app document. */
function iconHeadTags(iconId: string | null): string {
  const svgSrc = appIconSrc(iconId);
  if (!svgSrc) return "";
  const mime = appIconMimeType(iconId) ?? "image/svg+xml";
  const pngSrc = appIconPngSrc(iconId) ?? svgSrc;
  return [
    `<link rel="icon" type="${escapeHtmlAttribute(mime)}" href="${escapeHtmlAttribute(svgSrc)}" />`,
    `<link rel="apple-touch-icon" href="${escapeHtmlAttribute(pngSrc)}" />`,
  ].join("\n    ");
}

function renderAppPage(access: AppAccess): Response {
  if (access.kind === "error") {
    return new Response("Not Found", { status: access.status });
  }

  if (access.kind === "building") {
    const copy = buildingCopy(access.lang);
    const html = `<!doctype html>
<html lang="${escapeHtmlAttribute(access.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtmlTextContent(access.title)}</title>
    ${iconHeadTags(access.iconId)}
    <style>${PAGE_STYLES}</style>
  </head>
  <body>
    <main class="main">
      <div class="state">
        <p>${escapeHtmlTextContent(copy.building)}</p>
        <p class="hint">${escapeHtmlTextContent(copy.buildingHint)}</p>
      </div>
    </main>
    <script>
      (async function () {
        try {
          const res = await fetch("/api/${escapeHtmlAttribute(access.lang)}/app/get", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ slug: ${JSON.stringify(access.slug)} }),
          });
          const data = await res.json();
          if (data.success) location.reload();
          else document.querySelector(".state").innerHTML = "<p>" + (data.error?.message || "Error") + "</p>";
        } catch (e) {
          document.querySelector(".state").innerHTML = "<p>Error</p>";
        }
      })();
    </script>
  </body>
</html>`;
    return htmlResponse(html);
  }

  const moduleUrl = appRuntimeModulePath();
  const platformOrigin = getPlatformOrigin();
  const connectHref = connectUrl(access.slug);
  const abbletConfig = {
    appSlug: access.slug,
    platformOrigin,
    connectHref,
    tagName: access.tagName,
    moduleUrl,
    lang: access.lang,
    published: access.published,
    title: access.title,
  };
  const sdkSource = loadAbbletSdkSource();

  const html = `<!doctype html>
<html lang="${escapeHtmlAttribute(access.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtmlTextContent(access.title)}</title>
    ${iconHeadTags(access.iconId)}
    <style>${PAGE_STYLES}</style>
  </head>
  <body>
    <main class="main" id="mount"></main>
    <script type="module">
      window.__ABBLET__ = ${JSON.stringify(abbletConfig)};
${sdkSource}
    </script>
  </body>
</html>`;

  return htmlResponse(html);
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function redirectToAppSubdomain(slug: string, search = ""): Response {
  return Response.redirect(`${appOrigin(slug)}/${search}`, 302);
}

/** App runtime on `{slug}.{APP_RUNTIME_HOST}/`. */
export function appSubdomainPage(req: BunRequest): Response {
  const slug = parseAppSubdomain(getRequestHost(req));
  if (!slug) return new Response("Not Found", { status: 404 });
  const lang = resolveRequestLang(req);
  return renderAppPage(resolveAppAccess(lang, slug, req, { allowDraftBySlug: true }));
}

/** App module on `{slug}.{APP_RUNTIME_HOST}/module.js`. */
export function appSubdomainModule(req: BunRequest): Response {
  const slug = parseAppSubdomain(getRequestHost(req));
  if (!slug) {
    return new Response("// Not found", { status: 404 });
  }
  const lang = resolveRequestLang(req);
  const result = getReadyApp(lang, slug, req);
  if ("error" in result) {
    return new Response("// Not found", { status: result.error });
  }
  return new Response(result.config.code, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** Platform path /452352 → redirect to app subdomain. */
export function shortAppPage(req: ShortAppRequest | BunRequest<"/:lang">): Response {
  const params = req.params as { appId?: string; lang?: string };
  const appId = (params.appId ?? params.lang)?.trim() ?? "";
  if (!isNumericAppSlug(appId)) {
    return new Response("Not Found", { status: 404 });
  }
  const url = new URL(req.url);
  return redirectToAppSubdomain(appId, url.search);
}

/** Platform path /452352/module.js → redirect to subdomain module. */
export function shortAppModule(req: ShortModuleRequest): Response {
  const appId = req.params.appId?.trim() ?? "";
  if (!isNumericAppSlug(appId)) {
    return new Response("// Not found", { status: 404 });
  }
  return Response.redirect(`${appOrigin(appId)}/module.js`, 302);
}

/** Legacy /:lang/app/:slug — redirects to app subdomain when slug is numeric. */
export function appPage(req: LangAppRequest): Response {
  const lang = req.params.lang as Language;
  const slug = req.params.slug?.trim() ?? "";
  if (!lang || !(lang in AVAILABLE_LANGUAGES) || !slug) {
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(req.url);
  if (isNumericAppSlug(slug)) {
    return redirectToAppSubdomain(slug, url.search);
  }

  return renderAppPage(resolveAppAccess(lang, slug, req));
}

export function appRunRedirect(req: AppRunRedirectRequest): Response {
  const lang = req.params.lang;
  const slug = req.params.slug?.trim();
  if (!lang || !(lang in AVAILABLE_LANGUAGES) || !slug) {
    return new Response("Not Found", { status: 404 });
  }
  const url = new URL(req.url);
  if (isNumericAppSlug(slug)) {
    return redirectToAppSubdomain(slug, url.search);
  }
  return Response.redirect(`${url.origin}/${lang}/app/${slug}${url.search}`, 302);
}

export function appModule(req: AppModuleRequest): Response {
  const params = req.params as { lang?: string; slug?: string; appId?: string };
  const slug = (params.slug ?? params.appId)?.trim() ?? "";
  const lang = resolveRequestLang(req);

  if (params.appId && !isNumericAppSlug(params.appId)) {
    return new Response("// Not found", { status: 404 });
  }

  if (params.lang && !(params.lang in AVAILABLE_LANGUAGES)) {
    return new Response("// Not found", { status: 404 });
  }

  if (isNumericAppSlug(slug)) {
    return Response.redirect(`${appOrigin(slug)}/module.js`, 302);
  }

  const result = getReadyApp(lang, slug, req);
  if ("error" in result) {
    return new Response("// Not found", { status: result.error });
  }

  return new Response(result.config.code, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
