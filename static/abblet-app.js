/**
 * Abblet app companion — Patch badge + Abblet.ai / Abblet.sync / permission API.
 * Loaded as <script type="module" src="/static/abblet-app.js"> on the app page.
 * Expects window.__ABBLET__ (legacy: window.__REMIIX__) = { appSlug, platformOrigin, permissions? }.
 * Module self-mounts into #mount; title/lang/icon come from the document.
 */
const cfg = window.__ABBLET__ || window.__REMIIX__ || {};
const appSlug = cfg.appSlug;
const platformOrigin = cfg.platformOrigin;
const lang = document.documentElement.lang || "en";
const appPermissions = Array.isArray(cfg.permissions) ? cfg.permissions : [];
const needsAiPermission = appPermissions.includes("ai");
const needsSyncPermission = appPermissions.includes("sync");
const needsRuntimePermission = needsAiPermission || needsSyncPermission;
const appTitle = (document.title || "Abblet").trim() || "Abblet";
const appIconSrc =
  document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ||
  document.querySelector('link[rel="icon"]')?.getAttribute("href") ||
  null;
const catalogAppPath = "/" + lang + "/apps/" + encodeURIComponent(appSlug);

const TOKEN_KEY = "abblet.token";
const TOKEN_EXP_KEY = "abblet.tokenExpiresAt";
/** Prevents permission-redirect loops when the user cancels or is not signed in. */
const PERMISSION_TRIED_KEY = "abblet.permissionTried:" + appSlug;
/** Session guard: already sent to the permission page for a missing sync grant. */
const SYNC_TRIED_KEY = "abblet.syncTried:" + appSlug;
const SYNC_MAX_BYTES = 128 * 1024;

const COPY = {
  en: {
    loginTitle: "Allow AI?",
    loginBody: "This app needs permission to use your Abblet AI credit.",
    loginCta: "Continue",
    loginCancel: "Cancel",
    offlineTitle: "You're offline",
    offlineBody: "AI needs an internet connection. Your app data still works offline.",
    offlineOk: "OK",
    patchAria: "Abblet",
    install: "Install",
    share: "Share",
    shareCopied: "Link copied",
    remix: "Remix",
    permissions: "Permissions",
    permissionsEmpty: "No permissions granted",
    permissionAi: "AI",
    permissionSync: "Sync",
    permissionBudget: "$spent/$limit/mo",
    revoke: "Revoke",
    revoking: "…",
  },
  fi: {
    loginTitle: "Sallitaanko AI?",
    loginBody: "Tämä appi tarvitsee luvan käyttää Abblet AI-saldoasi.",
    loginCta: "Jatka",
    loginCancel: "Peruuta",
    offlineTitle: "Olet offline",
    offlineBody: "Tekoäly tarvitsee nettiyhteyden. Appisi data toimii silti offline.",
    offlineOk: "OK",
    patchAria: "Abblet",
    install: "Asenna",
    share: "Share",
    shareCopied: "Linkki kopioitu",
    remix: "Remix",
    permissions: "Luvat",
    permissionsEmpty: "Ei annettuja lupia",
    permissionAi: "AI",
    permissionSync: "Sync",
    permissionBudget: "$spent/$limit/kk",
    revoke: "Poista",
    revoking: "…",
  },
};

