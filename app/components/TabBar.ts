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
        --tab-active: var(--primary-600, #007aff);
        --tab-active-bg: color-mix(in oklab, var(--primary-500, #007aff) 14%, transparent);
        --tab-ink: #1c1c1e;
        --tab-ink-muted: #3a3a3c;

        position: fixed;
        z-index: 40;
        left: 50%;
        bottom: calc(0.7rem + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        width: min(94vw, 26.5rem);
        pointer-events: none;
      }

      .tab-bar-inner {
        pointer-events: auto;
        display: flex;
        align-items: stretch;
        justify-content: space-evenly;
        gap: 0.1rem;
        padding: 0.35rem 0.4rem;
        border-radius: 999px;
        border: 0.5px solid rgba(255, 255, 255, 0.55);
        background: rgba(255, 255, 255, 0.72);
        backdrop-filter: blur(40px) saturate(180%);
        -webkit-backdrop-filter: blur(40px) saturate(180%);
        box-shadow:
          0 0 0 0.5px rgba(0, 0, 0, 0.04),
          0 2px 8px rgba(0, 0, 0, 0.04),
          0 12px 40px rgba(0, 0, 0, 0.12);
      }

      @supports (background: color-mix(in oklab, white 72%, transparent)) {
        .tab-bar-inner {
          border-color: color-mix(in oklab, var(--white) 55%, transparent);
          background: color-mix(in oklab, var(--white) 72%, transparent);
        }
      }

      .tab {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.12rem;
        padding: 0.42rem 0.2rem 0.38rem;
        border-radius: 1.15rem;
        text-decoration: none;
        color: var(--tab-ink-muted);
        -webkit-tap-highlight-color: transparent;
        transition:
          color 180ms ease,
          background 180ms ease,
          transform 180ms ease;
      }

      .tab > i[ui-icon] {
        --ui-icon-size: 22px;
        width: 22px;
        height: 22px;
        color: inherit;
      }

      .tab-label {
        font-size: 0.625rem;
        font-weight: 500;
        letter-spacing: -0.01em;
        line-height: 1.05;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tab:hover {
        color: var(--tab-ink);
      }

      .tab.active {
        color: var(--tab-active);
        background: var(--tab-active-bg);
        font-weight: 600;
      }

      .tab.active .tab-label {
        font-weight: 600;
      }

      .tab.active:hover {
        color: var(--tab-active);
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
