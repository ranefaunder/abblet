/**
 * Remiix app companion — Patch badge + Remiix.ai / connect API.
 * Loaded as <script type="module" src="/static/remiix-app.js"> on the app page.
 * Expects window.__REMIIX__ = { appSlug, platformOrigin, connectHref, tagName, moduleUrl, lang, published, title }.
 */
const cfg = window.__REMIIX__;
const appSlug = cfg.appSlug;
const platformOrigin = cfg.platformOrigin;
const connectHref = cfg.connectHref;
const tagName = cfg.tagName;
const moduleUrl = cfg.moduleUrl;
const lang = cfg.lang || "en";
const published = cfg.published === true;
const appTitle = typeof cfg.title === "string" && cfg.title.trim() ? cfg.title.trim() : "Remiix";

const TOKEN_KEY = "remiix.token";
const TOKEN_EXP_KEY = "remiix.tokenExpiresAt";

const COPY = {
  en: {
    loginTitle: "Sign in to Remiix",
    loginBody: "This feature needs a Remiix account.",
    loginCta: "Sign in",
    loginCancel: "Cancel",
    offlineTitle: "You're offline",
    offlineBody: "AI needs an internet connection. Your app data still works offline.",
    offlineOk: "OK",
    patchAria: "Remiix",
    install: "Install",
    share: "Share",
    shareCopied: "Link copied",
    store: "Store",
    edit: "Edit",
    remix: "Remix",
    remixing: "Remixing…",
    about: "Remiix.app",
    creditLabel: "AI credit",
    creditLoading: "…",
    creditEmpty: "No credit left",
    ownedByYou: "Your app",
  },
  fi: {
    loginTitle: "Kirjaudu Remiixiin",
    loginBody: "Tämä ominaisuus vaatii Remiix-tilin.",
    loginCta: "Kirjaudu",
    loginCancel: "Peruuta",
    offlineTitle: "Olet offline",
    offlineBody: "Tekoäly tarvitsee nettiyhteyden. Appisi data toimii silti offline.",
    offlineOk: "OK",
    patchAria: "Remiix",
    install: "Asenna",
    share: "Share",
    shareCopied: "Linkki kopioitu",
    store: "Store",
    edit: "Edit",
    remix: "Remix",
    remixing: "Remixataan…",
    about: "Remiix.app",
    creditLabel: "AI-saldo",
    creditLoading: "…",
    creditEmpty: "Saldo loppu",
    ownedByYou: "Oma appisi",
  },
};

function uiCopy() {
  return COPY[lang] || COPY.en;
}

function readStoredToken() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const expiresAt = sessionStorage.getItem(TOKEN_EXP_KEY);
    if (!token || !expiresAt) return null;
    if (Date.parse(expiresAt) <= Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_EXP_KEY);
      return null;
    }
    return { accessToken: token, expiresAt };
  } catch {
    return null;
  }
}

function storeToken(accessToken, expiresAt) {
  sessionStorage.setItem(TOKEN_KEY, accessToken);
  sessionStorage.setItem(TOKEN_EXP_KEY, expiresAt);
}

