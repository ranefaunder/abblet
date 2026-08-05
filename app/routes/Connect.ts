import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import { getCurrentUser, isLoggedIn } from "/app/stores/userStore";
import { openAppUrl } from "/utils/app-url";
import {
  clearStoreApp,
  loadStoreApp,
  openFromStore,
  storeApp,
  storeAppError,
  storeAppLoading,
} from "/app/stores/storeListingStore";

export const ConnectPath = "/:lang/connect/:appId" as const;

/**
 * Connect consent page (SPA). The actual connect action stays on the server
 * (`/connect/:appId` mints the one-time code); this page is only the consent UI,
 * shown when the server sees no prior grant. "Connect" goes through
 * `prepare-open` so the click itself is the consent (one-time nonce).
 */
export default function Connect({ params }: RoutePropsForPath<typeof ConnectPath>) {
  const { route } = useLocation();
  const lang = params.lang ?? "en";
  const appId = params.appId ?? "";
  const registered = isLoggedIn();
  const user = getCurrentUser();
  const app = storeApp.value;
  const loading = storeAppLoading.value;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!registered) {
      const next = `/${lang}/connect/${encodeURIComponent(appId)}`;
      route(`/${lang}/login?next=${encodeURIComponent(next)}`, true);
    }
  }, [registered, lang, appId, route]);

  useEffect(() => {
    if (appId) void loadStoreApp(appId);
    return () => clearStoreApp();
  }, [appId]);

  if (!registered) return null;

  const appParam = app
    ? {
        id: app.id,
        slug: app.slug,
        visibility: app.visibility,
        publishedVersionId: app.publishedVersionId,
      }
    : undefined;
  const cancelHref = openAppUrl(lang, appId, { app: appParam });
  const iconSrc = appIconSrc(app?.iconId);
  const gradient = previewGradient(appId);
  const letter = draftLetter(app?.title ?? "?");

  async function onConnect() {
    if (busy) return;
    setBusy(true);
    await openFromStore(appId, appParam);
    // Navigation away is in progress; keep busy until the page unloads.
  }

  const view = html`
    <div data-scope="Connect" ui-column="gap-lg x-center y-center">
      ${loading && !app
        ? html`
          <div ui-column="gap-md x-center" class="state">
            <i ui-icon="spinner lg"></i>
            <p>${t("Loading…")}</p>
          </div>`
        : !app
          ? html`
            <div ui-column="gap-md x-center" class="state">
              <p>${storeAppError.value ?? t("App not found")}</p>
            </div>`
          : html`
            <div class="card" ui-card ui-shadow="lg">
              <div ui-column="gap-lg x-center">
                <div class="hero" ui-row="gap-md y-center" aria-hidden="true">
                  <span class="tile" style=${iconSrc ? "" : `background: ${gradient}`}>
                    ${iconSrc
                      ? html`<img src=${iconSrc} alt="" width="72" height="72" decoding="async" />`
                      : html`<span>${letter}</span>`}
                  </span>
                  <span class="link-dots">···</span>
                  <span class="tile tile-remiix">R</span>
                </div>
                <div ui-column="gap-xs x-center">
                  <h1 ui-heading="lg" class="title">${app.title}</h1>
                  <p class="muted">${t("wants to connect to your Remiix account")}</p>
                  ${user ? html`<p class="email"><strong>${user.email}</strong></p>` : ""}
                </div>
                <div class="perms" ui-column="gap-sm">
                  <p class="perm-heading">${t("This allows the app to")}</p>
                  <div ui-row="gap-sm y-center">
                    <i class="perm-icon" ui-icon="wallet" aria-hidden="true"></i>
                    <span>${t("Use your AI credit for its AI features")}</span>
                  </div>
                  <div ui-row="gap-sm y-center">
                    <i class="perm-icon" ui-icon="git-fork" aria-hidden="true"></i>
                    <span>${t("Create remixes into your library")}</span>
                  </div>
                </div>
                <div class="actions" ui-column="gap-sm">
                  <button
                    type="button"
                    ui-button="primary block lg"
                    disabled=${busy}
                    aria-busy=${busy}
                    onClick=${() => void onConnect()}
                  >${t("Connect")}</button>
                  <a href=${cancelHref} ui-button="tertiary block">${t("Not now")}</a>
                </div>
                <p class="once-note">${t("You'll only be asked once for this app.")}</p>
              </div>
            </div>`}
    </div>
  `;

  const style = css`
    @scope ([data-scope="Connect"]) to ([data-scope]) {
      & {
        flex: 1;
        min-height: 0;
        padding: 1.5rem 1rem;
        box-sizing: border-box;
      }

      .state {
        color: var(--neutral-500);
        text-align: center;
      }

      .card {
        width: 100%;
        max-width: 26rem;
        box-sizing: border-box;
      }

      .tile {
        width: 72px;
        height: 72px;
        border-radius: 18px;
        overflow: hidden;
        display: grid;
        place-items: center;
        color: var(--white);
        font-size: 1.75rem;
        font-weight: 750;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      }

      .tile img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .tile-remiix {
        background: var(--primary-600);
        font-weight: 800;
      }

      .link-dots {
        color: var(--neutral-400);
        letter-spacing: 0.35em;
        font-weight: 700;
        user-select: none;
      }

      .title {
        margin: 0;
        text-align: center;
      }

      .muted {
        margin: 0;
        text-align: center;
        color: var(--neutral-500);
      }

      .email {
        margin: 0;
        text-align: center;
      }

      .perms {
        width: 100%;
        padding: 1rem;
        border-radius: 0.9rem;
        background: color-mix(in oklab, var(--neutral-100) 65%, var(--white));
        box-sizing: border-box;
      }

      .perm-heading {
        margin: 0 0 0.25rem;
        font-size: 0.8125rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .perm-icon {
        color: var(--primary-600);
        flex: none;
      }

      .actions {
        width: 100%;
      }

      .once-note {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--neutral-400);
        text-align: center;
      }
    }
  `;

  return [view, style];
}
