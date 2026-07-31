import type { ComponentChildren, ComponentType } from "preact";
import { h } from "preact";
import { html, css } from "/utils/markup";
import Dialogs from "/app/components/Dialogs";
import TabBar from "/app/components/TabBar";

/** Soft page wash — Games-style dual radial, tinted per route. */
export type Atmosphere =
  | "apps"
  | "games"
  | "me"
  | "about"
  | "create"
  | "detail"
  | "login"
  | "splash"
  | "default";

type LayoutProps = {
  children: ComponentChildren;
  tabBar?: boolean;
  atmosphere?: Atmosphere;
};

/** App shell — document scrolls; optional floating bottom tab bar. */
export default function Layout({
  children,
  tabBar = true,
  atmosphere = "default",
}: LayoutProps) {
  const view = html`
    <div
      data-scope="Layout"
      class=${`${tabBar ? "with-tabs" : "no-tabs"} atm-${atmosphere}`}
    >
      <main class="shell">${children}</main>
      ${tabBar ? html`<${TabBar} />` : null}
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
        min-width: 0;
        /* iPhone PWA / notch — status bar must not cover page titles */
        padding-top: env(safe-area-inset-top, 0px);
      }

      &.with-tabs .shell {
        padding-bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));
      }

      /* Shared Games-style wash; each tone swaps accent pairs. */
      &.atm-apps {
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, var(--primary-200) 55%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, var(--info-200) 40%, transparent), transparent 50%),
          var(--neutral-50);
      }

      &.atm-games {
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, var(--secondary-200) 55%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, var(--primary-200) 45%, transparent), transparent 50%),
          var(--neutral-50);
      }

      &.atm-me {
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, var(--success-200) 45%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, var(--primary-200) 35%, transparent), transparent 50%),
          var(--neutral-50);
      }

      &.atm-about {
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, var(--primary-100) 70%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, var(--neutral-200) 55%, transparent), transparent 50%),
          var(--neutral-50);
      }

      &.atm-create {
        /* Magic-wand violet (hue ~300) — distinct from indigo primary / orange secondary. */
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, oklch(88% 0.09 305) 65%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, oklch(90% 0.07 285) 55%, transparent), transparent 50%),
          var(--neutral-50);
      }

      &.atm-detail {
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, var(--primary-200) 40%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, var(--secondary-100) 50%, transparent), transparent 50%),
          var(--neutral-50);
      }

      &.atm-login {
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, var(--info-200) 50%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, var(--primary-200) 35%, transparent), transparent 50%),
          var(--neutral-50);
      }

      &.atm-splash {
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, var(--primary-200) 50%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, var(--secondary-200) 40%, transparent), transparent 50%),
          var(--neutral-50);
      }

      &.atm-default {
        background:
          radial-gradient(90% 50% at 0% 0%, color-mix(in oklab, var(--neutral-200) 60%, transparent), transparent 55%),
          radial-gradient(70% 40% at 100% 10%, color-mix(in oklab, var(--primary-100) 45%, transparent), transparent 50%),
          var(--neutral-50);
      }
    }
  `;

  return [style, view];
}

type LayoutOptions = {
  tabBar?: boolean;
  atmosphere?: Atmosphere;
};

export function withLayout<P extends object>(Page: ComponentType<P>, options: LayoutOptions = {}) {
  const tabBar = options.tabBar !== false;
  const atmosphere = options.atmosphere ?? "default";
  return function LayoutRoute(props: P) {
    return h(Layout, { tabBar, atmosphere, children: h(Page, props) });
  };
}