/** Ask to sign in, then redirect to /connect/{slug}. Resolves true if continuing. */
function confirmLogin() {
  const t = uiCopy();
  return new Promise((resolve) => {
    const existing = document.getElementById("remiix-login-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "remiix-login-dialog";
    dialog.setAttribute("closedby", "any");
    dialog.innerHTML = `
      <form method="dialog" style="margin:0;display:flex;flex-direction:column;gap:16px;min-width:min(100%,320px)">
        <h2 style="margin:0;font-size:1.125rem;font-weight:600;line-height:1.3">${t.loginTitle}</h2>
        <p style="margin:0;font-size:0.9375rem;line-height:1.45;color:#3c3c4399">${t.loginBody}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button value="cancel" type="submit" style="appearance:none;border:none;background:#e5e5ea;color:#000;font:inherit;font-weight:500;padding:10px 16px;border-radius:10px;cursor:pointer">${t.loginCancel}</button>
          <button value="continue" type="submit" style="appearance:none;border:none;background:#007aff;color:#fff;font:inherit;font-weight:500;padding:10px 16px;border-radius:10px;cursor:pointer">${t.loginCta}</button>
        </div>
      </form>
    `;
    Object.assign(dialog.style, {
      border: "none",
      borderRadius: "16px",
      padding: "20px",
      maxWidth: "calc(100vw - 32px)",
      boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
    });

    dialog.addEventListener("close", () => {
      const ok = dialog.returnValue === "continue";
      dialog.remove();
      resolve(ok);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

function showOfflineAiNotice() {
  const t = uiCopy();
  return new Promise((resolve) => {
    const existing = document.getElementById("remiix-offline-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "remiix-offline-dialog";
    dialog.setAttribute("closedby", "any");
    dialog.innerHTML = `
      <form method="dialog" style="margin:0;display:flex;flex-direction:column;gap:16px;min-width:min(100%,320px)">
        <h2 style="margin:0;font-size:1.125rem;font-weight:600;line-height:1.3">${t.offlineTitle || "You're offline"}</h2>
        <p style="margin:0;font-size:0.9375rem;line-height:1.45;color:#3c3c4399">${t.offlineBody || "AI needs an internet connection."}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button value="ok" type="submit" style="appearance:none;border:none;background:#007aff;color:#fff;font:inherit;font-weight:500;padding:10px 16px;border-radius:10px;cursor:pointer">${t.offlineOk || "OK"}</button>
        </div>
      </form>
    `;
    Object.assign(dialog.style, {
      border: "none",
      borderRadius: "16px",
      padding: "20px",
      maxWidth: "calc(100vw - 32px)",
      boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

function isProbablyOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function formatBalanceUsd(usd) {
  const n = typeof usd === "number" && Number.isFinite(usd) ? usd : 0;
  return "$" + (Math.round(n * 100) / 100).toFixed(2);
}

/** Debit float: cents + fractional cents (e.g. -2¢, -0.5¢). */
function formatDebitCents(usd) {
  const n = typeof usd === "number" && Number.isFinite(usd) ? Math.max(0, usd) : 0;
  const cents = n * 100;
  let formatted = cents.toFixed(2).replace(/\.?0+$/, "");
  if ((formatted === "" || formatted === "0") && cents > 0) {
    formatted = cents.toFixed(3).replace(/\.?0+$/, "");
  }
  if (!formatted) formatted = "0";
  return `-${formatted}¢`;
}

/** Patch UI hooks — filled by mountRemiixPatch so Remiix.ai can animate debits. */
const creditUi = {
  balanceUsd: null,
  setBalance(_usd) {},
  showDebit(_billedUsd) {},
  showEmpty() {},
};

window.Remiix = {
  appSlug,
  platformOrigin,
  user: null,
  isOwner: false,
  connect() {
    location.href = connectHref;
  },
  getToken() {
    return readStoredToken()?.accessToken ?? null;
  },
  getTokenExpiresAt() {
    return readStoredToken()?.expiresAt ?? null;
  },
  async ai(opts) {
    if (!opts || typeof opts !== "object" || typeof opts.prompt !== "string" || !opts.prompt.trim()) {
      const err = new Error("MISSING_PROMPT");
      err.code = "MISSING_PROMPT";
      throw err;
    }
    if (isProbablyOffline()) {
      await showOfflineAiNotice();
      const err = new Error("OFFLINE");
      err.code = "OFFLINE";
      throw err;
    }
    const token = this.getToken();
    if (!token) {
      const ok = await confirmLogin();
      if (!ok) {
        const err = new Error("CONNECT_CANCELLED");
        err.code = "CONNECT_CANCELLED";
        throw err;
      }
      this.connect();
      const err = new Error("CONNECT_REQUIRED");
      err.code = "CONNECT_REQUIRED";
      throw err;
    }
    const body = { prompt: opts.prompt.trim() };
    if (typeof opts.system === "string" && opts.system.trim()) {
      body.system = opts.system.trim();
    }
    let res;
    try {
      res = await fetch(platformOrigin + "/api/sdk/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(body),
      });
    } catch {
      await showOfflineAiNotice();
      const err = new Error("OFFLINE");
      err.code = "OFFLINE";
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || data.error?.code === "TOKEN_EXPIRED" || data.error?.code === "UNAUTHORIZED") {
      try {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_EXP_KEY);
      } catch {
        // ignore
      }
    }
    if (!data.success) {
      const code = data.error?.code || "AI_ERROR";
      if (code === "INSUFFICIENT_CREDITS") {
        creditUi.setBalance(0);
        creditUi.showEmpty();
      }
      const err = new Error(code);
      err.code = code;
      throw err;
    }
    if (typeof data.data?.billedUsd === "number" && data.data.billedUsd > 0) {
      creditUi.showDebit(data.data.billedUsd);
    }
    if (typeof data.data?.balanceUsd === "number") {
      creditUi.setBalance(data.data.balanceUsd);
    }
    return data.data.text;
  },
};

/**
 * No platform cookie on app hosts (host-only on remiix.app).
 * A connect token means the user linked their Remiix account in this runtime.
 */
async function loadPlatformSession() {
  const token = readStoredToken();
  const session = {
    user: token ? { connected: true } : null,
    isOwner: false,
    published: published,
  };
  window.Remiix.user = session.user;
  window.Remiix.isOwner = false;
  return session;
}

/** Log this open when Patch sees a connected Remiix account (once per tab session). */
async function recordOpenIfLoggedIn() {
  const token = readStoredToken()?.accessToken;
  if (!token) return;
  const key = "remiix.openLogged:" + appSlug;
  try {
    if (sessionStorage.getItem(key) === "1") return;
  } catch {
    // ignore
  }
  try {
    const res = await fetch(platformOrigin + "/api/sdk/open", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    if (res.ok) {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        // ignore
      }
    } else if (res.status === 401) {
      try {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_EXP_KEY);
      } catch {
        // ignore
      }
    }
  } catch {
    // Offline / network — skip.
  }
}

const params = new URLSearchParams(location.search);
const code = params.get("code");
if (code) {
  params.delete("code");
  const clean = location.pathname + (params.toString() ? "?" + params.toString() : "") + location.hash;
  history.replaceState(null, "", clean);
  try {
    const res = await fetch(platformOrigin + "/api/sdk/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.success && data.data?.accessToken) {
      storeToken(data.data.accessToken, data.data.expiresAt);
    }
  } catch {
    // Connect exchange failed — app still loads without token.
  }
}

const platformSession = await loadPlatformSession();
void recordOpenIfLoggedIn();

const mount = document.getElementById("mount");
await import(moduleUrl);
mount.appendChild(document.createElement(tagName));

mountRemiixPatch(platformSession);

const PRECACHE_URLS = [
  "/",
  "/module.js",
  "/manifest.webmanifest",
  "/static/remiix-app.js",
  "/static/images/remiix-icon-light.svg",
];

/**
 * Whether this document is shown in an installed-app chrome.
 * (Do not treat minimal-ui as installed — too aggressive.)
 */
function isStandaloneDisplay() {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    // ignore
  }
  return window.navigator.standalone === true;
}

/** Navigated here from the Remiix platform (Store / Open / etc.). */
function cameFromPlatform() {
  const key = "remiix.fromPlatform:" + appSlug;
  try {
    if (sessionStorage.getItem(key) === "1") return true;
    const ref = document.referrer || "";
    if (ref && ref.startsWith(platformOrigin)) {
      sessionStorage.setItem(key, "1");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * True only when THIS app is running as its own installed PWA.
 * If the user opened the app from the Remiix PWA/site while still in standalone
 * chrome, Install should still be offered for this app.
 */
function isThisAppInstalledPwa() {
  if (!isStandaloneDisplay()) return false;
  if (cameFromPlatform()) return false;
  return true;
}

/** Remiix badge — edit/remix, share + store (if published), about, optional Update/Install. */
function mountRemiixPatch(session) {
  if (document.getElementById("remiix-patch")) return;

  const t = uiCopy();
  const storeHref = platformOrigin + "/" + lang + "/apps/" + encodeURIComponent(appSlug);
  const editHref = platformOrigin + "/" + lang + "/create/" + encodeURIComponent(appSlug);
  const aboutHref = platformOrigin + "/" + lang + "/";
  const shareUrl = published ? storeHref : location.origin + "/";
  const canOfferInstall = !isThisAppInstalledPwa();
  let deferredPrompt = null;

  // Cookie is host-only on remiix.app — Edit/Remix always go to the platform.
  const showEdit = true;
  const showRemix = published;

  const menuItems = [];
  menuItems.push(`
    <div class="remiix-patch-meta" data-remiix-meta hidden>
      <div class="remiix-patch-owned" data-remiix-owned hidden role="status">${t.ownedByYou}</div>
      <div class="remiix-patch-credit" data-remiix-credit hidden role="status">
        <span class="remiix-patch-credit-label">${t.creditLabel}</span>
        <span class="remiix-patch-credit-value" data-remiix-credit-value>${t.creditLoading}</span>
      </div>
    </div>
  `);
  if (showEdit) {
    menuItems.push(`<a role="menuitem" href="${editHref}" data-remiix-edit>${t.edit}</a>`);
  }
  if (showRemix) {
    menuItems.push(
      `<button type="button" role="menuitem" data-remiix-remix>${t.remix}</button>`,
    );
  }
  menuItems.push(`<button type="button" role="menuitem" data-remiix-share>${t.share}</button>`);
  if (published) {
    menuItems.push(`<a role="menuitem" href="${storeHref}">${t.store}</a>`);
  }
  menuItems.push(`<a role="menuitem" href="${aboutHref}">${t.about}</a>`);
  if (canOfferInstall) {
    menuItems.push(
      `<button type="button" role="menuitem" data-remiix-install class="remiix-patch-primary">${t.install}</button>`,
    );
  }

  const root = document.createElement("div");
  root.id = "remiix-patch";
  root.innerHTML = `
    <button type="button" class="remiix-patch-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${t.patchAria}">
      <span class="remiix-patch-face">
        <img class="remiix-patch-mark" src="/static/images/remiix-icon-light.svg" width="52" height="52" alt="" draggable="false" />
        <span class="remiix-patch-dot" data-remiix-install-dot hidden aria-hidden="true"></span>
      </span>
    </button>
    <div class="remiix-patch-floats" data-remiix-floats aria-hidden="true"></div>
    <div class="remiix-patch-menu" role="menu" hidden>
      ${menuItems.join("")}
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #remiix-patch {
      position: fixed;
      z-index: 2147483646;
      right: calc(16px + env(safe-area-inset-right, 0px));
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      font-family: "Geist", -apple-system, "SF Pro Text", system-ui, sans-serif;
    }
    #remiix-patch .remiix-patch-btn {
      appearance: none;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: block;
      border-radius: 22%;
      transition: transform 0.22s ease, filter 0.22s ease;
    }
    #remiix-patch .remiix-patch-btn:hover {
      transform: scale(1.06) translateY(-1px);
      filter: brightness(1.02);
    }
    #remiix-patch .remiix-patch-btn:active {
      transform: scale(0.98);
    }
    #remiix-patch .remiix-patch-face {
      position: relative;
      display: block;
      width: 52px;
      height: 52px;
      border-radius: 22%;
      box-shadow: 0 10px 28px rgba(15, 20, 25, 0.14);
    }
    #remiix-patch .remiix-patch-mark {
      display: block;
      width: 52px;
      height: 52px;
      border-radius: 22%;
      pointer-events: none;
      user-select: none;
    }
    #remiix-patch .remiix-patch-dot {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #6366f1;
      box-shadow: 0 0 0 2px #ffffff;
      animation: remiix-patch-dot-pulse 2s ease-in-out infinite;
    }
    #remiix-patch .remiix-patch-dot[hidden] {
      display: none;
      animation: none;
    }
    @keyframes remiix-patch-dot-pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.18);
        opacity: 0.72;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #remiix-patch .remiix-patch-dot {
        animation: none;
      }
    }
    #remiix-patch .remiix-patch-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + 10px);
      min-width: 12rem;
      padding: 6px;
      border-radius: 14px;
      background:
        radial-gradient(ellipse 80% 60% at 100% 0%, #f5f5f5, transparent 55%),
        #ffffff;
      border: 1px solid #e5e5e5;
      box-shadow:
        0 10px 28px rgba(15, 20, 25, 0.12),
        0 1px 0 rgba(255, 255, 255, 0.5) inset;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    #remiix-patch .remiix-patch-menu[hidden] {
      display: none;
    }
    #remiix-patch .remiix-patch-menu a,
    #remiix-patch .remiix-patch-menu button {
      appearance: none;
      display: block;
      width: 100%;
      margin: 0;
      padding: 10px 12px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: #0a0a0a;
      text-align: left;
      text-decoration: none;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.25;
      cursor: pointer;
    }
    #remiix-patch .remiix-patch-menu a:hover,
    #remiix-patch .remiix-patch-menu button:hover {
      background: #f5f5f5;
    }
    #remiix-patch .remiix-patch-menu .remiix-patch-primary {
      background: #6366f1;
      color: #ffffff;
      text-align: center;
      margin-top: 4px;
    }
    #remiix-patch .remiix-patch-menu .remiix-patch-primary:hover {
      background: #4f46e5;
      filter: brightness(1.02);
    }
    #remiix-patch .remiix-patch-menu .remiix-patch-primary + .remiix-patch-primary {
      margin-top: 2px;
    }
    #remiix-patch .remiix-patch-menu [data-remiix-install][hidden] {
      display: none;
    }
    #remiix-patch .remiix-patch-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0 0 4px;
      padding: 0 0 6px;
      border-bottom: 1px solid #ebebeb;
    }
    #remiix-patch .remiix-patch-meta[hidden] {
      display: none;
    }
    #remiix-patch .remiix-patch-owned {
      margin: 0;
      padding: 8px 12px 4px;
      color: #4f46e5;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.25;
      pointer-events: none;
      user-select: none;
    }
    #remiix-patch .remiix-patch-owned[hidden] {
      display: none;
    }
    #remiix-patch .remiix-patch-credit {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 0;
      padding: 4px 12px 8px;
      color: #525252;
      font-size: 0.8125rem;
      font-weight: 500;
      letter-spacing: -0.01em;
      line-height: 1.25;
      pointer-events: none;
      user-select: none;
    }
    #remiix-patch .remiix-patch-credit[hidden] {
      display: none;
    }
    #remiix-patch .remiix-patch-credit-label {
      color: #737373;
      font-weight: 500;
    }
    #remiix-patch .remiix-patch-credit-value {
      color: #0a0a0a;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    #remiix-patch .remiix-patch-floats {
      position: absolute;
      left: 50%;
      bottom: 100%;
      width: 0;
      height: 0;
      overflow: visible;
      pointer-events: none;
      z-index: 1;
    }
    #remiix-patch .remiix-credit-float {
      position: absolute;
      left: 50%;
      bottom: 8px;
      transform: translate(-50%, 0);
      padding: 4px 9px;
      border-radius: 999px;
      background: #0a0a0a;
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
      line-height: 1.2;
      white-space: nowrap;
      box-shadow: 0 6px 16px rgba(15, 20, 25, 0.18);
      animation: remiix-credit-float 1.15s ease-out forwards;
    }
    #remiix-patch .remiix-credit-float.is-empty {
      background: #b91c1c;
      animation-duration: 1.6s;
    }
    @keyframes remiix-credit-float {
      0% {
        opacity: 0;
        transform: translate(-50%, 6px) scale(0.92);
      }
      12% {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
      70% {
        opacity: 1;
        transform: translate(-50%, -36px) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -52px) scale(0.98);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #remiix-patch .remiix-credit-float {
        animation: remiix-credit-float-reduced 0.9s ease-out forwards;
      }
      @keyframes remiix-credit-float-reduced {
        0%, 55% { opacity: 1; transform: translate(-50%, -12px); }
        100% { opacity: 0; transform: translate(-50%, -12px); }
      }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const btn = root.querySelector(".remiix-patch-btn");
  const menu = root.querySelector(".remiix-patch-menu");
  const floats = root.querySelector("[data-remiix-floats]");
  const metaRow = root.querySelector("[data-remiix-meta]");
  const ownedRow = root.querySelector("[data-remiix-owned]");
  const creditRow = root.querySelector("[data-remiix-credit]");
  const creditValueEl = root.querySelector("[data-remiix-credit-value]");
  const installBtn = root.querySelector("[data-remiix-install]");
  const remixBtn = root.querySelector("[data-remiix-remix]");
  const shareBtn = root.querySelector("[data-remiix-share]");
  const actionDot = root.querySelector("[data-remiix-install-dot]");
  let autoUpdating = false;

  function syncMetaVisibility() {
    if (!metaRow) return;
    const showOwned = !!(ownedRow && !ownedRow.hidden);
    const showCredit = !!(creditRow && !creditRow.hidden);
    metaRow.hidden = !(showOwned || showCredit);
  }

  function setOwned(isOwner) {
    window.Remiix.isOwner = isOwner === true;
    if (ownedRow) ownedRow.hidden = !window.Remiix.isOwner;
    syncMetaVisibility();
  }

  function setCreditBalance(usd) {
    creditUi.balanceUsd = typeof usd === "number" && Number.isFinite(usd) ? usd : null;
    if (!creditRow || !creditValueEl) return;
    if (creditUi.balanceUsd == null) {
      creditRow.hidden = true;
      syncMetaVisibility();
      return;
    }
    creditRow.hidden = false;
    creditValueEl.textContent = formatBalanceUsd(creditUi.balanceUsd);
    syncMetaVisibility();
  }

  function showCreditFloat(text, kind) {
    if (!floats || !text) return;
    const pill = document.createElement("span");
    pill.className = "remiix-credit-float" + (kind === "empty" ? " is-empty" : "");
    pill.textContent = text;
    floats.appendChild(pill);
    const ttl = kind === "empty" ? 2200 : 1600;
    pill.addEventListener("animationend", () => pill.remove(), { once: true });
    window.setTimeout(() => pill.remove(), ttl);
  }

  function showCreditDebit(billedUsd) {
    if (!(typeof billedUsd === "number") || !Number.isFinite(billedUsd) || billedUsd <= 0) {
      return;
    }
    showCreditFloat(formatDebitCents(billedUsd), "debit");
  }

  function showCreditEmpty() {
    showCreditFloat(t.creditEmpty || "No credit left", "empty");
  }

  creditUi.setBalance = setCreditBalance;
  creditUi.showDebit = showCreditDebit;
  creditUi.showEmpty = showCreditEmpty;

  async function refreshCredits() {
    const token = readStoredToken()?.accessToken;
    if (!token) {
      setCreditBalance(null);
      setOwned(false);
      return;
    }
    try {
      const res = await fetch(platformOrigin + "/api/sdk/credits", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        try {
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(TOKEN_EXP_KEY);
        } catch {
          // ignore
        }
        setCreditBalance(null);
        setOwned(false);
        return;
      }
      if (data.success && data.data) {
        if (typeof data.data.balanceUsd === "number") {
          setCreditBalance(data.data.balanceUsd);
        }
        setOwned(data.data.isOwner === true);
      }
    } catch {
      // Offline — leave last known balance if any.
    }
  }

  void refreshCredits();

  function closeMenu() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    void refreshCredits();
  }

  function isMenuActionVisible(el) {
    return !!(el && !el.hidden);
  }

  function syncActionDot() {
    if (!actionDot) return;
    actionDot.hidden = !isMenuActionVisible(installBtn);
  }

  function hideInstall() {
    if (installBtn) installBtn.hidden = true;
    deferredPrompt = null;
    try {
      sessionStorage.removeItem("remiix.fromPlatform:" + appSlug);
    } catch {
      // ignore
    }
    syncActionDot();
  }

  async function remixApp() {
    if (!remixBtn || remixBtn.disabled) return;
    closeMenu();
    // Remix requires platform login (host-only cookie).
    location.href =
      platformOrigin +
      "/" +
      lang +
      "/login?next=" +
      encodeURIComponent("/" + lang + "/apps/" + encodeURIComponent(appSlug));
  }

  async function installApp() {
    closeMenu();
    if (deferredPrompt) {
      try {
        const promptEvent = deferredPrompt;
        deferredPrompt = null;
        promptEvent.prompt();
        await promptEvent.userChoice;
        return;
      } catch {
        // Fall through to install page.
      }
    }
    location.href = "/install";
  }

  async function shareApp() {
    const shareData = { title: appTitle, url: shareUrl, text: appTitle };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        closeMenu();
        return;
      }
    } catch (err) {
      if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) {
        closeMenu();
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      if (shareBtn) {
        const prev = shareBtn.textContent;
        shareBtn.textContent = t.shareCopied;
        window.setTimeout(() => {
          shareBtn.textContent = prev;
        }, 1600);
      }
    } catch {
      // ignore
    }
    closeMenu();
  }

  async function applyUpdateAndReload() {
    if (autoUpdating || navigator.onLine === false) return;
    if (!("serviceWorker" in navigator)) {
      location.reload();
      return;
    }
    autoUpdating = true;
    try {
      const reg = await navigator.serviceWorker.ready;
      const worker = reg.active || navigator.serviceWorker.controller;
      if (!worker) {
        location.reload();
        return;
      }
      const done = new Promise((resolve) => {
        const onMsg = (event) => {
          if (event.data && event.data.type === "UPDATE_APPLIED") {
            navigator.serviceWorker.removeEventListener("message", onMsg);
            resolve();
          }
        };
        navigator.serviceWorker.addEventListener("message", onMsg);
        window.setTimeout(resolve, 8000);
      });
      worker.postMessage({ type: "APPLY_UPDATE", urls: PRECACHE_URLS });
      await done;
      location.reload();
    } catch {
      autoUpdating = false;
    }
  }

  function requestUpdateCheck() {
    if (!("serviceWorker" in navigator) || navigator.onLine === false) return;
    void navigator.serviceWorker.ready
      .then((reg) => {
        const worker = reg.active || navigator.serviceWorker.controller;
        worker?.postMessage({ type: "CHECK_UPDATE" });
      })
      .catch(() => {});
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  if (installBtn) {
    installBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void installApp();
    });
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.hidden = false;
      syncActionDot();
    });
    window.addEventListener("appinstalled", () => {
      hideInstall();
    });
  }

  if (remixBtn) {
    remixBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void remixApp();
    });
  }

  syncActionDot();

  if (shareBtn) {
    shareBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void shareApp();
    });
  }

  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "UPDATE_STATUS" && event.data.available === true) {
        void applyUpdateAndReload();
      }
    });
    window.setTimeout(requestUpdateCheck, 1200);
    window.addEventListener("online", requestUpdateCheck);
  }
}
