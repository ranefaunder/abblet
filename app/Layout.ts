import type { ComponentChildren, ComponentType } from "preact";
import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useLocation } from "preact-iso";
import { html, css } from "/utils/markup";
import Dialogs from "/app/components/Dialogs";
import SiteFooter from "/app/components/SiteFooter";
import { t } from "/utils/i18n";
import { AVAILABLE_LANGUAGES, type Language } from "/i18n/languages";
import { getLang, pathWithLang } from "/utils/lang";
import { aboutUrl, appEditUrl, storeUrl } from "/utils/app-url";
import { storeQuery, loadStore } from "/app/stores/storeListingStore";
import { isLoggedIn, openLoginDialog, requireLogin } from "/app/stores/userStore";

type LayoutProps = {
  children: ComponentChildren;
};

/** Shared site chrome — brand, search, Create App, account. */
function SiteHeader() {
  const { path, route } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const loggedIn = isLoggedIn();
  const searchOpen = useSignal(Boolean(storeQuery.value.trim()));
  const draftQ = useSignal(storeQuery.value);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    draftQ.value = storeQuery.value;
    if (storeQuery.value.trim()) searchOpen.value = true;
  }, [storeQuery.value]);

  useEffect(() => {
    if (searchOpen.value) searchRef.current?.focus();
  }, [searchOpen.value]);

  function submitSearch(e: Event) {
    e.preventDefault();
    void loadStore({ q: draftQ.value }).then(() => {
      route(storeUrl(lang));
    });
  }

  function openSearch() {
    searchOpen.value = true;
  }

  function onSearchBlur() {
    if (draftQ.value.trim()) return;
    searchOpen.value = false;
  }

  const accountAction = loggedIn
    ? html`
        <a href=${`/${lang}/account`} ui-button="tertiary sm">${t("Account")}</a>`
    : html`
      <button type="button" ui-button="tertiary sm" onClick=${openLoginDialog}>
        ${t("Sign in")}
      </button>`;

  const languageMenu = html`
    <div ui-menu="bottom-right">
      <button
        type="button"
        ui-button="tertiary square sm"
        ui-icon="globe"
        popovertarget="site-lang-menu"
        aria-label=${t("Language")}
      ></button>
      <div id="site-lang-menu" popover="auto" role="menu">
        ${(Object.keys(AVAILABLE_LANGUAGES) as Language[]).map((code) => {
          const current = code === lang;
          return html`
            <a
              role="menuitem"
              href=${pathWithLang(path ?? `/${lang}/`, code)}
              aria-current=${current ? "true" : undefined}
              lang=${code}
            >${AVAILABLE_LANGUAGES[code].nativeName}</a>
          `;
        })}
      </div>
    </div>`;

  return html`
    <header class="site-header" ui-padding="inline-md block-md">
      <div class="site-header-inner" ui-row="gap-sm y-center x-between">
        <a class="brand" href=${aboutUrl(lang)} aria-label="Remiix">
          <img src="/static/images/remiix.svg" alt="Remiix" width="96" height="20" />
        </a>
        <div class="actions" ui-row="gap-sm y-center">
          ${searchOpen.value
            ? html`
              <form onSubmit=${submitSearch} class="search">
                <label class="sr-only" for="site-search">${t("Search apps")}</label>
                <input
                  id="site-search"
                  ref=${searchRef}
                  type="search"
                  ui-input="sm"
                  placeholder=${t("Search apps")}
                  value=${draftQ.value}
                  onInput=${(e: Event) => {
                    draftQ.value = (e.target as HTMLInputElement).value;
                  }}
                  onBlur=${onSearchBlur}
                />
              </form>`
            : html`
              <button
                type="button"
                ui-button="tertiary square sm"
                ui-icon="search"
                aria-label=${t("Search apps")}
                onClick=${openSearch}
              ></button>`}
          <a
            href=${appEditUrl(lang)}
            ui-button="primary sm"
            onClick=${(e: Event) => {
              if (requireLogin()) return;
              e.preventDefault();
            }}
          >${t("Create App")}</a>
          ${accountAction}
          ${languageMenu}
        </div>
      </div>
    </header>
  `;
}

/** App shell — document scrolls; pages that need a fixed viewport handle it themselves. */
export default function Layout({ children }: LayoutProps) {
  const view = html`
    <div data-scope="Layout">
      <${SiteHeader} />
      <main class="shell">${children}</main>
      <${SiteFooter} />
      <${Dialogs} />
    </div>
  `;

  const style = css`
    @scope ([data-scope="Layout"]) to ([data-scope]) {
      & {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        background-color: var(--neutral-50);
      }

      .shell {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .site-header {
        flex: none;
        position: sticky;
        top: 0;
        z-index: 5;
        padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
        border-bottom: 1px solid var(--neutral-200);
        background: color-mix(in oklab, var(--neutral-50) 88%, var(--white));
        backdrop-filter: blur(12px);
      }

      .site-header-inner {
        max-width: 48rem;
        margin-inline: auto;
        width: 100%;
        box-sizing: border-box;
      }

      .brand {
        color: var(--neutral-950);
        text-decoration: none;
        flex: none;
      }

      .brand img {
        display: block;
        height: 1.35rem;
        width: auto;
      }

      .actions {
        min-width: 0;
        flex: 1;
        justify-content: flex-end;
      }

      .search {
        min-width: 0;
        flex: 1;
        max-width: 14rem;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    }
  `;

  return [style, view];
}

export function withLayout<P extends object>(Page: ComponentType<P>) {
  return function LayoutRoute(props: P) {
    return h(Layout, { children: h(Page, props) });
  };
}
