/**
 * Abblet app-runtime SDK — inlined into the app page HTML by server/routes/app-page.ts.
 * Expects window.__ABBLET__ = { appSlug, platformOrigin, connectHref, tagName, moduleUrl, lang }.
 */
const cfg = window.__ABBLET__;
const appSlug = cfg.appSlug;
const platformOrigin = cfg.platformOrigin;
const connectHref = cfg.connectHref;
const tagName = cfg.tagName;
const moduleUrl = cfg.moduleUrl;
const lang = cfg.lang || "en";

const TOKEN_KEY = "abblet.token";
const TOKEN_EXP_KEY = "abblet.tokenExpiresAt";

const COPY = {
  en: {
    title: "Use AI with your Abblet account",
    body: "This app needs AI. It will use your Abblet account — AI credits and usage are charged to you, not the app creator.",
    continue: "Continue",
    cancel: "Cancel",
  },
  fi: {
    title: "Käytä tekoälyä Abblet-tililläsi",
    body: "Tämä appi tarvitsee tekoälyä. Se käyttää Abblet-tiliäsi — AI-creditit ja käyttö veloitetaan sinulta, ei appin tekijältä.",
    continue: "Jatka",
    cancel: "Peruuta",
  },
};

function connectCopy() {
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

window.Abblet = {
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
    const res = await fetch(platformOrigin + "/api/sdk/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
    });
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
