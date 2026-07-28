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
    installed: string;
    ready: string;
    offlineReady?: string;
    preparingOffline?: string;
    firefoxUnsupported?: string;
    manualTitle: string;
    /** Use {{share}} where the Share icon should appear. */
    iosSteps: string[];
    macSafariSteps?: string[];
    firefoxSteps?: string[];
    androidSteps: string[];
    genericSteps: string[];
    openApp: string;
  }
> = {
  en: {
    back: "Back",
    install: "Install",
    installed: "Installed",
    ready: "Install on your home screen — open anytime, even offline.",
    offlineReady: "Saved on this device. It opens even without a network.",
    preparingOffline: "Saving the app on this device…",
    firefoxUnsupported:
      "Firefox can’t install this app. Open it in the browser, or use Chrome or Safari to install.",
    manualTitle: "How to install",
    iosSteps: [
      "Tap {{share}} Share in Safari (bottom of the screen on iPhone).",
      "Scroll down and tap Add to Home Screen.",
      "Tap Add in the top right.",
    ],
    macSafariSteps: [
      "Click {{share}} Share in the Safari toolbar.",
      "Choose Add to Dock.",
      "Confirm if Safari asks.",
    ],
    firefoxSteps: [
      "Open the Firefox menu (☰).",
      "Choose Install, Add to Home screen, or Add to Dock.",
    ],
    androidSteps: [
      "Open the browser menu (⋮).",
      "Tap Install app or Add to Home screen.",
      "Confirm the install.",
    ],
    genericSteps: [
      "Open your browser menu.",
      "Look for Install app, Add to Home screen, or Add to Dock.",
      "Confirm the install.",
    ],
    openApp: "Open app",
  },
  fi: {
    back: "Takaisin",
    install: "Asenna",
    installed: "Asennettu",
    ready: "Asenna kotinäytölle — avaa milloin vain, myös ilman verkkoa.",
    offlineReady: "Tallennettu tälle laitteelle. Aukeaa myös ilman verkkoa.",
    preparingOffline: "Tallennetaan appi tälle laitteelle…",
    firefoxUnsupported:
      "Firefoxilla ei voi asentaa tätä appiä. Avaa se selaimessa, tai asenna Chromella tai Safarilla.",
    manualTitle: "Näin asennat",
    iosSteps: [
      "Napauta {{share}} Jaa Safarissa (iPhonessa näytön alareunassa).",
      "Vieritä alas ja napauta Lisää Kotinäyttöön.",
      "Napauta Lisää oikeasta yläkulmasta.",
    ],
    macSafariSteps: [
      "Klikkaa {{share}} Jaa Safari-työkalupalkissa.",
      "Valitse Lisää Dockiin.",
      "Vahvista, jos Safari kysyy.",
    ],
    firefoxSteps: [
      "Avaa Firefoxin valikko (☰).",
      "Valitse Asenna, Lisää aloitusnäytölle tai Lisää Dockiin.",
    ],
    androidSteps: [
      "Avaa selaimen valikko (⋮).",
      "Valitse Asenna sovellus tai Lisää aloitusnäytölle.",
      "Vahvista asennus.",
    ],
    genericSteps: [
      "Avaa selaimen valikko.",
      "Etsi Asenna sovellus, Lisää aloitusnäytölle tai Lisää Dockiin.",
      "Vahvista asennus.",
    ],
    openApp: "Avaa appi",
  },
  sv: {
    back: "Tillbaka",
    install: "Installera",
    installed: "Installerad",
    ready: "Installera appen på hemskärmen så att du kan öppna den när som helst.",
    manualTitle: "Så här installerar du",
    iosSteps: [
      "Tryck på {{share}} Dela i Safari.",
      "Välj Lägg till på hemskärmen.",
      "Bekräfta med Lägg till.",
    ],
    androidSteps: [
      "Öppna menyn (⋮).",
      "Välj Installera app eller Lägg till på hemskärmen.",
    ],
    genericSteps: [
      "Öppna webbläsarens meny.",
      "Leta efter Installera app eller Lägg till på hemskärmen.",
    ],
    openApp: "Öppna app",
  },
  zh: {
    back: "Back",
    install: "Install",
    installed: "Installed",
    ready: "Install this app on your home screen so you can open it anytime — like any other app.",
    manualTitle: "How to install",
    iosSteps: [
      "Tap {{share}} Share in Safari.",
      "Tap Add to Home Screen.",
      "Tap Add.",
    ],
    androidSteps: [
      "Open the browser menu.",
      "Tap Install app or Add to Home screen.",
    ],
    genericSteps: [
      "Open your browser menu.",
      "Look for Install app or Add to Home screen.",
    ],
    openApp: "Open app",
  },
  es: {
    back: "Atrás",
    install: "Instalar",
    installed: "Instalada",
    ready: "Instala esta app en tu pantalla de inicio para abrirla cuando quieras.",
    manualTitle: "Cómo instalar",
    iosSteps: [
      "Toca {{share}} Compartir en Safari.",
      "Elige Añadir a pantalla de inicio.",
      "Confirma con Añadir.",
    ],
    androidSteps: [
      "Abre el menú del navegador (⋮).",
      "Toca Instalar app o Añadir a pantalla de inicio.",
    ],
    genericSteps: [
      "Abre el menú del navegador.",
      "Busca Instalar app o Añadir a pantalla de inicio.",
    ],
    openApp: "Abrir app",
  },
  ja: {
    back: "Back",
    install: "Install",
    installed: "Installed",
    ready: "Install this app on your home screen so you can open it anytime — like any other app.",
    manualTitle: "How to install",
    iosSteps: [
      "Tap {{share}} Share in Safari.",
      "Tap Add to Home Screen.",
      "Tap Add.",
    ],
    androidSteps: [
      "Open the browser menu.",
      "Tap Install app or Add to Home screen.",
    ],
    genericSteps: [
      "Open your browser menu.",
      "Look for Install app or Add to Home screen.",
    ],
    openApp: "Open app",
  },
  de: {
    back: "Zurück",
    install: "Installieren",
    installed: "Installiert",
    ready: "Installiere die App auf dem Startbildschirm — öffne sie jederzeit wie jede andere App.",
    manualTitle: "So installierst du",
    iosSteps: [
      "Tippe auf {{share}} Teilen in Safari.",
      "Wähle Zum Home-Bildschirm.",
      "Bestätige mit Hinzufügen.",
    ],
    androidSteps: [
      "Öffne das Menü (⋮).",
      "Wähle App installieren oder Zum Startbildschirm.",
    ],
    genericSteps: [
      "Öffne das Browser-Menü.",
      "Suche nach App installieren oder Zum Startbildschirm.",
    ],
    openApp: "App öffnen",
  },
  fr: {
    back: "Retour",
    install: "Installer",
    installed: "Installée",
    ready: "Installez cette app sur l’écran d’accueil pour l’ouvrir à tout moment.",
    manualTitle: "Comment installer",
    iosSteps: [
      "Touchez {{share}} Partager dans Safari.",
      "Choisissez Sur l’écran d’accueil.",
      "Confirmez avec Ajouter.",
    ],
    androidSteps: [
      "Ouvrez le menu (⋮).",
      "Choisissez Installer l’application ou Écran d’accueil.",
    ],
    genericSteps: [
      "Ouvrez le menu du navigateur.",
      "Cherchez Installer l’application ou Écran d’accueil.",
    ],
    openApp: "Ouvrir l’app",
  },
  hi: {
    back: "Back",
    install: "Install",
    installed: "Installed",
    ready: "Install this app on your home screen so you can open it anytime — like any other app.",
    manualTitle: "How to install",
    iosSteps: [
      "Tap {{share}} Share in Safari.",
      "Tap Add to Home Screen.",
      "Tap Add.",
    ],
    androidSteps: [
      "Open the browser menu.",
      "Tap Install app or Add to Home screen.",
    ],
    genericSteps: [
      "Open your browser menu.",
      "Look for Install app or Add to Home screen.",
    ],
    openApp: "Open app",
  },
  ko: {
    back: "Back",
    install: "Install",
    installed: "Installed",
    ready: "Install this app on your home screen so you can open it anytime — like any other app.",
    manualTitle: "How to install",
    iosSteps: [
      "Tap {{share}} Share in Safari.",
      "Tap Add to Home Screen.",
      "Tap Add.",
    ],
    androidSteps: [
      "Open the browser menu.",
      "Tap Install app or Add to Home screen.",
    ],
    genericSteps: [
      "Open your browser menu.",
      "Look for Install app or Add to Home screen.",
    ],
    openApp: "Open app",
  },
  it: {
    back: "Indietro",
    install: "Installa",
    installed: "Installata",
    ready: "Installa questa app sulla Home per aprirla quando vuoi — come le altre app.",
    manualTitle: "Come installare",
    iosSteps: [
      "Tocca {{share}} Condividi in Safari.",
      "Scegli Aggiungi a Home.",
      "Conferma con Aggiungi.",
    ],
    androidSteps: [
      "Apri il menu (⋮).",
      "Scegli Installa app o Aggiungi a Home.",
    ],
    genericSteps: [
      "Apri il menu del browser.",
      "Cerca Installa app o Aggiungi a Home.",
    ],
    openApp: "Apri app",
  },
  pt: {
    back: "Voltar",
    install: "Instalar",
    installed: "Instalada",
    ready: "Instale esta app no ecrã inicial para a abrir quando quiser.",
    manualTitle: "Como instalar",
    iosSteps: [
      "Toque em {{share}} Partilhar no Safari.",
      "Escolha Adicionar ao Ecrã Principal.",
      "Confirme com Adicionar.",
    ],
    androidSteps: [
      "Abra o menu (⋮).",
      "Escolha Instalar aplicação ou Adicionar ao ecrã inicial.",
    ],
    genericSteps: [
      "Abra o menu do browser.",
      "Procure Instalar aplicação ou Adicionar ao ecrã inicial.",
    ],
    openApp: "Abrir app",
  },
  nl: {
    back: "Terug",
    install: "Installeren",
    installed: "Geïnstalleerd",
    ready: "Installeer deze app op je beginscherm zodat je hem altijd kunt openen.",
    manualTitle: "Zo installeer je",
    iosSteps: [
      "Tik op {{share}} Delen in Safari.",
      "Kies Zet op beginscherm.",
      "Bevestig met Zet erop.",
    ],
    androidSteps: [
      "Open het menu (⋮).",
      "Kies App installeren of Zet op beginscherm.",
    ],
    genericSteps: [
      "Open het browsermenu.",
      "Zoek App installeren of Zet op beginscherm.",
    ],
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
    firefoxUnsupported: c.firefoxUnsupported ?? en.firefoxUnsupported!,
    macSafariSteps: c.macSafariSteps ?? en.macSafariSteps!,
    firefoxSteps: c.firefoxSteps ?? en.firefoxSteps!,
    genericSteps: c.genericSteps ?? en.genericSteps,
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
    width: 100%;
    padding: 1.1rem 1.15rem;
    border-radius: 14px;
    background: #fff;
    text-align: left;
    color: #1c1c1e;
    font-size: 0.9375rem;
    line-height: 1.45;
    box-sizing: border-box;
  }
  .install .manual h2 {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6e6e73;
  }
  .install .manual ol.steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .install .manual ol.steps li {
    display: grid;
    grid-template-columns: 1.5rem 1fr;
    gap: 0.65rem;
    align-items: start;
  }
  .install .manual .step-num {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 999px;
    background: #007aff;
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 700;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .install .manual .step-text {
    padding-top: 0.1rem;
  }
  .install .manual .share-glyph {
    display: inline-flex;
    vertical-align: -0.35em;
    width: 1.35em;
    height: 1.35em;
    margin: 0 0.15em;
    color: #007aff;
  }
  .install .manual .share-glyph svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .install .manual[hidden] { display: none; }
  .install button[hidden],
  .install a.btn[hidden] { display: none; }
`;

function isDesktopFirefoxUa(ua: string): boolean {
  if (!ua) return false;
  if (/Android|FxiOS/i.test(ua)) return false;
  // Firefox and common Gecko forks.
  return /Firefox\/|LibreWolf\/|Waterfox\//i.test(ua);
}

function renderInstallPage(
  access: Extract<AppAccess, { kind: "ready" }>,
  opts?: { userAgent?: string },
): Response {
  const copy = installCopy(access.lang);
  const iconSrc = appIconPngSrc(access.iconId) ?? appIconSrc(access.iconId);
  const iconSvg = appIconSrc(access.iconId);
  const letter = (access.title.trim().charAt(0) || "?").toUpperCase();
  const platformOrigin = getPlatformOrigin();
  const backHref = `${platformOrigin}/${access.lang}/store/${encodeURIComponent(access.slug)}`;
  const precacheUrls = ["/", "/module.js", "/manifest.webmanifest"];
  if (iconSrc) precacheUrls.push(iconSrc);
  if (iconSvg && iconSvg !== iconSrc) precacheUrls.push(iconSvg);

  const firefoxDesktop = isDesktopFirefoxUa(opts?.userAgent ?? "");
  const ledeText = firefoxDesktop ? (copy.firefoxUnsupported ?? copy.ready) : copy.ready;

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
    <main class="install" data-lang="${escapeHtmlAttribute(access.lang)}"${firefoxDesktop ? ' data-firefox-desktop="1"' : ""}>
      <span class="icon" aria-hidden="true">
        ${
          iconSrc
            ? `<img src="${escapeHtmlAttribute(iconSrc)}" alt="" width="96" height="96" />`
            : escapeHtmlTextContent(letter)
        }
      </span>
      <h1>${escapeHtmlTextContent(access.title)}</h1>
      <p class="lede" id="lede">${escapeHtmlTextContent(ledeText)}</p>
      <div class="actions">
        <a class="btn secondary" id="back" href="${escapeHtmlAttribute(backHref)}">${escapeHtmlTextContent(copy.back)}</a>
        <button type="button" class="primary" id="install" hidden>${escapeHtmlTextContent(copy.install)}</button>
        <a class="btn primary" id="open" href="/"${firefoxDesktop ? "" : " hidden"}>${escapeHtmlTextContent(copy.openApp)}</a>
      </div>
      <div class="manual" id="manual" hidden>
        <h2>${escapeHtmlTextContent(copy.manualTitle)}</h2>
        <div id="manual-body"></div>
      </div>
    </main>
    <script>
      (function () {
        var copy = ${JSON.stringify(copy)};
        var precacheUrls = ${JSON.stringify(precacheUrls)};
        var CACHE = "rmix-app-runtime-v3";
        var installBtn = document.getElementById("install");
        var openBtn = document.getElementById("open");
        var ledeEl = document.getElementById("lede");
        var manual = document.getElementById("manual");
        var manualBody = document.getElementById("manual-body");
        var backBtn = document.getElementById("back");
        var mainEl = document.querySelector("main.install");
        var deferredPrompt = null;
        var supportsBip = "onbeforeinstallprompt" in window;

        function isIos() {
          return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        }
        function isAndroid() {
          return /Android/i.test(navigator.userAgent);
        }
        function isDesktopFirefox() {
          if (mainEl && mainEl.getAttribute("data-firefox-desktop") === "1") return true;
          var ua = navigator.userAgent || "";
          if (/Android|FxiOS/i.test(ua)) return false;
          return /Firefox\\/|LibreWolf\\/|Waterfox\\//i.test(ua);
        }

        function wireBack() {
          if (backBtn && history.length > 1) {
            backBtn.addEventListener("click", function (e) {
              e.preventDefault();
              history.back();
            });
          }
        }

        // Desktop Firefox first: show unsupported message + Open (no Install UI).
        if (isDesktopFirefox()) {
          installBtn.hidden = true;
          manual.hidden = true;
          if (ledeEl) ledeEl.textContent = copy.firefoxUnsupported;
          if (openBtn) openBtn.hidden = false;
          wireBack();
          return;
        }

        if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
          location.replace("/");
          return;
        }

        wireBack();

        function isMacSafari() {
          var ua = navigator.userAgent;
          var safari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|Android/i.test(ua);
          var mac = /Macintosh|Mac OS X/i.test(ua);
          return safari && mac && !isIos();
        }
        function manualSteps() {
          if (isIos()) return copy.iosSteps;
          if (isMacSafari()) return copy.macSafariSteps;
          if (isAndroid()) return copy.androidSteps;
          return copy.genericSteps;
        }
        function escapeHtml(s) {
          return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        }
        var SHARE_ICON =
          '<span class="share-glyph" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>' +
          "</svg></span>";
        function formatStep(text) {
          var parts = String(text).split("{{share}}");
          if (parts.length === 1) return escapeHtml(text);
          return parts.map(escapeHtml).join(SHARE_ICON);
        }
        function showManual() {
          manual.hidden = false;
          var steps = manualSteps() || [];
          manualBody.innerHTML =
            '<ol class="steps">' +
            steps
              .map(function (step, i) {
                return (
                  "<li>" +
                  '<span class="step-num">' +
                  (i + 1) +
                  "</span>" +
                  '<span class="step-text">' +
                  formatStep(step) +
                  "</span>" +
                  "</li>"
                );
              })
              .join("") +
            "</ol>";
        }

        async function precacheViaCacheApi(urls) {
          if (!("caches" in window)) return;
          var cache = await caches.open(CACHE);
          await Promise.all(urls.map(async function (url) {
            try {
              if (String(url) === "/install" || String(url).indexOf("/install") !== -1) return;
              var res = await fetch(url, { cache: "reload", credentials: "same-origin" });
              if (!res.ok) return;
              var path = new URL(url, location.origin).pathname;
              await cache.put(path === "/" ? "/" : url, res);
            } catch (e) {}
          }));
        }

        async function prepareOffline() {
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
          } catch (e) {}
        }

        void prepareOffline();

        if (!supportsBip) {
          installBtn.hidden = true;
          if (openBtn) openBtn.hidden = true;
          showManual();
          return;
        }

        installBtn.hidden = false;
        if (openBtn) openBtn.hidden = true;

        window.addEventListener("beforeinstallprompt", function (e) {
          e.preventDefault();
          deferredPrompt = e;
          manual.hidden = true;

          var canAuto = false;
          try {
            canAuto = !!(navigator.userActivation && navigator.userActivation.isActive);
          } catch (err) {}
          if (canAuto) void runInstallPrompt();
        });

        window.addEventListener("appinstalled", function () {
          if (ledeEl) ledeEl.textContent = copy.installed;
          deferredPrompt = null;
          void prepareOffline().then(function () {
            setTimeout(function () { location.href = "/"; }, 500);
          });
        });

        async function runInstallPrompt() {
          if (!deferredPrompt) return;

          var promptEvent = deferredPrompt;
          try {
            promptEvent.prompt();
            var choice = await Promise.race([
              promptEvent.userChoice,
              new Promise(function (_, reject) {
                setTimeout(function () {
                  reject(new Error("PROMPT_TIMEOUT"));
                }, 8000);
              }),
            ]);
            deferredPrompt = null;
            if (choice && choice.outcome === "accepted") {
              await prepareOffline();
            }
          } catch (err) {
            deferredPrompt = null;
          }
        }

        installBtn.addEventListener("click", function () {
          void runInstallPrompt();
        });

        setTimeout(function () {
          if (!deferredPrompt) showManual();
        }, 3000);
      })();
    </script>
  </body>
</html>`;

  return htmlResponse(html);
}

function renderAppPage(
  access: AppAccess,
  opts?: { mode?: string | null; userAgent?: string },
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
    return renderInstallPage(access, { userAgent: opts.userAgent });
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
  const url = new URL(req.url);
  // Legacy ?mode=install → /install
  if (url.searchParams.get("mode") === "install") {
    return Response.redirect(`${appOrigin(slug)}/install`, 302);
  }
  return renderAppPage(resolveAppAccess(lang, slug, req, { allowDraftBySlug: true }));
}

/** App PWA install UI on `{slug}.{APP_RUNTIME_HOST}/install`. */
export function appSubdomainInstallPage(req: BunRequest): Response {
  const slug = parseAppSubdomain(getRequestHost(req));
  if (!slug) return new Response("Not Found", { status: 404 });
  const lang = resolveRequestLang(req);
  return renderAppPage(resolveAppAccess(lang, slug, req, { allowDraftBySlug: true }), {
    mode: "install",
    userAgent: req.headers.get("user-agent") ?? "",
  });
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
    if (url.searchParams.get("mode") === "install") {
      return Response.redirect(`${appOrigin(slug)}/install`, 302);
    }
    return redirectToAppSubdomain(slug, url.search);
  }

  return renderAppPage(resolveAppAccess(lang, slug, req), {
    mode: url.searchParams.get("mode"),
    userAgent: req.headers.get("user-agent") ?? "",
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
