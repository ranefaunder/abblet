import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { t } from "/utils/i18n";
import { user, logout, updateMarketingOptIn } from "/app/stores/userStore";
import { aboutUrl, storeUrl } from "/utils/app-url";

export const SettingsPath = "/:lang/settings" as const;

export default function Settings({ params }: RoutePropsForPath<typeof SettingsPath>) {
  const { route } = useLocation();
  const { lang } = params;
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  function redirectIfLoggedOut() {
    if (!user.value) {
      route(`/${lang}/login?next=${encodeURIComponent(`/${lang}/settings`)}`, true);
    }
  }
  useEffect(() => redirectIfLoggedOut(), [lang, route]);

  if (!user.value) return null;

  const account = user.value;

  async function handleLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await logout();
      route(`/${lang}/`, true);
    } finally {
      setLogoutBusy(false);
    }
  }

  async function handleMarketingChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const checked = input.checked;
    if (marketingBusy) {
      input.checked = !checked;
      return;
    }
    setMarketingBusy(true);
    const ok = await updateMarketingOptIn(checked);
    if (!ok) input.checked = !checked;
    setMarketingBusy(false);
  }

  const view = html`
    <div data-scope="Settings">
      <div class="content" ui-column="gap-2xl" ui-padding="inline-md">
        <header class="page-head" ui-column="gap-sm">
          <h1 class="page-title">${t("Settings")}</h1>
          <p class="page-lede">${t("Manage your account and preferences.")}</p>
        </header>

        <section class="panel" ui-column="gap-lg">
          <header ui-column="gap-xs">
            <h2 class="panel-title">${t("Account")}</h2>
            <p class="panel-lede">${t("Signed in to R⫶⫶MIX with this email.")}</p>
          </header>

          <div ui-column="gap-md">
            <div ui-field>
              <label for="settings-email">${t("Email")}</label>
              <input
                id="settings-email"
                type="email"
                value=${account.email}
                readonly
                autocomplete="email"
              />
            </div>
            ${account.nickname
              ? html`
                <div ui-field>
                  <label for="settings-nickname">${t("Name")}</label>
                  <input
                    id="settings-nickname"
                    type="text"
                    value=${account.nickname}
                    readonly
                    autocomplete="nickname"
                  />
                </div>`
              : ""}
          </div>

          <div class="panel-actions" ui-row="gap-sm wrap">
            <button
              type="button"
              ui-button
              aria-busy=${logoutBusy ? "true" : undefined}
              disabled=${logoutBusy}
              onClick=${handleLogout}
            >
              ${t("Log out")}
            </button>
          </div>
        </section>

        <section class="panel" ui-column="gap-lg">
          <header ui-column="gap-xs">
            <h2 class="panel-title">${t("Preferences")}</h2>
            <p class="panel-lede">${t("Choose what email you want from R⫶⫶MIX.")}</p>
          </header>

          <label class="pref-row" ui-row="gap-md y-center x-between">
            <span ui-column="gap-xs">
              <strong>${t("Product updates")}</strong>
              <small>${t("Email me about R⫶⫶MIX updates")}</small>
            </span>
            <input
              type="checkbox"
              ui-input="switch"
              checked=${account.marketingOptIn === true}
              disabled=${marketingBusy}
              aria-busy=${marketingBusy ? "true" : undefined}
              onChange=${handleMarketingChange}
            />
          </label>
        </section>

        <section class="panel" ui-column="gap-md">
          <header ui-column="gap-xs">
            <h2 class="panel-title">${t("About")}</h2>
            <p class="panel-lede">${t("Learn what R⫶⫶MIX is and how remixing works.")}</p>
          </header>
          <div ui-row="gap-sm wrap">
            <a href=${aboutUrl(lang)} ui-button>${t("About R⫶⫶MIX")}</a>
            <a href=${storeUrl(lang)} ui-button="tertiary">${t("Store")}</a>
          </div>
        </section>
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Settings"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
        padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
      }

      .content {
        padding-top: 1.5rem;
        max-width: 48rem;
        margin-inline: auto;
        width: 100%;
        box-sizing: border-box;
      }

      .page-title {
        margin: 0;
        font-size: clamp(1.85rem, 5vw, 2.5rem);
        font-weight: 700;
        letter-spacing: -0.04em;
        line-height: 1.05;
        color: var(--neutral-950);
      }

      .page-lede {
        margin: 0;
        max-width: 36rem;
        font-size: 1.05rem;
        line-height: 1.45;
        color: var(--neutral-600);
      }

      .panel {
        padding: 1.35rem 1.25rem 1.4rem;
        border-radius: 1.15rem;
        border: 1px solid var(--neutral-200);
        background: var(--white);
      }

      .panel-title {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        letter-spacing: -0.025em;
        color: var(--neutral-950);
      }

      .panel-lede {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.45;
        color: var(--neutral-600);
      }

      .panel-actions {
        padding-top: 0.25rem;
      }

      .pref-row {
        margin: 0;
        padding: 0.85rem 1rem;
        border-radius: 0.9rem;
        border: 1px solid var(--neutral-200);
        background: var(--neutral-50);
        cursor: pointer;
      }

      .pref-row strong {
        font-size: 0.9375rem;
        letter-spacing: -0.015em;
        color: var(--neutral-950);
      }

      .pref-row small {
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--neutral-600);
      }

      .pref-row input[ui-input~="switch"] {
        flex: none;
      }

      [ui-field] input[readonly] {
        color: var(--neutral-800);
        background: var(--neutral-50);
      }

      @media (min-width: 640px) {
        .panel {
          padding: 1.6rem 1.5rem 1.55rem;
        }
      }
    }
  `;

  return [view, style];
}
