import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import { getCurrentUser, isLoggedIn } from "/app/stores/userStore";
import { openAppUrl } from "/utils/app-url";
import { appNeedsAi, appNeedsAnyPermission, appNeedsSync } from "/utils/app-permissions";
import {
  clearStoreApp,
  loadStoreApp,
  openFromStore,
  storeApp,
  storeAppError,
  storeAppLoading,
} from "/app/stores/storeListingStore";

/** SPA path for the permission request UI (AI and/or sync). */
export const PermissionsPath = "/:lang/permission/:appId" as const;

/**
 * Permission request page (SPA). Shown when an app declares `ai` and/or `sync`
 * and the user has not granted those scopes yet. Allow goes through
 * prepare-open so the click itself is the grant (one-time nonce → runtime token).
 */
export default function Permissions({ params }: RoutePropsForPath<typeof PermissionsPath>) {
  const { route } = useLocation();
  const lang = params.lang ?? "en";
  const appId = params.appId ?? "";
  const registered = isLoggedIn();
  const user = getCurrentUser();
  const app = storeApp.value;
  const loading = storeAppLoading.value;
  const [busy, setBusy] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState("1.00");

  useEffect(() => {
    if (!registered) {
      const next = `/${lang}/permission/${encodeURIComponent(appId)}`;
      route(`/${lang}/login?next=${encodeURIComponent(next)}`, true);
    }
  }, [registered, lang, appId, route]);

  useEffect(() => {
    if (appId) void loadStoreApp(appId);
    return () => clearStoreApp();
  }, [appId]);

  useEffect(() => {
    if (!app || loading) return;
    if (!appNeedsAnyPermission(app.permissions)) {
      window.location.href = openAppUrl(lang, appId, {
        app: {
          id: app.id,
          slug: app.slug,
          visibility: app.visibility,
          publishedVersionId: app.publishedVersionId,
        },
      });
    }
  }, [app, loading, lang, appId]);

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
  const periodLabel = lang === "fi" ? "/ kk" : "/ mo";

  function parsedMonthlyLimit(): number {
    const n = Number(String(monthlyLimit).trim().replace(",", "."));
    if (!Number.isFinite(n)) return 1;
    return Math.min(100, Math.max(0.1, Math.round(n * 100) / 100));
  }

  async function onAllow() {
    if (busy) return;
    setBusy(true);
    await openFromStore(appId, appParam, { monthlyLimitUsd: parsedMonthlyLimit() });
  }

  const view = html`
    <div data-scope="Permissions" ui-column="gap-lg x-center y-center">
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
          : !appNeedsAnyPermission(app.permissions)
            ? html`
            <div ui-column="gap-md x-center" class="state">
              <i ui-icon="spinner lg"></i>
              <p>${t("Loading…")}</p>
            </div>`
          : html`
            <div class="card" ui-card ui-shadow="lg">
              <div ui-column="gap-md x-stretch">
                <header ui-column="gap-sm x-center" class="header">
                  <div class="hero" ui-row="gap-sm y-center" aria-hidden="true">
                    <span class="tile" style=${iconSrc ? "" : `background: ${gradient}`}>
                      ${iconSrc
                        ? html`<img src=${iconSrc} alt="" width="56" height="56" decoding="async" />`
                        : html`<span>${letter}</span>`}
                    </span>
                    <span class="link-dots" aria-hidden="true"></span>
                    <span class="tile tile-abblet">A</span>
                  </div>
                  <div ui-column="gap-xs x-center">
                    <h1 ui-heading="lg" class="title">${app.title}</h1>
                    <p class="lede">${
                      appNeedsAi(app.permissions) && appNeedsSync(app.permissions)
                        ? t("wants permission to use AI and sync data")
                        : appNeedsSync(app.permissions)
                          ? t("wants permission to sync data")
                          : t("wants permission to use AI")
                    }</p>
                    ${user ? html`<p class="email">${user.email}</p>` : ""}
                  </div>
                </header>

                <div class="panel" ui-column="gap-md">
                  ${appNeedsAi(app.permissions)
                    ? html`
                  <div ui-row="gap-sm y-start" class="perm-row">
                    <i class="perm-icon" ui-icon="wallet" aria-hidden="true"></i>
                    <p class="perm-copy">${t("Use your AI credit for its AI features")}</p>
                  </div>

                  <div ui-field class="budget-field">
                    <label for="ai-monthly-limit">${t("Monthly AI credit limit for this app")}</label>
                    <div class="budget-input">
                      <span class="budget-prefix" aria-hidden="true">$</span>
                      <input
                        type="number"
                        id="ai-monthly-limit"
                        name="monthlyLimit"
                        inputmode="decimal"
                        min="0.10"
                        max="100"
                        step="0.10"
                        value=${monthlyLimit}
                        onInput=${(e: Event) =>
                          setMonthlyLimit((e.currentTarget as HTMLInputElement).value)}
                      />
                      <span class="budget-suffix" aria-hidden="true">${periodLabel}</span>
                    </div>
                  </div>`
                    : ""}
                  ${appNeedsSync(app.permissions)
                    ? html`
                  <div ui-row="gap-sm y-start" class="perm-row">
                    <i class="perm-icon" ui-icon="arrows-clockwise" aria-hidden="true"></i>
                    <p class="perm-copy">${t("Keep this app's data in your Abblet cloud")}</p>
                  </div>`
                    : ""}
                </div>

                <div class="actions" ui-column="gap-sm">
                  <button
                    type="button"
                    ui-button="primary block lg"
                    disabled=${busy}
                    aria-busy=${busy}
                    onClick=${() => void onAllow()}
                  >${
                    appNeedsAi(app.permissions) && appNeedsSync(app.permissions)
                      ? t("Allow")
                      : appNeedsSync(app.permissions)
                        ? t("Allow Sync")
                        : t("Allow AI")
                  }</button>
                  <a href=${cancelHref} ui-button="tertiary block">${t("Not now")}</a>
                </div>

                <p class="once-note">${t("You'll only be asked once for this app.")}</p>
              </div>
            </div>`}
    </div>
  `;

  const style = css`
    @scope ([data-scope="Permissions"]) to ([data-scope]) {
      & {
        flex: 1;
        min-height: 0;
        padding: 1.25rem 1rem;
        box-sizing: border-box;
      }

      .state {
        color: var(--neutral-500);
        text-align: center;
      }

      .card {
        width: 100%;
        max-width: 22.5rem;
        box-sizing: border-box;
        padding: 1.35rem 1.25rem 1.15rem;
      }

      .header {
        text-align: center;
      }

      .hero {
        margin-bottom: 0.15rem;
      }

      .tile {
        width: 56px;
        height: 56px;
        border-radius: 14px;
        overflow: hidden;
        display: grid;
        place-items: center;
        color: var(--white);
        font-size: 1.35rem;
        font-weight: 750;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
      }

      .tile img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .tile-abblet {
        background: var(--primary-600);
        font-weight: 800;
      }

      .link-dots {
        width: 1.35rem;
        height: 2px;
        border-radius: 999px;
        background: color-mix(in oklab, var(--neutral-300) 85%, transparent);
        flex: none;
      }

      .title {
        margin: 0;
        text-align: center;
        letter-spacing: -0.02em;
        line-height: 1.2;
      }

      .lede {
        margin: 0;
        text-align: center;
        color: var(--neutral-500);
        font-size: 0.9375rem;
        line-height: 1.35;
      }

      .email {
        margin: 0.15rem 0 0;
        text-align: center;
        font-size: 0.8125rem;
        color: var(--neutral-400);
        font-weight: 500;
      }

      .panel {
        width: 100%;
        padding: 0.95rem 1rem;
        border-radius: 0.85rem;
        background: color-mix(in oklab, var(--neutral-100) 72%, var(--white));
        border: 1px solid color-mix(in oklab, var(--neutral-200) 70%, transparent);
        box-sizing: border-box;
      }

      .perm-row {
        width: 100%;
      }

      .perm-icon {
        color: var(--primary-600);
        flex: none;
        margin-top: 0.1rem;
      }

      .perm-copy {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.4;
        color: var(--neutral-700);
      }

      .budget-field {
        width: 100%;
        text-align: left;
        margin: 0;
      }

      .budget-field label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--neutral-700);
      }

      .budget-input {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        box-sizing: border-box;
        padding: 0 0.75rem;
        border: 1px solid var(--neutral-200);
        border-radius: 0.7rem;
        background: var(--white);
        transition: border-color 0.12s ease, box-shadow 0.12s ease;
      }

      .budget-input:focus-within {
        border-color: color-mix(in oklab, var(--primary-500) 55%, var(--neutral-300));
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary-500) 18%, transparent);
      }

      .budget-prefix,
      .budget-suffix {
        flex: none;
        color: var(--neutral-400);
        font-size: 0.875rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      .budget-input input {
        flex: 1;
        min-width: 0;
        margin: 0;
        padding: 0.65rem 0;
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }

      .budget-input input:focus {
        outline: none;
      }

      .actions {
        width: 100%;
        margin-top: 0.15rem;
      }

      .once-note {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.35;
        color: var(--neutral-400);
        text-align: center;
      }
    }
  `;

  return [view, style];
}
