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

function loadRmixSdkSource(): string {
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

function pwaHeadTags(): string {
  return [
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<meta name="mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="theme-color" content="#f2f2f7" />`,
  ].join("\n    ");
}

const INSTALL_COPY: Record<
  Language,
  {
    back: string;
    install: string;
    installing: string;
    installed: string;
    ready: string;
    offlineReady?: string;
    preparingOffline?: string;
    manualTitle: string;
    iosSteps: string;
    androidSteps: string;
    desktopSteps: string;
    openApp: string;
  }
> = {
  en: {
    back: "Back",
    install: "Install",
    installing: "Installing…",
    installed: "Installed",
    ready: "Add this app to your home screen.",
    offlineReady: "Ready for offline use.",
    preparingOffline: "Preparing offline…",
    manualTitle: "How to install",
    iosSteps:
      "Tap Share, then Add to Home Screen. Confirm Add.",
    androidSteps: "Open the browser menu (⋮) and tap Install app or Add to Home screen.",
    desktopSteps: "Use the install icon in the address bar, or the browser menu → Install app.",
    openApp: "Open app",
  },
  fi: {
    back: "Takaisin",
    install: "Asenna",
    installing: "Asennetaan…",
    installed: "Asennettu",
    ready: "Lisää tämä appi kotinäytölle.",
    offlineReady: "Valmis offline-käyttöön.",
    preparingOffline: "Valmistellaan offlinea…",
    manualTitle: "Näin asennat",
    iosSteps: "Napauta Jaa, sitten Lisää Kotinäyttöön. Vahvista Lisää.",
    androidSteps: "Avaa selaimen valikko (⋮) ja valitse Asenna sovellus tai Lisää aloitusnäytölle.",
    desktopSteps: "Käytä asennuskuvaketta osoitekentässä tai selaimen valikkoa → Asenna sovellus.",
    openApp: "Avaa appi",
  },
  sv: {
    back: "Tillbaka",
    install: "Installera",
    installing: "Installerar…",
    installed: "Installerad",
    ready: "Lägg till appen på hemskärmen.",
    manualTitle: "Så här installerar du",
    iosSteps: "Tryck på Dela, sedan Lägg till på hemskärmen.",
    androidSteps: "Öppna menyn (⋮) och välj Installera app.",
    desktopSteps: "Använd installationsikonen i adressfältet eller menyn → Installera app.",
    openApp: "Öppna app",
  },
  zh: {
    back: "Back",
    install: "Install",
    installing: "Installing…",
    installed: "Installed",
    ready: "Add this app to your home screen.",
    manualTitle: "How to install",
    iosSteps: "Tap Share, then Add to Home Screen.",
    androidSteps: "Open the browser menu and tap Install app.",
    desktopSteps: "Use the install icon in the address bar.",
    openApp: "Open app",
  },
  es: {
    back: "Atrás",
    install: "Instalar",
    installing: "Instalando…",
    installed: "Instalada",
    ready: "Añade esta app a tu pantalla de inicio.",
    manualTitle: "Cómo instalar",
    iosSteps: "Toca Compartir y luego Añadir a pantalla de inicio.",
    androidSteps: "Abre el menú del navegador e Instalar app.",
    desktopSteps: "Usa el icono de instalación en la barra de direcciones.",
    openApp: "Abrir app",
  },
  ja: {
    back: "Back",
    install: "Install",
    installing: "Installing…",
    installed: "Installed",
    ready: "Add this app to your home screen.",
    manualTitle: "How to install",
    iosSteps: "Tap Share, then Add to Home Screen.",
    androidSteps: "Open the browser menu and tap Install app.",
    desktopSteps: "Use the install icon in the address bar.",
    openApp: "Open app",
  },
  de: {
    back: "Zurück",
    install: "Installieren",
    installing: "Wird installiert…",
    installed: "Installiert",
    ready: "App zum Startbildschirm hinzufügen.",
    manualTitle: "So installierst du",
    iosSteps: "Tippe auf Teilen, dann Zum Home-Bildschirm.",
    androidSteps: "Öffne das Menü (⋮) und wähle App installieren.",
    desktopSteps: "Nutze das Installationssymbol in der Adressleiste.",
    openApp: "App öffnen",
  },
  fr: {
    back: "Retour",
    install: "Installer",
    installing: "Installation…",
    installed: "Installée",
    ready: "Ajoutez cette app à l’écran d’accueil.",
    manualTitle: "Comment installer",
    iosSteps: "Touchez Partager, puis Sur l’écran d’accueil.",
    androidSteps: "Ouvrez le menu (⋮) puis Installer l’application.",
    desktopSteps: "Utilisez l’icône d’installation dans la barre d’adresse.",
    openApp: "Ouvrir l’app",
  },
  hi: {
    back: "Back",
    install: "Install",
    installing: "Installing…",
    installed: "Installed",
    ready: "Add this app to your home screen.",
    manualTitle: "How to install",
    iosSteps: "Tap Share, then Add to Home Screen.",
    androidSteps: "Open the browser menu and tap Install app.",
    desktopSteps: "Use the install icon in the address bar.",
    openApp: "Open app",
  },
  ko: {
    back: "Back",
    install: "Install",
    installing: "Installing…",
    installed: "Installed",
    ready: "Add this app to your home screen.",
    manualTitle: "How to install",
    iosSteps: "Tap Share, then Add to Home Screen.",
    androidSteps: "Open the browser menu and tap Install app.",
    desktopSteps: "Use the install icon in the address bar.",
    openApp: "Open app",
  },
  it: {
    back: "Indietro",
    install: "Installa",
    installing: "Installazione…",
    installed: "Installata",
    ready: "Aggiungi questa app alla schermata Home.",
    manualTitle: "Come installare",
    iosSteps: "Tocca Condividi, poi Aggiungi a Home.",
    androidSteps: "Apri il menu (⋮) e Installa app.",
    desktopSteps: "Usa l’icona di installazione nella barra degli indirizzi.",
    openApp: "Apri app",
  },
  pt: {
    back: "Voltar",
    install: "Instalar",
    installing: "A instalar…",
    installed: "Instalada",
    ready: "Adicione esta app ao ecrã inicial.",
    manualTitle: "Como instalar",
    iosSteps: "Toque em Partilhar e depois Adicionar ao Ecrã Principal.",
    androidSteps: "Abra o menu (⋮) e Instalar aplicação.",
    desktopSteps: "Use o ícone de instalação na barra de endereço.",
    openApp: "Abrir app",
  },
  nl: {
    back: "Terug",
    install: "Installeren",
    installing: "Bezig met installeren…",
    installed: "Geïnstalleerd",
    ready: "Voeg deze app toe aan je beginscherm.",
    manualTitle: "Zo installeer je",
    iosSteps: "Tik op Delen, daarna Zet op beginscherm.",
    androidSteps: "Open het menu (⋮) en kies App installeren.",
    desktopSteps: "Gebruik het installatiepictogram in de adresbalk.",
    openApp: "App openen",
  },
};

function installCopy(lang: Language) {
  const c = INSTALL_COPY[lang] ?? INSTALL_COPY.en;
  const en = INSTALL_COPY.en;
  return {
    ...c,
    offlineReady: c.offlineReady ?? en.offlineReady!,
    preparingOffline: c.preparingOffline ?? en.preparingOffline!,
  };
}

const INSTALL_PAGE_STYLES = `
  ${PAGE_STYLES}
  .install {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 2rem 1.5rem calc(2rem + env(safe-area-inset-bottom, 0px));
    text-align: center;
  }
  .install .icon {
    width: 96px;
    height: 96px;
    border-radius: 22%;
    overflow: hidden;
    background: #e5e5ea;
    display: grid;
    place-items: center;
    font-size: 2.5rem;
    font-weight: 600;
    color: #1c1c1e;
  }
  .install .icon img { width: 100%; height: 100%; object-fit: cover; }
  .install h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .install .lede {
    margin: 0;
    max-width: 22rem;
    color: #6e6e73;
    font-size: 1rem;
    line-height: 1.4;
  }
  .install .status {
    margin: 0;
    min-height: 1.25rem;
    color: #6e6e73;
    font-size: 0.9375rem;
  }
  .install .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }
  .install button, .install a.btn {
    appearance: none;
    border: 0;
    border-radius: 980px;
    padding: 0.75rem 1.25rem;
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
  .install button.primary, .install a.btn.primary {
    background: #007aff;
    color: #fff;
  }
  .install button.primary:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .install button.secondary, .install a.btn.secondary {
    background: #e5e5ea;
    color: #1c1c1e;
  }
  .install .manual {
    margin: 0;
    max-width: 22rem;
    padding: 1rem;
    border-radius: 12px;
    background: #fff;
    text-align: left;
    color: #1c1c1e;
    font-size: 0.9375rem;
    line-height: 1.45;
  }
  .install .manual h2 {
    margin: 0 0 0.5rem;
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6e6e73;
  }
  .install .manual[hidden] { display: none; }
`;

function renderInstallPage(access: Extract<AppAccess, { kind: "ready" }>): Response {
  const copy = installCopy(access.lang);
  const iconSrc = appIconPngSrc(access.iconId) ?? appIconSrc(access.iconId);
  const iconSvg = appIconSrc(access.iconId);
  const letter = (access.title.trim().charAt(0) || "?").toUpperCase();
  const platformOrigin = getPlatformOrigin();
  const backHref = `${platformOrigin}/${access.lang}/gallery/${encodeURIComponent(access.slug)}`;
  const precacheUrls = ["/", "/module.js", "/manifest.webmanifest"];
  if (iconSrc) precacheUrls.push(iconSrc);
  if (iconSvg && iconSvg !== iconSrc) precacheUrls.push(iconSvg);

  const html = `<!doctype html>
<html lang="${escapeHtmlAttribute(access.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtmlTextContent(access.title)}</title>
    ${iconHeadTags(access.iconId)}
    ${pwaHeadTags()}
    <style>${INSTALL_PAGE_STYLES}</style>
  </head>
  <body>
    <main class="install" data-lang="${escapeHtmlAttribute(access.lang)}">
      <span class="icon" aria-hidden="true">
        ${
          iconSrc
            ? `<img src="${escapeHtmlAttribute(iconSrc)}" alt="" width="96" height="96" />`
            : escapeHtmlTextContent(letter)
        }
      </span>
      <h1>${escapeHtmlTextContent(access.title)}</h1>
      <p class="lede" id="lede">${escapeHtmlTextContent(copy.ready)}</p>
      <p class="status" id="status" role="status"></p>
      <div class="actions">
        <a class="btn secondary" id="back" href="${escapeHtmlAttribute(backHref)}">${escapeHtmlTextContent(copy.back)}</a>
        <button type="button" class="primary" id="install">${escapeHtmlTextContent(copy.install)}</button>
      </div>
      <div class="manual" id="manual" hidden>
        <h2>${escapeHtmlTextContent(copy.manualTitle)}</h2>
        <p id="manual-body"></p>
      </div>
    </main>
    <script>
      (function () {
        var copy = ${JSON.stringify(copy)};
        var precacheUrls = ${JSON.stringify(precacheUrls)};
        var CACHE = "rmix-app-runtime-v3";
        var installBtn = document.getElementById("install");
        var statusEl = document.getElementById("status");
        var manual = document.getElementById("manual");
        var manualBody = document.getElementById("manual-body");
        var backBtn = document.getElementById("back");
        var deferredPrompt = null;
        var promptAvailable = false;
        var offlineReady = false;

        if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
          location.replace("/");
          return;
        }

        if (backBtn && history.length > 1) {
          backBtn.addEventListener("click", function (e) {
            e.preventDefault();
            history.back();
          });
        }

        function isIos() {
          return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        }
        function isAndroid() {
          return /Android/i.test(navigator.userAgent);
        }
        function manualText() {
          if (isIos()) return copy.iosSteps;
          if (isAndroid()) return copy.androidSteps;
          return copy.desktopSteps;
        }
        function showManual() {
          manual.hidden = false;
          manualBody.textContent = manualText();
        }

        async function precacheViaCacheApi(urls) {
          if (!("caches" in window)) return;
          var cache = await caches.open(CACHE);
          await Promise.all(urls.map(async function (url) {
            try {
              if (String(url).indexOf("mode=install") !== -1) return;
              var res = await fetch(url, { cache: "reload", credentials: "same-origin" });
              if (!res.ok) return;
              var path = new URL(url, location.origin).pathname;
              await cache.put(path === "/" ? "/" : url, res);
            } catch (e) {}
          }));
        }

        async function prepareOffline() {
          statusEl.textContent = copy.preparingOffline;
          try {
            if (navigator.storage && navigator.storage.persist) {
              await navigator.storage.persist().catch(function () {});
            }
            if ("serviceWorker" in navigator) {
              var reg = await navigator.serviceWorker.register("/static/app-runtime-sw.js", { scope: "/" });
              await navigator.serviceWorker.ready;
              var worker = reg.active || navigator.serviceWorker.controller;
              if (worker) worker.postMessage({ type: "PRECACHE", urls: precacheUrls });
            }
            await precacheViaCacheApi(precacheUrls);
            offlineReady = true;
            if (!statusEl.textContent || statusEl.textContent === copy.preparingOffline) {
              statusEl.textContent = copy.offlineReady;
            }
          } catch (e) {
            statusEl.textContent = "";
          }
        }

        window.addEventListener("beforeinstallprompt", function (e) {
          e.preventDefault();
          deferredPrompt = e;
          promptAvailable = true;
          manual.hidden = true;
          installBtn.disabled = false;
          if (offlineReady) statusEl.textContent = copy.offlineReady;
          else statusEl.textContent = "";
        });

        window.addEventListener("appinstalled", function () {
          statusEl.textContent = copy.installed;
          installBtn.disabled = true;
          void prepareOffline().then(function () {
            setTimeout(function () { location.href = "/"; }, 500);
          });
        });

        installBtn.addEventListener("click", async function () {
          if (deferredPrompt) {
            statusEl.textContent = copy.installing;
            installBtn.disabled = true;
            try {
              deferredPrompt.prompt();
              var choice = await deferredPrompt.userChoice;
              deferredPrompt = null;
              if (choice && choice.outcome === "accepted") {
                statusEl.textContent = copy.installing;
                await prepareOffline();
              } else {
                statusEl.textContent = offlineReady ? copy.offlineReady : "";
                installBtn.disabled = false;
                showManual();
              }
            } catch (err) {
              statusEl.textContent = offlineReady ? copy.offlineReady : "";
              installBtn.disabled = false;
              showManual();
            }
            return;
          }
          showManual();
          void prepareOffline();
        });

        void prepareOffline();

        setTimeout(function () {
          if (!promptAvailable) showManual();
        }, 2000);
      })();
    </script>
  </body>
</html>`;

  return htmlResponse(html);
}

function renderAppPage(
  access: AppAccess,
  opts?: { mode?: string | null },
): Response {
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

  if (opts?.mode === "install") {
    return renderInstallPage(access);
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
  const sdkSource = loadRmixSdkSource();
  const runtimeIcon = appIconPngSrc(access.iconId) ?? appIconSrc(access.iconId);
  const runtimeIconSvg = appIconSrc(access.iconId);
  const runtimePrecache = ["/", "/module.js", "/manifest.webmanifest"];
  if (runtimeIcon) runtimePrecache.push(runtimeIcon);
  if (runtimeIconSvg && runtimeIconSvg !== runtimeIcon) runtimePrecache.push(runtimeIconSvg);

  const html = `<!doctype html>
<html lang="${escapeHtmlAttribute(access.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtmlTextContent(access.title)}</title>
    ${iconHeadTags(access.iconId)}
    ${pwaHeadTags()}
    <style>${PAGE_STYLES}</style>
  </head>
  <body>
    <main class="main" id="mount"></main>
    <script>
      (function () {
        var urls = ${JSON.stringify(runtimePrecache)};
        var CACHE = "rmix-app-runtime-v3";
        async function warm() {
          try {
            if (navigator.storage && navigator.storage.persist) {
              await navigator.storage.persist().catch(function () {});
            }
            if ("serviceWorker" in navigator) {
              var reg = await navigator.serviceWorker.register("/static/app-runtime-sw.js", { scope: "/" });
              await navigator.serviceWorker.ready;
              var worker = reg.active || navigator.serviceWorker.controller;
              if (worker) worker.postMessage({ type: "PRECACHE", urls: urls });
            }
            if ("caches" in window) {
              var cache = await caches.open(CACHE);
              await Promise.all(urls.map(async function (url) {
                try {
                  var res = await fetch(url, { cache: "reload", credentials: "same-origin" });
                  if (!res.ok) return;
                  var path = new URL(url, location.origin).pathname;
                  await cache.put(path === "/" ? "/" : url, res);
                } catch (e) {}
              }));
            }
          } catch (e) {}
        }
        void warm();
      })();
    </script>
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
  const mode = new URL(req.url).searchParams.get("mode");
  return renderAppPage(resolveAppAccess(lang, slug, req, { allowDraftBySlug: true }), { mode });
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

  return renderAppPage(resolveAppAccess(lang, slug, req), {
    mode: url.searchParams.get("mode"),
  });
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
