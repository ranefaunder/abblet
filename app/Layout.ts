import type { ComponentChildren, ComponentType } from "preact";
import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useLocation } from "preact-iso";
import { html, css } from "/utils/markup";
import Dialogs from "/app/components/Dialogs";
import SiteFooter from "/app/components/SiteFooter";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { aboutUrl, appEditUrl, galleryUrl } from "/utils/app-url";
import { galleryQuery, loadGallery } from "/app/stores/galleryStore";
import { isLoggedIn, logout, openLoginDialog, requireLogin } from "/app/stores/userStore";

type LayoutProps = {
  children: ComponentChildren;
};

function isEditPath(path: string): boolean {
  return /\/[^/]+\/edit(\/|$)/.test(path);
}

/** Shared site chrome — brand, search, Create, account. */
function SiteHeader() {
  const { path, route } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const loggedIn = isLoggedIn();
  const searchOpen = useSignal(Boolean(galleryQuery.value.trim()));
  const draftQ = useSignal(galleryQuery.value);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    draftQ.value = galleryQuery.value;
    if (galleryQuery.value.trim()) searchOpen.value = true;
  }, [galleryQuery.value]);

  useEffect(() => {
    if (searchOpen.value) searchRef.current?.focus();
  }, [searchOpen.value]);

  function submitSearch(e: Event) {
    e.preventDefault();
    void loadGallery({ q: draftQ.value }).then(() => {
      route(galleryUrl(lang));
    });
  }

  function openSearch() {
    searchOpen.value = true;
  }

  function onSearchBlur() {
    if (draftQ.value.trim()) return;
    searchOpen.value = false;
  }

  const accountMenu = loggedIn
    ? html`
        <div ui-menu="bottom-right">
          <button type="button" ui-button="tertiary sm" popovertarget="site-account-menu">
            ${t("Account")}
          </button>
          <div id="site-account-menu" popover="auto" role="menu">
            <a role="menuitem" href=${`/${lang}/settings`}>${t("Settings")}</a>
            <a role="menuitem" href=${aboutUrl(lang)}>${t("About Rmix")}</a>
            <hr />
            <button type="button" role="menuitem" onClick=${() => void logout()}>
              ${t("Log out")}
            </button>
          </div>
        </div>`
    : html`
      <button type="button" ui-button="tertiary sm" onClick=${openLoginDialog}>
        ${t("Sign in")}
      </button>`;

  return html`
    <header class="site-header" ui-padding="inline-md block-md">
      <div class="site-header-inner" ui-row="gap-sm y-center x-between">
        <a class="brand" href=${`/${lang}/`} aria-label="Rmix">
          <img src="/static/rmix.svg" alt="Rmix" width="96" height="22" />
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
          >${t("Create")}</a>
          ${accountMenu}
        </div>
      </div>
    </header>
  `;
}

/** App shell — document scrolls; pages that need a fixed viewport handle it themselves. */
export default function Layout({ children }: LayoutProps) {
  const { path } = useLocation();
  const hideHeader = isEditPath(path ?? "");

  const view = html`
    <div data-scope="Layout">
      ${hideHeader ? null : html`<${SiteHeader} />`}
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
        min-height: 0;
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
