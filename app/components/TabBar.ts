import { html, css } from "/utils/markup";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import type { Language } from "/i18n/languages";
import {
  aboutUrl,
  appsUrl,
  createUrl,
  gamesUrl,
  meUrl,
} from "/utils/app-url";

type TabId = "create" | "apps" | "games" | "me" | "about";

/** Phosphor bold tokens registered in icons.css */
const TAB_ICONS: Record<TabId, string> = {
  create: "magic-wand",
  apps: "squares-four",
  games: "castle-turret",
  me: "user-circle",
  about: "info",
};

function activeTab(path: string, lang: string): TabId | null {
  const base = `/${lang}`;
  const rest = path === base || path === `${base}/` ? "" : path.slice(base.length + 1);
  const seg = rest.split("/").filter(Boolean)[0] ?? "";

  if (seg === "create" || seg === "edit") return "create";
  if (seg === "apps" || seg === "store") return "apps";
  if (seg === "games") return "games";
  if (seg === "me" || seg === "account") return "me";
  if (seg === "about") return "about";
  return null;
}

export default function TabBar() {
  const { path } = useLocation();
  const lang = (getLang(path ?? "") ?? "en") as Language;
  const current = path ?? `/${lang}/`;
  const active = activeTab(current, lang);

  const tabs: { id: TabId; label: string; href: string }[] = [
    { id: "apps", label: t("Apps"), href: appsUrl(lang) },
    { id: "games", label: t("Games"), href: gamesUrl(lang) },
    { id: "create", label: t("Create"), href: createUrl(lang) },
    { id: "me", label: t("Me"), href: meUrl(lang) },
    { id: "about", label: t("About"), href: aboutUrl(lang) },
  ];

  const view = html`
    <nav data-scope="TabBar" class="tab-bar" aria-label=${t("Main")}>
      <div class="tab-bar-inner">
        ${tabs.map((tab) => {
          const isActive = active === tab.id;
          return html`
            <a
              class=${`tab${isActive ? " active" : ""}`}
              href=${tab.href}
              aria-current=${isActive ? "page" : undefined}
            >
              <i ui-icon=${TAB_ICONS[tab.id]} aria-hidden="true"></i>
              <span class="tab-label">${tab.label}</span>
            </a>
          `;
        })}
      </div>
    </nav>
  `;

  const style = css`
    @scope ([data-scope="TabBar"]) to ([data-scope]) {
      &.tab-bar {
        position: fixed;
        z-index: 40;
        left: 50%;
        bottom: calc(0.55rem + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        display: flex;
        justify-content: center;
        max-width: 94vw;
        pointer-events: none;
      }

      .tab-bar-inner {
        /* Nested radii: inner = outer − gap (CSS-Tricks / Cloud Four).
           Pill exception: both use 999px so ends stay fully round;
           equal padding keeps the gap even around the curve. */
        --tab-pad: 0.4rem;
        --tab-radius: 999px;
        --tab-radius-inner: 999px;

        pointer-events: auto;
        display: flex;
        align-items: stretch;
        gap: 0.15rem;
        padding: var(--tab-pad);
        border-radius: var(--tab-radius);
        border: 1px solid rgba(255, 255, 255, 0.07);
        background: rgba(0, 0, 0, 0.78);
        backdrop-filter: blur(36px) saturate(170%);
        -webkit-backdrop-filter: blur(36px) saturate(170%);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.05) inset,
          0 10px 32px rgba(0, 0, 0, 0.5);
      }

      .tab {
        min-width: 4.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.2rem;
        padding: 0.5rem 0.85rem 0.45rem;
        border-radius: var(--tab-radius-inner);
        text-decoration: none;
        color: rgba(255, 255, 255, 0.72);
        -webkit-tap-highlight-color: transparent;
        transition:
          color 160ms ease,
          background 160ms ease;
      }

      .tab > i[ui-icon] {
        --ui-icon-size: 1.45rem;
        width: 1.45rem;
        height: 1.45rem;
        color: inherit;
      }

      .tab-label {
        font-size: 0.6875rem;
        font-weight: 500;
        letter-spacing: -0.01em;
        line-height: 1;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tab:hover {
        color: #fff;
      }

      .tab.active {
        color: #fff;
        background: rgba(255, 255, 255, 0.13);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.07) inset;
      }

      .tab.active .tab-label {
        font-weight: 600;
      }

      @media (prefers-reduced-motion: reduce) {
        .tab {
          transition: none;
        }
      }
    }
  `;

  return [style, view];
}
