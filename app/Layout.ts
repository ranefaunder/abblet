import type { ComponentChildren, ComponentType } from "preact";
import { h } from "preact";
import { html, css } from "/utils/markup";
import Dialogs from "/app/components/Dialogs";

type LayoutProps = {
  children: ComponentChildren;
};

/** App shell — document scrolls; pages that need a fixed viewport handle it themselves. */
export default function Layout({ children }: LayoutProps) {
  const view = html`
    <div data-scope="Layout">
      <main>${children}</main>
      <${Dialogs} />
    </div>
  `;

  const style = css`
    @scope ([data-scope="Layout"]) to ([data-scope]) {
      & {
        min-height: 100dvh;
        background-color: var(--neutral-50);
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
