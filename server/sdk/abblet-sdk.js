/**
 * Rmix app-runtime SDK — inlined into the app page HTML by server/routes/app-page.ts.
 * Expects window.__ABBLET__ = { appSlug, platformOrigin, connectHref, tagName, moduleUrl, lang, published, title }.
 * Mounts the corner Rmix Patch (share/store if published + edit + about) after the app loads.
 */
const cfg = window.__ABBLET__;
const appSlug = cfg.appSlug;
const platformOrigin = cfg.platformOrigin;
const connectHref = cfg.connectHref;
const tagName = cfg.tagName;
const moduleUrl = cfg.moduleUrl;
const lang = cfg.lang || "en";
const published = cfg.published === true;
const appTitle = typeof cfg.title === "string" && cfg.title.trim() ? cfg.title.trim() : "Rmix";

const TOKEN_KEY = "abblet.token";
const TOKEN_EXP_KEY = "abblet.tokenExpiresAt";

const COPY = {
  en: {
    title: "Use AI with your Rmix account",
    body: "This app needs AI. It will use your Rmix account — AI credits and usage are charged to you, not the app creator.",
    continue: "Continue",
    cancel: "Cancel",
    offlineTitle: "You're offline",
    offlineBody: "AI needs an internet connection. Your app data still works offline.",
    offlineOk: "OK",
    patchAria: "Rmix",
    share: "Share",
    shareCopied: "Link copied",
    store: "View in Store",
    edit: "Edit app",
    about: "About Rmix",
    update: "Update",
    updating: "Updating…",
  },
  fi: {
    title: "Käytä tekoälyä Rmix-tililläsi",
    body: "Tämä appi tarvitsee tekoälyä. Se käyttää Rmix-tiliäsi — AI-creditit ja käyttö veloitetaan sinulta, ei appin tekijältä.",
    continue: "Jatka",
    cancel: "Peruuta",
    offlineTitle: "Olet offline",
    offlineBody: "Tekoäly tarvitsee nettiyhteyden. Appisi data toimii silti offline.",
    offlineOk: "OK",
    patchAria: "Rmix",
    share: "Jaa",
    shareCopied: "Linkki kopioitu",
    store: "Näytä Storessa",
    edit: "Muokkaa appia",
    about: "Tietoa Rmixistä",
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
    const existing = document.getElementById("abblet-connect-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "abblet-connect-dialog";
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

window.Rmix = {
  appSlug,
  platformOrigin,
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

/** Backward-compatible alias for apps generated against Abblet.ai(). */
window.Abblet = window.Rmix;

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

const mount = document.getElementById("mount");
await import(moduleUrl);
mount.appendChild(document.createElement(tagName));

mountRmixPatch();

const PRECACHE_URLS = ["/", "/module.js", "/manifest.webmanifest"];

/** Rmix Patch — share + store (if published), edit, about, optional Update. */
function mountRmixPatch() {
  if (document.getElementById("abblet-patch")) return;

  const t = uiCopy();
  const storeHref = platformOrigin + "/" + lang + "/store/" + encodeURIComponent(appSlug);
  const editHref = platformOrigin + "/" + lang + "/edit/" + encodeURIComponent(appSlug);
  const aboutHref = platformOrigin + "/" + lang + "/about";

  const menuItems = [];
  menuItems.push(
    `<button type="button" role="menuitem" data-abblet-update hidden>${t.update || "Update"}</button>`,
  );
  if (published) {
    menuItems.push(`<button type="button" role="menuitem" data-abblet-share>${t.share}</button>`);
    menuItems.push(`<a role="menuitem" href="${storeHref}">${t.store}</a>`);
  }
  menuItems.push(`<a role="menuitem" href="${editHref}">${t.edit}</a>`);
  menuItems.push(`<a role="menuitem" href="${aboutHref}">${t.about}</a>`);

  const root = document.createElement("div");
  root.id = "abblet-patch";
  root.innerHTML = `
    <button type="button" class="abblet-patch-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${t.patchAria}">
      <span class="abblet-patch-label">
        <span class="abblet-patch-word">Rmix</span>
        <span class="abblet-patch-dot" data-abblet-update-dot hidden aria-hidden="true"></span>
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
      right: calc(10px + env(safe-area-inset-right, 0px));
      bottom: 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    }
    #abblet-patch .abblet-patch-btn {
      appearance: none;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: block;
      filter: drop-shadow(-2px -2px 6px rgba(40, 30, 20, 0.16));
      transition: filter 0.15s ease;
    }
    #abblet-patch .abblet-patch-btn:hover {
      filter: drop-shadow(-3px -3px 8px rgba(40, 30, 20, 0.22));
    }
    #abblet-patch .abblet-patch-label {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 14px 10px 16px;
      border-radius: 6px 6px 0 0;
      color: #2a241c;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.2), transparent 42%),
        repeating-linear-gradient(
          90deg,
          #ebe3d4 0px,
          #ebe3d4 1px,
          #e4dccb 1px,
          #e4dccb 2px
        ),
        linear-gradient(135deg, #f0e8d8 0%, #e6ddcc 48%, #ddd3c0 100%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.4),
        inset 1px 0 0 rgba(255, 255, 255, 0.15),
        -1px -1px 0 rgba(90, 70, 40, 0.14);
      outline: 1px dashed rgba(70, 55, 35, 0.26);
      outline-offset: -4px;
      clip-path: inset(0 0 0 0);
    }
    #abblet-patch .abblet-patch-word {
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      line-height: 1;
      color: #2a241c;
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
    }
    #abblet-patch .abblet-patch-dot {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #007aff;
      box-shadow: 0 0 0 2px rgba(240, 232, 216, 0.95);
    }
    #abblet-patch .abblet-patch-dot[hidden] {
      display: none;
    }
    #abblet-patch .abblet-patch-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + 8px);
      min-width: 11.5rem;
      padding: 6px;
      border-radius: 3px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.35), transparent 35%),
        #f4eee3;
      box-shadow:
        0 0 0 1px rgba(90, 70, 40, 0.16),
        0 10px 28px rgba(40, 30, 20, 0.18);
      outline: 1px dashed rgba(70, 55, 35, 0.22);
      outline-offset: -4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
    }
    #abblet-patch .abblet-patch-menu[hidden] {
      display: none;
    }
    #abblet-patch .abblet-patch-menu a,
    #abblet-patch .abblet-patch-menu button {
      appearance: none;
      display: block;
      width: 100%;
      margin: 0;
      padding: 10px 12px;
      border: none;
      border-radius: 2px;
      background: transparent;
      color: #2a241c;
      text-align: left;
      text-decoration: none;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.25;
      cursor: pointer;
    }
    #abblet-patch .abblet-patch-menu a:hover,
    #abblet-patch .abblet-patch-menu button:hover {
      background: rgba(90, 70, 40, 0.08);
    }
    #abblet-patch .abblet-patch-menu [data-abblet-update] {
      color: #007aff;
    }
    #abblet-patch .abblet-patch-menu [data-abblet-update][hidden] {
      display: none;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const btn = root.querySelector(".abblet-patch-btn");
  const menu = root.querySelector(".abblet-patch-menu");
  const shareBtn = root.querySelector("[data-abblet-share]");
  const updateBtn = root.querySelector("[data-abblet-update]");
  const updateDot = root.querySelector("[data-abblet-update-dot]");

  function closeMenu() {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }

  function setUpdateAvailable(available) {
    if (updateBtn) updateBtn.hidden = !available;
    if (updateDot) updateDot.hidden = !available;
  }

  async function shareApp() {
    const shareData = { title: appTitle, url: storeHref, text: appTitle };
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
      await navigator.clipboard.writeText(storeHref);
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