function uiCopy() {
  return COPY[lang] || COPY.en;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readStoredToken() {
  try {
    let token = sessionStorage.getItem(TOKEN_KEY);
    let expiresAt = sessionStorage.getItem(TOKEN_EXP_KEY);
    // Migrate legacy Remiix session keys
    if (!token || !expiresAt) {
      token = sessionStorage.getItem("remiix.token");
      expiresAt = sessionStorage.getItem("remiix.tokenExpiresAt");
      if (token && expiresAt) {
        sessionStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(TOKEN_EXP_KEY, expiresAt);
        sessionStorage.removeItem("remiix.token");
        sessionStorage.removeItem("remiix.tokenExpiresAt");
      }
    }
    if (!token || !expiresAt) return null;
    if (Date.parse(expiresAt) <= Date.now()) {
      clearStoredToken();
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

function clearStoredToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
    // Legacy Remiix keys
    sessionStorage.removeItem("remiix.token");
    sessionStorage.removeItem("remiix.tokenExpiresAt");
  } catch {
    // ignore
  }
}

/** Platform SPA consent page (monthly budget + Allow). */
function permissionConsentHref() {
  return platformOrigin + "/" + lang + "/permission/" + encodeURIComponent(appSlug);
}

function isProbablyOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function markPermissionTried() {
  try {
    sessionStorage.setItem(PERMISSION_TRIED_KEY, "1");
  } catch {
    // ignore
  }
}

function clearPermissionTried() {
  try {
    sessionStorage.removeItem(PERMISSION_TRIED_KEY);
    sessionStorage.removeItem("remiix.permissionTried:" + appSlug);
  } catch {
    // ignore
  }
}

function wasPermissionTried() {
  try {
    if (sessionStorage.getItem(PERMISSION_TRIED_KEY) === "1") return true;
    return sessionStorage.getItem("remiix.permissionTried:" + appSlug) === "1";
  } catch {
    return true;
  }
}

function markSyncTried() {
  try {
    sessionStorage.setItem(SYNC_TRIED_KEY, "1");
  } catch {
    // ignore
  }
}

function clearSyncTried() {
  try {
    sessionStorage.removeItem(SYNC_TRIED_KEY);
  } catch {
    // ignore
  }
}

function wasSyncTried() {
  try {
    return sessionStorage.getItem(SYNC_TRIED_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * When the app declares `ai` and/or `sync` and there is no runtime token,
 * redirect to the permission request page.
 * @param {{ force?: boolean }} [opts] — force=true skips the “already tried” guard (after revoke).
 * @returns {boolean} true if a redirect was started
 */
function ensurePermissions(opts) {
  if (!needsRuntimePermission) return false;
  if (!isProbablyOnline()) return false;
  if (readStoredToken()) {
    clearPermissionTried();
    return false;
  }
  if (!opts?.force && wasPermissionTried()) return false;

  markPermissionTried();
  location.replace(permissionConsentHref());
  return true;
}

/** Open the consent UI (clears loop guard so boot can redirect again after revoke). */
function promptForPermission() {
  clearPermissionTried();
  location.href = permissionConsentHref();
}

/** Ask to allow AI (sign-in if needed), then open the permission flow. Resolves true if continuing. */
function confirmPermission() {
  const t = uiCopy();
  const title = t.loginTitle;
  const body = t.loginBody;
  return new Promise((resolve) => {
    const existing = document.getElementById("abblet-login-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "abblet-login-dialog";
    dialog.setAttribute("closedby", "any");
    dialog.innerHTML = `
      <form method="dialog" style="margin:0;display:flex;flex-direction:column;gap:16px;min-width:min(100%,320px)">
        <h2 style="margin:0;font-size:1.125rem;font-weight:600;line-height:1.3">${title}</h2>
        <p style="margin:0;font-size:0.9375rem;line-height:1.45;color:#3c3c4399">${body}</p>
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
    const existing = document.getElementById("abblet-offline-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "abblet-offline-dialog";
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

function syncPayloadError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

/** Throws PAYLOAD_TOO_LARGE / INVALID_JSON. `null` is allowed (clears the blob). */
function assertSyncPayload(data) {
  if (data === null) return;
  let payload;
  try {
    payload = JSON.stringify(data);
  } catch {
    throw syncPayloadError("INVALID_JSON");
  }
  if (typeof payload !== "string") {
    throw syncPayloadError("INVALID_JSON");
  }
  if (new TextEncoder().encode(payload).byteLength > SYNC_MAX_BYTES) {
    throw syncPayloadError("PAYLOAD_TOO_LARGE");
  }
}

window.Abblet = {
  appSlug,
  platformOrigin,
  requestPermission() {
    promptForPermission();
  },
  /** @deprecated Use requestPermission — kept for older generated apps. */
  connect() {
    this.requestPermission();
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
      const ok = await confirmPermission();
      if (!ok) {
        const err = new Error("PERMISSION_CANCELLED");
        err.code = "PERMISSION_CANCELLED";
        err.connectCode = "CONNECT_CANCELLED";
        throw err;
      }
      this.requestPermission();
      const err = new Error("PERMISSION_REQUIRED");
      err.code = "PERMISSION_REQUIRED";
      err.connectCode = "CONNECT_REQUIRED";
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
    if (
      res.status === 401 ||
      data.error?.code === "TOKEN_EXPIRED" ||
      data.error?.code === "UNAUTHORIZED" ||
      data.error?.code === "PERMISSION_REQUIRED"
    ) {
      clearStoredToken();
      clearPermissionTried();
    }
    if (!data.success) {
      const code = data.error?.code || "AI_ERROR";
      if (code === "PERMISSION_REQUIRED") {
        promptForPermission();
      }
      const err = new Error(code);
      err.code = code;
      throw err;
    }
    return data.data.text;
  },
  /**
   * Cloud blob for this user × app. Overlay on the app's own localStorage.
   * await Abblet.sync() → data | null
   * await Abblet.sync(obj) → saved data (or obj if offline / no permission)
   * await Abblet.sync(null) → clears the cloud blob
   */
  async sync(data) {
    const isGet = arguments.length === 0 || data === undefined;
    if (!isGet) assertSyncPayload(data);

    const failOpen = () => (isGet ? null : data);

    if (isProbablyOffline()) return failOpen();
    const token = this.getToken();
    if (!token) return failOpen();

    const url = platformOrigin + "/api/sdk/sync";
    const headers = {
      Authorization: "Bearer " + token,
    };
    let res;
    try {
      if (isGet) {
        res = await fetch(url, { method: "GET", headers });
      } else {
        headers["Content-Type"] = "application/json";
        res = await fetch(url, {
          method: "PUT",
          headers,
          body: JSON.stringify({ data }),
        });
      }
    } catch {
      return failOpen();
    }

    const body = await res.json().catch(() => ({}));
    const code = body.error?.code;
    if (
      res.status === 401 ||
      code === "TOKEN_EXPIRED" ||
      code === "UNAUTHORIZED"
    ) {
      clearStoredToken();
      clearPermissionTried();
      clearSyncTried();
      return failOpen();
    }
    if (res.status === 403 || code === "PERMISSION_REQUIRED") {
      if (!wasSyncTried()) {
        markSyncTried();
        location.href = permissionConsentHref();
      }
      return failOpen();
    }
    if (code === "PAYLOAD_TOO_LARGE") {
      throw syncPayloadError("PAYLOAD_TOO_LARGE");
    }
    if (!body.success) return failOpen();
    clearSyncTried();
    return Object.prototype.hasOwnProperty.call(body.data || {}, "data")
      ? body.data.data
      : failOpen();
  },
};

/** Legacy alias for older generated apps. */
window.Remiix = window.Abblet;

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
      clearPermissionTried();
      clearSyncTried();
    }
  } catch {
    // Permission code exchange failed — app still loads without token.
  }
}

if (ensurePermissions()) {
  // Navigating to permission request — do not mount the app on this document.
  await new Promise(() => {});
}

window.addEventListener("online", () => {
  if (!needsRuntimePermission) return;
  if (readStoredToken()) return;
  clearPermissionTried();
  if (ensurePermissions()) return;
});

const boot = document.getElementById("boot");
try {
  await import("/module.js");
  // Module mounts into #mount; clear boot if still present.
  boot?.remove();
} catch (err) {
  console.error("[Abblet] Failed to load app module:", err);
  if (boot) {
    boot.textContent = lang === "fi" ? "Lataus epäonnistui — napauta uudelleen" : "Failed to load — tap to retry";
    boot.style.cursor = "pointer";
    boot.addEventListener("click", () => location.reload(), { once: true });
  }
}

mountAbbletPatch();

const PRECACHE_URLS = [
  "/",
  "/module.js",
  "/manifest.webmanifest",
  "/static/abblet-app.js",
  "/static/images/abblet-icon-light.svg",
  "/static/images/abblet.svg",
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

/** Navigated here from the Abblet platform (Store / Open / etc.). */
function cameFromPlatform() {
  const key = "abblet.fromPlatform:" + appSlug;
  const legacyKey = "remiix.fromPlatform:" + appSlug;
  try {
    if (sessionStorage.getItem(key) === "1") return true;
    if (sessionStorage.getItem(legacyKey) === "1") {
      sessionStorage.setItem(key, "1");
      sessionStorage.removeItem(legacyKey);
      return true;
    }
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
 * If the user opened the app from the Abblet PWA/site while still in standalone
 * chrome, Install should still be offered for this app.
 */
function isThisAppInstalledPwa() {
  if (!isStandaloneDisplay()) return false;
  if (cameFromPlatform()) return false;
  return true;
}

/** Abblet badge — remix, share, about, optional Install. */
function mountAbbletPatch() {
  if (document.getElementById("abblet-patch")) return;

  const t = uiCopy();
  const storeHref = platformOrigin + catalogAppPath;
  const aboutHref = platformOrigin + "/" + lang + "/";
  const createHref = platformOrigin + "/" + lang + "/create/" + encodeURIComponent(appSlug);
  const shareUrl = location.href;
  const canOfferInstall = !isThisAppInstalledPwa();
  let deferredPrompt = null;

  const appLetter = escapeHtml((appTitle.trim().charAt(0) || "?").toUpperCase());
  const appIconHtml = appIconSrc
    ? `<img class="abblet-patch-app-icon" src="${escapeHtml(appIconSrc)}" alt="" width="40" height="40" decoding="async" />`
    : `<span class="abblet-patch-app-letter" aria-hidden="true">${appLetter}</span>`;

  const shareIconSvg =
    '<svg class="abblet-patch-share-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' +
    '<path d="M229.66,109.66l-48,48a8,8,0,0,1-11.32-11.32L204.69,112H165a88,88,0,0,0-85.23,66,8,8,0,0,1-15.5-4A103.94,103.94,0,0,1,165,96h39.71L170.34,61.66a8,8,0,0,1,11.32-11.32l48,48A8,8,0,0,1,229.66,109.66ZM192,208H40V88a8,8,0,0,0-16,0V216a8,8,0,0,0,8,8H192a8,8,0,0,0,0-16Z"/>' +
    "</svg>";

  const appIdentityHtml = `
      ${appIconHtml}
      <div class="abblet-patch-app-text">
        <strong class="abblet-patch-app-name">${escapeHtml(appTitle)}</strong>
      </div>`;

  const menuItems = [];
  menuItems.push(`
    <div class="abblet-patch-app" data-abblet-app>
      <a class="abblet-patch-app-link" href="${escapeHtml(storeHref)}" data-abblet-store>
        ${appIdentityHtml}
      </a>
      <button type="button" class="abblet-patch-share" data-abblet-share aria-label="${escapeHtml(t.share)}">
        ${shareIconSvg}
        <span class="abblet-patch-share-label" data-abblet-share-label>${escapeHtml(t.share)}</span>
      </button>
    </div>
  `);
  menuItems.push(`
    <div class="abblet-patch-actions">
      <a role="menuitem" class="abblet-patch-action" href="${escapeHtml(createHref)}" data-abblet-remix>${t.remix}</a>
      ${
        canOfferInstall
          ? `<button type="button" role="menuitem" class="abblet-patch-action abblet-patch-primary" data-abblet-install>${t.install}</button>`
          : ""
      }
    </div>
    <div class="abblet-patch-perms" data-abblet-perms hidden>
      <p class="abblet-patch-perms-heading">${escapeHtml(t.permissions)}</p>
      <div class="abblet-patch-perms-list" data-abblet-perms-list></div>
    </div>
    <a class="abblet-patch-footer" role="menuitem" href="${escapeHtml(aboutHref)}" data-abblet-footer aria-label="Abblet">
      <img class="abblet-patch-wordmark" src="/static/images/abblet.svg" alt="" width="120" height="25" decoding="async" />
    </a>
  `);

  const root = document.createElement("div");
  root.id = "abblet-patch";
  root.innerHTML = `
    <button type="button" class="abblet-patch-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${t.patchAria}">
      <span class="abblet-patch-face">
        <img class="abblet-patch-mark" src="/static/images/abblet-icon-light.svg" width="52" height="52" alt="" draggable="false" />
        <span class="abblet-patch-dot" data-abblet-install-dot hidden aria-hidden="true"></span>
      </span>
    </button>
    <div class="abblet-patch-menu" role="menu" hidden>
      ${menuItems.join("")}
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #abblet-patch {
      position: fixed;
      z-index: 2147483646;
      right: calc(16px + env(safe-area-inset-right, 0px));
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      font-family: "Geist", -apple-system, "SF Pro Text", system-ui, sans-serif;
    }
    #abblet-patch .abblet-patch-btn {
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
    #abblet-patch .abblet-patch-btn:hover {
      transform: scale(1.06) translateY(-1px);
      filter: brightness(1.02);
    }
    #abblet-patch .abblet-patch-btn:active {
      transform: scale(0.98);
    }
    #abblet-patch .abblet-patch-face {
      position: relative;
      display: block;
      width: 52px;
      height: 52px;
      border-radius: 22%;
      box-shadow: 0 10px 28px rgba(15, 20, 25, 0.14);
    }
    #abblet-patch .abblet-patch-mark {
      display: block;
      width: 52px;
      height: 52px;
      border-radius: 22%;
      pointer-events: none;
      user-select: none;
    }
    #abblet-patch .abblet-patch-dot {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #6366f1;
      box-shadow: 0 0 0 2px #ffffff;
      animation: abblet-patch-dot-pulse 2s ease-in-out infinite;
    }
    #abblet-patch .abblet-patch-dot[hidden] {
      display: none;
      animation: none;
    }
    @keyframes abblet-patch-dot-pulse {
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
      #abblet-patch .abblet-patch-dot {
        animation: none;
      }
    }
    #abblet-patch .abblet-patch-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + 10px);
      min-width: 16rem;
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
      gap: 0;
    }
    #abblet-patch .abblet-patch-menu[hidden] {
      display: none;
    }
    #abblet-patch .abblet-patch-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 2px 0 0;
      padding: 8px 4px 8px;
      border-top: 1px solid #ebebeb;
    }
    #abblet-patch .abblet-patch-action {
      appearance: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 0.7rem 0.85rem;
      border: 1px solid #e5e5e5;
      border-radius: 11px;
      background: #f5f5f5;
      color: #0a0a0a;
      text-align: center;
      text-decoration: none;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 650;
      letter-spacing: -0.02em;
      line-height: 1.2;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }
    #abblet-patch .abblet-patch-action:hover {
      background: #ececef;
      border-color: #dcdce0;
    }
    #abblet-patch .abblet-patch-action.abblet-patch-primary {
      border-color: transparent;
      background: #6366f1;
      color: #ffffff;
    }
    #abblet-patch .abblet-patch-action.abblet-patch-primary:hover {
      background: #4f46e5;
      border-color: transparent;
      filter: none;
    }
    #abblet-patch .abblet-patch-perms {
      margin: 0;
      padding: 8px 6px 6px;
      border-top: 1px solid #ebebeb;
    }
    #abblet-patch .abblet-patch-perms[hidden] {
      display: none;
    }
    #abblet-patch .abblet-patch-perms-heading {
      margin: 0 0 6px;
      padding: 0 4px;
      font-size: 0.625rem;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #737373;
    }
    #abblet-patch .abblet-patch-perms-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    #abblet-patch .abblet-patch-perm {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      background: #f5f5f5;
      border: 1px solid #ebebeb;
      min-width: 0;
    }
    #abblet-patch .abblet-patch-perm-meta {
      display: flex;
      flex-direction: row;
      align-items: baseline;
      gap: 0.35rem;
      min-width: 0;
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 0.75rem;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
    }
    #abblet-patch .abblet-patch-perm-name {
      font-weight: 700;
      color: #0a0a0a;
      letter-spacing: -0.02em;
      flex: none;
    }
    #abblet-patch .abblet-patch-perm-budget {
      color: #737373;
      font-weight: 550;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #abblet-patch .abblet-patch-perm-budget::before {
      content: "·";
      margin-right: 0.35rem;
      color: #a3a3a3;
    }
    #abblet-patch .abblet-patch-perm-revoke {
      appearance: none;
      flex: none;
      margin: 0;
      padding: 0.3rem 0.5rem;
      border: 1px solid #e5e5e5;
      border-radius: 7px;
      background: #ffffff;
      color: #525252;
      font: inherit;
      font-size: 0.625rem;
      font-weight: 650;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }
    #abblet-patch .abblet-patch-perm-revoke:hover {
      background: #fafafa;
      border-color: #d4d4d4;
      color: #0a0a0a;
    }
    #abblet-patch .abblet-patch-perm-revoke:disabled {
      opacity: 0.55;
      cursor: wait;
    }
    #abblet-patch .abblet-patch-perms-empty {
      margin: 0;
      padding: 4px;
      font-size: 0.75rem;
      color: #a3a3a3;
    }
    #abblet-patch .abblet-patch-footer {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin: 0;
      padding: 10px 10px 8px;
      border-top: 1px solid #ebebeb;
      border-radius: 0 0 10px 10px;
      background: transparent;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
      transition: background 0.12s ease;
    }
    #abblet-patch .abblet-patch-footer:hover {
      background: #fafafa;
    }
    #abblet-patch .abblet-patch-footer .abblet-patch-wordmark {
      display: block;
      flex: none;
      height: 0.8rem;
      width: auto;
      max-width: 5.75rem;
      opacity: 0.45;
      transition: opacity 0.15s ease;
    }
    #abblet-patch .abblet-patch-footer:hover .abblet-patch-wordmark {
      opacity: 0.75;
    }
    #abblet-patch .abblet-patch-actions .abblet-patch-action[hidden],
    #abblet-patch .abblet-patch-menu [data-abblet-install][hidden],
    #abblet-patch .abblet-patch-menu [data-abblet-remix][hidden] {
      display: none;
    }
    #abblet-patch .abblet-patch-app {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 8px 10px 8px;
      border: none;
      min-width: 0;
    }
    #abblet-patch .abblet-patch-app-link {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    #abblet-patch .abblet-patch-app-link:hover .abblet-patch-app-name {
      color: #4f46e5;
    }
    #abblet-patch .abblet-patch-app-icon {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      object-fit: cover;
      background: #f0f0f0;
    }
    #abblet-patch .abblet-patch-app-letter {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #e8e8ed;
      color: #1c1c1e;
      font-size: 1.05rem;
      font-weight: 750;
      letter-spacing: -0.03em;
    }
    #abblet-patch .abblet-patch-app-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    #abblet-patch .abblet-patch-app-name {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 750;
      letter-spacing: -0.03em;
      line-height: 1.25;
      color: #0a0a0a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #abblet-patch .abblet-patch-share {
      appearance: none;
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      margin: 0;
      padding: 4px 6px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: #4f46e5;
      cursor: pointer;
      font: inherit;
      line-height: 1;
      min-width: 2.75rem;
    }
    #abblet-patch .abblet-patch-share:hover {
      background: #f5f5f5;
      color: #4338ca;
    }
    #abblet-patch .abblet-patch-share-icon {
      display: block;
      width: 1.25rem;
      height: 1.25rem;
    }
    #abblet-patch .abblet-patch-share-label {
      font-size: 0.625rem;
      font-weight: 650;
      letter-spacing: -0.01em;
      line-height: 1;
      color: inherit;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const btn = root.querySelector(".abblet-patch-btn");
  const menu = root.querySelector(".abblet-patch-menu");
  const installBtn = root.querySelector("[data-abblet-install]");
  const remixBtn = root.querySelector("[data-abblet-remix]");
  const shareBtn = root.querySelector("[data-abblet-share]");
  const shareLabel = root.querySelector("[data-abblet-share-label]");
  const actionDot = root.querySelector("[data-abblet-install-dot]");
  const permsSection = root.querySelector("[data-abblet-perms]");
  const permsList = root.querySelector("[data-abblet-perms-list]");
  let autoUpdating = false;
  let permsLoading = false;
  let revokeBusy = false;

  function formatUsd(n) {
    const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
    return "$" + (Math.round(v * 100) / 100).toFixed(2);
  }

  function scopeLabel(scope) {
    if (scope === "ai") return t.permissionAi;
    if (scope === "sync") return t.permissionSync;
    return String(scope);
  }

  function renderPermissionGrants(grants) {
    if (!permsSection || !permsList) return;
    const list = Array.isArray(grants) ? grants : [];
    if (list.length === 0) {
      permsSection.hidden = true;
      permsList.innerHTML = "";
      return;
    }
    permsSection.hidden = false;
    permsList.innerHTML = list
      .map((g) => {
        const scope = typeof g.scope === "string" ? g.scope : "";
        const budget =
          scope === "ai"
            ? t.permissionBudget
                .replace("$spent", formatUsd(g.periodSpentUsd))
                .replace("$limit", formatUsd(g.monthlyLimitUsd))
            : "";
        return `
        <div class="abblet-patch-perm" data-scope="${escapeHtml(scope)}">
          <div class="abblet-patch-perm-meta">
            <span class="abblet-patch-perm-name">${escapeHtml(scopeLabel(scope))}</span>${
              budget
                ? `<span class="abblet-patch-perm-budget" aria-label="${escapeHtml(budget)}">${escapeHtml(budget)}</span>`
                : ""
            }
          </div>
          <button type="button" class="abblet-patch-perm-revoke" data-abblet-revoke="${escapeHtml(scope)}">
            ${escapeHtml(t.revoke)}
          </button>
        </div>`;
      })
      .join("");
  }

  async function loadPermissionGrants() {
    if (!permsSection || !permsList || permsLoading) return;
    const token = readStoredToken()?.accessToken;
    if (!token) {
      renderPermissionGrants([]);
      return;
    }
    permsLoading = true;
    try {
      const res = await fetch(platformOrigin + "/api/sdk/permissions", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        clearStoredToken();
        renderPermissionGrants([]);
        return;
      }
      if (!data.success) {
        renderPermissionGrants([]);
        return;
      }
      renderPermissionGrants(data.data?.grants);
    } catch {
      // Offline / network — keep previous or hide.
    } finally {
      permsLoading = false;
    }
  }

  async function revokePermission(scope) {
    if (revokeBusy || !scope) return;
    const token = readStoredToken()?.accessToken;
    if (!token) {
      renderPermissionGrants([]);
      return;
    }
    revokeBusy = true;
    const btnEl =
      permsList &&
      Array.from(permsList.querySelectorAll("[data-abblet-revoke]")).find(
        (el) => el.getAttribute("data-abblet-revoke") === scope,
      );
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = t.revoking;
    }
    try {
      const res = await fetch(platformOrigin + "/api/sdk/permissions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = t.revoke;
        }
        return;
      }
      clearStoredToken();
      clearPermissionTried();
      clearSyncTried();
      renderPermissionGrants(data.data?.grants);
      closeMenu();
      if (
        (scope === "ai" && needsAiPermission) ||
        (scope === "sync" && needsSyncPermission)
      ) {
        promptForPermission();
      }
    } catch {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = t.revoke;
      }
    } finally {
      revokeBusy = false;
    }
  }

  function closeMenu() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    void loadPermissionGrants();
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
      sessionStorage.removeItem("abblet.fromPlatform:" + appSlug);
      sessionStorage.removeItem("remiix.fromPlatform:" + appSlug);
    } catch {
      // ignore
    }
    syncActionDot();
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
      if (shareLabel) {
        const prev = shareLabel.textContent;
        shareLabel.textContent = t.shareCopied;
        window.setTimeout(() => {
          shareLabel.textContent = prev;
        }, 1600);
      }
    } catch {
      // ignore
    }
    closeMenu();
  }

  /**
   * Refresh offline cache when module.js changed. Do NOT reload here —
   * network-first already serves fresh code when online; a cold-start reload
   * races with SW claim and leaves installed PWAs on a blank white screen.
   */
  async function applyUpdateQuietly() {
    if (autoUpdating || navigator.onLine === false) return;
    if (!("serviceWorker" in navigator)) return;
    autoUpdating = true;
    try {
      const reg = await navigator.serviceWorker.ready;
      const worker = reg.active || navigator.serviceWorker.controller;
      if (!worker) return;
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
    } catch {
      // ignore
    } finally {
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
      closeMenu();
    });
  }

  syncActionDot();

  if (shareBtn) {
    shareBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void shareApp();
    });
  }

  if (permsList) {
    permsList.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const revokeBtn = target.closest("[data-abblet-revoke]");
      if (!revokeBtn) return;
      e.stopPropagation();
      const scope = revokeBtn.getAttribute("data-abblet-revoke");
      if (scope) void revokePermission(scope);
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
        void applyUpdateQuietly();
      }
    });
    // Delay past cold-start SW registration / precache races.
    window.setTimeout(requestUpdateCheck, 20_000);
    window.addEventListener("online", () => {
      window.setTimeout(requestUpdateCheck, 5_000);
    });
  }
}
