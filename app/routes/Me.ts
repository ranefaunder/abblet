import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { t } from "/utils/i18n";
import {
  user,
  logout,
  updateMarketingOptIn,
  isLoggedIn,
} from "/app/stores/userStore";
import { apps as libraryApps, loadApps } from "/app/stores/appStore";
import { createUrl, splashUrl } from "/utils/app-url";
import { AVAILABLE_LANGUAGES, type Language } from "/i18n/languages";
import { pathWithLang } from "/utils/lang";
import AppGrid from "/app/components/AppGrid";

export const MePath = "/:lang/me" as const;

const JOIN_FEATURES = [
  {
    icon: "git-fork",
    title: "Remix any app",
    body: "Open a Store app and ask Remiix to change it until it fits you.",
  },
  {
    icon: "magic-wand",
    title: "Build with AI",
    body: "Describe an idea and get a working app in minutes — no code needed.",
  },
  {
    icon: "wallet",
    title: "Monthly AI credit",
    body: "Every account gets free AI credit each month to create, edit, and run AI in apps.",
  },
  {
    icon: "squares-four",
    title: "Your apps in one place",
    body: "See the apps you made, open them anytime, and install them to your home screen.",
  },
  {
    icon: "share",
    title: "Publish to the Store",
    body: "Share what you built so others can use it — and remix it further.",
  },
] as const;

