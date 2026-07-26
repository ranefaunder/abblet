import type { ComponentChildren, ComponentType } from "preact";
import { h } from "preact";
import { html, css } from "/utils/markup";
import { useLocation } from "preact-iso";
import { getLang } from "/utils/lang";
import Dialogs from "/app/components/Dialogs";

type LayoutProps = {
  children: ComponentChildren;
};

function isLauncherPath(path: string, lang: string): boolean {
  const normalized = path.replace(/\/+$/, "") || "/";
  return normalized === `/${lang}`;
}

function isAboutPath(path: string, lang: string): boolean {
  const normalized = path.replace(/\/+$/, "") || "/";
  return normalized === `/${lang}/about`;
}

/**
 * App shell: full viewport, flex column, page owns scrolling.
 * Home (launcher) is the only exception — it has its own overflow rules.
 */
export default function Layout({ children }: LayoutProps) {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const home = isLauncherPath(path ?? "", lang);
  const about = isAboutPath(path ?? "", lang);
  const layoutClass = home ? "home" : about ? "shell about" : "shell";
  const mainClass = home ? "layout-main home" : "layout-main shell";

  const view = html`
    <div data-scope="Layout" class=${layoutClass} ui-column>
      <main class=${mainClass}>
        ${children}
      </main>
      <${Dialogs} />
    </div>
  `;

  const style = css`
    @scope ([data-scope="Layout"]) to ([data-scope]) {
      & {
        min-height: 100%;
      }

      &.home,
      &.shell {
        height: 100svh;
        height: 100dvh;
        max-height: 100svh;
        max-height: 100dvh;
        overflow: hidden;
      }

      /* Etusivu on läpinäkyvä — tausta tulee Home-reitin CSS:stä. */
      &.home {
        background-color: transparent;
      }

      &.shell {
        background-color: var(--neutral-50);
      }

      &.shell.about {
        background-color: #0f1419;
      }

      .layout-main {
        flex-grow: 1;
        min-height: 0;
      }

      .layout-main.home,
      .layout-main.shell {
        display: flex;
        flex-direction: column;
        min-height: 0;
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
