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
    title: "Use AI with your Remiix account",
    body: "This app needs AI. It will use your Remiix account — AI credits and usage are charged to you, not the app creator.",
    continue: "Continue",
    cancel: "Cancel",
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
    update: "Update",
    updating: "Updating…",
  },
  fi: {
    title: "Käytä tekoälyä Remiix-tililläsi",
    body: "Tämä app tarvitsee tekoälyä. Se käyttää Remiix-tiliäsi — AI-creditit ja käyttö veloitetaan sinulta, ei appin tekijältä.",
    continue: "Jatka",
    cancel: "Peruuta",
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
    update: "Päivitä",
    updating: "Päivitetään…",
  },
};

function connectCopy() {
  return COPY[lang] || COPY.en;
}

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

/** Explain credits, then redirect to /connect/{slug}. Resolves true if continuing. */
function confirmConnect() {
  const t = connectCopy();
  return new Promise((resolve) => {
    const existing = document.getElementById("remiix-connect-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "remiix-connect-dialog";
    dialog.setAttribute("closedby", "any");
    dialog.innerHTML = `
      <form method="dialog" style="margin:0;display:flex;flex-direction:column;gap:16px;min-width:min(100%,320px)">
        <h2 style="margin:0;font-size:1.125rem;font-weight:600;line-height:1.3">${t.title}</h2>
        <p style="margin:0;font-size:0.9375rem;line-height:1.45;color:#3c3c4399">${t.body}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button value="cancel" type="submit" style="appearance:none;border:none;background:#e5e5ea;color:#000;font:inherit;font-weight:500;padding:10px 16px;border-radius:10px;cursor:pointer">${t.cancel}</button>
          <button value="continue" type="submit" style="appearance:none;border:none;background:#007aff;color:#fff;font:inherit;font-weight:500;padding:10px 16px;border-radius:10px;cursor:pointer">${t.continue}</button>
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
  const t = connectCopy();
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
      const ok = await confirmConnect();
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
      const err = new Error(data.error?.code || "AI_ERROR");
      err.code = data.error?.code || "AI_ERROR";
      throw err;
    }
    return data.data.text;
  },
};

/** Platform cookie session (same user as remiix.app /user/me) + ownership for this app. */
async function loadPlatformSession() {
  if (isProbablyOffline()) return null;
  try {
    const res = await fetch(platformOrigin + "/api/sdk/session", {
      method: "GET",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!data.success || !data.data) return null;
    const session = {
      user: data.data.user ?? null,
      isOwner: data.data.isOwner === true,
      published: data.data.published === true,
    };
    window.Remiix.user = session.user;
    window.Remiix.isOwner = session.isOwner;
    return session;
  } catch {
    return null;
  }
}

const sessionPromise = loadPlatformSession();



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

const platformSession = await sessionPromise;

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
  const storeHref = platformOrigin + "/" + lang + "/store/" + encodeURIComponent(appSlug);
  const editHref = platformOrigin + "/" + lang + "/edit/" + encodeURIComponent(appSlug);
  const aboutHref = platformOrigin + "/" + lang + "/";
  const shareUrl = published ? storeHref : location.origin + "/";
  const canOfferInstall = !isThisAppInstalledPwa();
  let deferredPrompt = null;

  const loggedIn = session?.user != null;
  const isOwner = session?.isOwner === true;
  // Guests / failed cookie: keep Edit so owners can still reach the editor.
  // Signed-in non-owners get Remix instead.
  const showEdit = isOwner || !loggedIn;
  const showRemix = loggedIn && !isOwner;

  const menuItems = [];
  if (showEdit) {
    menuItems.push(`<a role="menuitem" href="${editHref}" data-remiix-edit>${t.edit}</a>`);
  }
  if (showRemix) {
    menuItems.push(
      `<button type="button" role="menuitem" data-remiix-remix>${t.remix}</button>`,
    );
  }
  menuItems.push(`<button type="button" role="menuitem" data-remiix-share>${t.share}</button>`);
  menuItems.push(`<a role="menuitem" href="${storeHref}">${t.store}</a>`);
  menuItems.push(`<a role="menuitem" href="${aboutHref}">${t.about}</a>`);
  menuItems.push(
    `<button type="button" role="menuitem" data-remiix-update class="remiix-patch-primary" hidden>${t.update || "Update"}</button>`,
  );
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
        <span class="remiix-patch-dot" data-remiix-update-dot hidden aria-hidden="true"></span>
      </span>
    </button>
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
    #remiix-patch .remiix-patch-menu [data-remiix-install][hidden],
    #remiix-patch .remiix-patch-menu [data-remiix-update][hidden] {
      display: none;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const btn = root.querySelector(".remiix-patch-btn");
  const menu = root.querySelector(".remiix-patch-menu");
  const installBtn = root.querySelector("[data-remiix-install]");
  const remixBtn = root.querySelector("[data-remiix-remix]");
  const shareBtn = root.querySelector("[data-remiix-share]");
  const updateBtn = root.querySelector("[data-remiix-update]");
  const actionDot = root.querySelector("[data-remiix-update-dot]");

  function closeMenu() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }

  function isMenuActionVisible(el) {
    return !!(el && !el.hidden);
  }

  function syncActionDot() {
    if (!actionDot) return;
    actionDot.hidden = !(isMenuActionVisible(updateBtn) || isMenuActionVisible(installBtn));
  }

  function setUpdateAvailable(available) {
    if (updateBtn) updateBtn.hidden = !available;
    syncActionDot();
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
    if (!window.Remiix.user) {
      location.href = storeHref;
      return;
    }
    remixBtn.disabled = true;
    const prev = remixBtn.textContent;
    remixBtn.textContent = t.remixing || "Remixing…";
    try {
      const res = await fetch(platformOrigin + "/api/sdk/remix", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || data.error?.code === "UNAUTHORIZED") {
        location.href = storeHref;
        return;
      }
      if (data.success && data.data?.slug) {
        location.href = platformOrigin + "/" + lang + "/edit/" + encodeURIComponent(data.data.slug);
        return;
      }
    } catch {
      // ignore — restore button
    }
    remixBtn.disabled = false;
    remixBtn.textContent = prev;
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

  async function applyUpdate() {
    if (!updateBtn || updateBtn.disabled) return;
    updateBtn.disabled = true;
    updateBtn.textContent = t.updating || "Updating…";
    try {
      if (!("serviceWorker" in navigator)) {
        location.reload();
        return;
      }
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
      updateBtn.disabled = false;
      updateBtn.textContent = t.update || "Update";
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

  if (updateBtn) {
    updateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void applyUpdate();
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
      if (event.data && event.data.type === "UPDATE_STATUS") {
        setUpdateAvailable(event.data.available === true);
      }
    });
    window.setTimeout(requestUpdateCheck, 1200);
    window.addEventListener("online", requestUpdateCheck);
  }
}