export default function Me({ params }: RoutePropsForPath<typeof MePath>) {
  const { path, route } = useLocation();
  const { lang } = params;
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const loggedIn = isLoggedIn();
  const account = user.value;
  const ownedApps = libraryApps.value.filter((app) => app.owned);
  const ownedGridItems = ownedApps.map((app) => ({
    slug: app.slug,
    title: app.title,
    iconId: app.iconId,
    href: createUrl(lang, app.slug),
    subtitle: app.isDraft ? t("Draft") : app.tagline || app.category || t("App"),
  }));
  const currentPath = path ?? `/${lang}/me`;

  useEffect(() => {
    if (loggedIn) void loadApps();
  }, [loggedIn]);

  async function handleLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await logout();
      route(splashUrl(lang), true);
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

  const langPicker = html`
    <div class="lang-picker" ui-row="gap-sm y-center">
      <i ui-icon="globe" aria-hidden="true"></i>
      <select
        id="me-lang"
        class="lang-select"
        value=${lang}
        aria-label=${t("Language")}
        ui-input="sm"
        onChange=${(e: Event) => {
          const next = (e.currentTarget as HTMLSelectElement).value as Language;
          if (!next || next === lang) return;
          route(pathWithLang(currentPath, next), true);
        }}
      >
        ${(Object.keys(AVAILABLE_LANGUAGES) as Language[]).map(
          (code) => html`
            <option value=${code} lang=${code} selected=${code === lang}>
              ${AVAILABLE_LANGUAGES[code].nativeName}
            </option>
          `,
        )}
      </select>
    </div>
  `;

  const view = html`
    <div data-scope="Me">
      <div class="content" ui-column="gap-2xl" ui-padding="inline-md">
        <header class="page-head" ui-row="x-between y-start gap-md">
          <div ui-column="gap-sm">
            <h1 class="page-title">${t("Me")}</h1>
            <p class="page-lede">
              ${loggedIn
                ? t("Your apps, settings, and account.")
                : t("Create a free account to remix apps, build your own with AI, and keep everything in one place.")}
            </p>
          </div>
          ${langPicker}
        </header>

        ${!loggedIn
          ? html`
            <section class="join" ui-column="gap-xl">
              <div ui-column="gap-sm">
                <h2 class="join-title">${t("Make Remiix yours")}</h2>
              </div>

              <ul class="benefits" ui-off>
                ${JOIN_FEATURES.map(
                  (feature) => html`
                    <li class="benefit" ui-row="gap-md y-start">
                      <span class="benefit-icon" aria-hidden="true">
                        <i ui-icon=${`${feature.icon} lg`}></i>
                      </span>
                      <span ui-column="gap-xs">
                        <strong class="benefit-title">${t(feature.title)}</strong>
                        <span class="benefit-body">${t(feature.body)}</span>
                      </span>
                    </li>
                  `,
                )}
              </ul>

              <div class="join-cta" ui-column="gap-sm">
                <button
                  type="button"
                  ui-button="primary lg block"
                  commandfor="login-dialog"
                  command="show-modal"
                >
                  ${t("Sign in")}
                </button>
                <button
                  type="button"
                  ui-button="tertiary lg block"
                  commandfor="register-dialog"
                  command="show-modal"
                >
                  ${t("Register")}
                </button>
              </div>
            </section>`
          : html`
            <section ui-column="gap-md">
              <h2 class="section-title">${t("My Apps")}</h2>
              ${ownedApps.length === 0
                ? html`
                  <div class="panel empty" ui-column="gap-sm">
                    <p ui-heading="sm">${t("No apps of your own yet")}</p>
                    <p>${t("Create an app to see it here.")}</p>
                  </div>`
                : html`
                  <${AppGrid}
                    items=${ownedGridItems}
                    label=${t("My Apps")}
                  />`}
            </section>

            ${account
              ? html`
                <section class="panel" ui-column="gap-lg">
                  <header ui-column="gap-xs">
                    <h2 class="panel-title">${t("Account")}</h2>
                    <p class="panel-lede">${t("Signed in to Remiix with this email.")}</p>
                  </header>

                  <div ui-column="gap-md">
                    <div ui-field>
                      <label for="me-email">${t("Email")}</label>
                      <input
                        id="me-email"
                        type="email"
                        value=${account.email}
                        readonly
                        autocomplete="email"
                      />
                    </div>
                    ${account.nickname
                      ? html`
                        <div ui-field>
                          <label for="me-nickname">${t("Name")}</label>
                          <input
                            id="me-nickname"
                            type="text"
                            value=${account.nickname}
                            readonly
                            autocomplete="nickname"
                          />
                        </div>`
                      : ""}
                  </div>

                  <label class="pref-row" ui-row="gap-md y-center x-between">
                    <span ui-column="gap-xs">
                      <strong>${t("Product updates")}</strong>
                      <small>${t("Email me about Remiix updates")}</small>
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
                </section>`
              : ""}`}
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Me"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
      }

      .content {
        padding-top: 1.35rem;
        padding-bottom: 0.5rem;
        max-width: 48rem;
        margin-inline: auto;
        width: 100%;
        box-sizing: border-box;
      }

      .page-head {
        align-items: flex-start;
      }

      .page-head .lang-picker {
        flex: none;
        margin-top: 0.2rem;
        color: var(--neutral-600);
      }

      .page-head .lang-select {
        flex: none;
        width: auto;
        max-width: 11rem;
      }

      .page-title {
        margin: 0;
        font-size: clamp(2.1rem, 6vw, 2.75rem);
        font-weight: 800;
        letter-spacing: -0.05em;
        line-height: 1;
        color: var(--neutral-950);
      }

      .page-lede,
      .panel-lede {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.45;
        color: var(--neutral-600);
      }

      .panel-lede {
        font-size: 0.9375rem;
      }

      .section-title,
      .panel-title {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        letter-spacing: -0.025em;
        color: var(--neutral-950);
      }

      .join-title {
        margin: 0;
        font-size: clamp(1.45rem, 4.5vw, 1.85rem);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1.15;
        color: var(--neutral-950);
      }

      .benefits {
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 1.15rem;
      }

      .benefit-icon {
        flex: none;
        display: grid;
        place-items: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 0.85rem;
        background: color-mix(in oklab, var(--primary-100) 75%, var(--white));
        color: var(--primary-700);
      }

      .benefit-title {
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--neutral-950);
      }

      .benefit-body {
        font-size: 0.9375rem;
        line-height: 1.45;
        color: var(--neutral-600);
      }

      .join-cta {
        width: 100%;
        max-width: 18rem;
      }

      .panel {
        padding: 1.35rem 1.25rem 1.4rem;
        border-radius: 1.15rem;
        border: 1px solid var(--neutral-200);
        background: var(--white);
      }

      .panel.empty {
        align-items: flex-start;
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
        color: var(--neutral-950);
      }

      .pref-row small {
        font-size: 0.8125rem;
        color: var(--neutral-600);
      }

      .pref-row input[ui-input~="switch"] {
        flex: none;
      }

      [ui-field] input[readonly] {
        color: var(--neutral-800);
        background: var(--neutral-50);
      }
    }
  `;

  return [view, style];
}
