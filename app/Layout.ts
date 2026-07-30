import type { ComponentChildren, ComponentType } from "preact";
import { h } from "preact";
import { useLocation } from "preact-iso";
import { html, css } from "/utils/markup";
import Dialogs from "/app/components/Dialogs";
import SiteFooter from "/app/components/SiteFooter";
import { t } from "/utils/i18n";
import { AVAILABLE_LANGUAGES, type Language } from "/i18n/languages";
import { getLang, pathWithLang } from "/utils/lang";
import { aboutUrl, appEditUrl, storeUrl } from "/utils/app-url";
import { isLoggedIn, openLoginDialog, requireLogin } from "/app/stores/userStore";

type LayoutProps = {
  children: ComponentChildren;
};

/** Shared site chrome — brand, Store, Account, Create App, language. */
function SiteHeader() {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const loggedIn = isLoggedIn();

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
        <nav class="actions" ui-row="gap-sm y-center">
          <a href=${storeUrl(lang)} ui-button="tertiary sm">${t("Store")}</a>
          ${accountAction}
          <a
            href=${appEditUrl(lang)}
            ui-button="primary sm"
            onClick=${(e: Event) => {
              if (requireLogin()) return;
              e.preventDefault();
            }}
          >${t("Create App")}</a>
          ${languageMenu}
        </nav>
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
        flex: none;
        justify-content: flex-end;
        flex-wrap: wrap;
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
