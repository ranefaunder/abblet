import { html, css } from "/utils/markup";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useLocation } from "preact-iso";
import type { AppSummary } from "/types/app-types";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { apps, loadApps, clearApps } from "/app/stores/appStore";
import { isGuest, isLoggedIn, logout, user } from "/app/stores/userStore";
import AppIcon from "/app/components/home/AppIcon";

function remToPx(value: string): number {
  const rem = parseFloat(value);
  if (!Number.isFinite(rem)) return 0;
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return rem * root;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function openLoginDialog() {
  (document.getElementById("login-dialog") as HTMLDialogElement | null)?.showModal();
}

export default function AppLauncher() {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const loggedInUser = user.value;
  const readyApps = apps.value;
  const count = readyApps.length;
  const loggedIn = isLoggedIn();
  const guest = isGuest();

  const perPage = useSignal(0);
  const pageIndex = useSignal(0);
  const pageHeightPx = useSignal(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loggedInUser) {
      void loadApps();
    } else {
      clearApps();
    }
  }, [loggedInUser?.id]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;

    function recompute() {
      const rootEl = rootRef.current;
      const vp = viewportRef.current;
      if (!rootEl) return;

      const cs = getComputedStyle(rootEl);
      const cols = Math.max(1, parseInt(cs.getPropertyValue("--home-cols")) || 4);
      const rowGap = remToPx(cs.getPropertyValue("--home-gap-y") || "1.55rem");
      const cell = rootEl.querySelector<HTMLElement>(".app-icon-root");
      const cellH = cell?.offsetHeight ?? remToPx("5.75rem");

      const shortcuts = rootEl.querySelector<HTMLElement>(".shortcuts");
      const dots = rootEl.querySelector<HTMLElement>(".page-dots");
      const footerEl = rootEl.querySelector<HTMLElement>(".account-footer");
      const panel = rootEl.querySelector<HTMLElement>(".home-panel");
      const signin = rootEl.querySelector<HTMLElement>(".panel-signin");
      const emptyWrap = rootEl.querySelector<HTMLElement>(".panel-empty-wrap");
      const panelPadY = panel
        ? (parseFloat(getComputedStyle(panel).paddingTop) || 0) +
          (parseFloat(getComputedStyle(panel).paddingBottom) || 0)
        : 40;

      const reserved =
        (footerEl?.offsetHeight ?? 0) +
        (shortcuts?.offsetHeight ?? 0) +
        (dots?.offsetHeight ?? 0) +
        panelPadY +
        24;

      const chromeGaps = dots ? remToPx("0.55rem") : 0;

      const maxGridH = Math.max(cellH, rootEl.clientHeight - reserved - chromeGaps);
      const maxRows = Math.max(1, Math.floor((maxGridH + rowGap) / (cellH + rowGap)));
      const next = cols * maxRows;
      if (next !== perPage.value) perPage.value = next;

      const neededRows = Math.max(1, Math.ceil(Math.max(count, 1) / cols));
      const displayRows = Math.min(neededRows, maxRows);
      const h = displayRows * cellH + Math.max(0, displayRows - 1) * rowGap;
      if (h !== pageHeightPx.value) pageHeightPx.value = h;
      if (vp) vp.style.height = `${h}px`;
      // Empty library: one icon row so the panel matches apps width without filling the screen.
      if (emptyWrap) emptyWrap.style.minHeight = `${h}px`;
      if (signin) signin.style.minHeight = "";
    }

    recompute();
    const ro = new ResizeObserver(() => recompute());
    ro.observe(root);
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
    };
  }, [count, loggedIn, guest]);

  const pages: AppSummary[][] = perPage.value > 0 ? chunk(readyApps, perPage.value) : [readyApps];
  const pageCount = Math.max(1, pages.length);

  useEffect(() => {
    if (pageIndex.value > pageCount - 1) {
      const next = pageCount - 1;
      pageIndex.value = next;
      const vp = viewportRef.current;
      if (vp) vp.scrollTo({ left: next * vp.clientWidth });
    }
  }, [pageCount]);

  function onScroll() {
    const vp = viewportRef.current;
    if (!vp) return;
    const width = vp.clientWidth || 1;
    const idx = Math.round(vp.scrollLeft / width);
    if (idx !== pageIndex.value) pageIndex.value = idx;
  }

  function goToPage(i: number) {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.scrollTo({ left: i * vp.clientWidth, behavior: "smooth" });
  }

  const accountFooter = loggedIn
    ? guest
      ? html`
        <div class="account-footer">
          <span
            class="account-footer-text"
            role="button"
            tabindex="0"
            onClick=${openLoginDialog}
            onKeyDown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openLoginDialog();
              }
            }}
          >
            ${t("Sign in / Register")}
          </span>
        </div>`
      : html`
        <div class="account-footer">
          <span
            class="account-footer-text"
            role="button"
            tabindex="0"
            onClick=${() => void logout()}
            onKeyDown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void logout();
              }
            }}
          >
            ${t("Log out")}
          </span>
        </div>`
    : "";

  const shortcuts = html`
    <div class="shortcuts">
      <a class="shortcut gallery" href=${`/${lang}/gallery`}>
        <span class="shortcut-badge">
          <i ui-icon="squares-four" aria-hidden="true"></i>
        </span>
        <span class="shortcut-text">
          <span class="shortcut-title">${t("App Gallery")}</span>
          <span class="shortcut-desc">${t("Discover apps made by others")}</span>
        </span>
        <i class="shortcut-chevron" ui-icon="chevron-right" aria-hidden="true"></i>
      </a>
      <a class="shortcut create" href=${`/${lang}/edit`}>
        <span class="shortcut-badge">
          <i ui-icon="plus" aria-hidden="true"></i>
        </span>
        <span class="shortcut-text">
          <span class="shortcut-title">${t("Create New App")}</span>
          <span class="shortcut-desc">${t("Describe your idea and build it with AI")}</span>
        </span>
        <i class="shortcut-chevron" ui-icon="chevron-right" aria-hidden="true"></i>
      </a>
    </div>
  `;

  const appsPanel = html`
    <section class="home-panel">
      ${!loggedIn
        ? html`
          <div class="panel-signin">
            <p class="panel-signin-title">${t("Your apps appear here")}</p>
            <p class="panel-signin-desc">${t("Create one below, or sign in to continue.")}</p>
            <button type="button" class="panel-signin-btn" onClick=${openLoginDialog}>
              ${t("Login")}
            </button>
          </div>`
        : count === 0
          ? html`<div class="panel-empty-wrap"><p class="panel-empty">${t("Use Create to build your first app.")}</p></div>`
          : html`
            <div class="pages-viewport" ref=${viewportRef} onScroll=${onScroll}>
              ${pages.map(
                (pageApps) => html`
                  <div class="page">
                    <div class="grid">
                      ${pageApps.map((app) => html`<${AppIcon} app=${app} />`)}
                    </div>
                  </div>`,
              )}
            </div>
            ${pageCount > 1
              ? html`
                <div class="page-dots" role="tablist">
                  ${pages.map(
                    (_, i) => html`
                      <button
                        type="button"
                        class=${`page-dot${i === pageIndex.value ? " active" : ""}`}
                        aria-label=${`${i + 1}`}
                        aria-selected=${i === pageIndex.value}
                        onClick=${() => goToPage(i)}
                      ></button>`,
                  )}
                </div>`
              : ""}`}
    </section>
  `;

  const view = html`
    <div data-scope="AppLauncher" ref=${rootRef}>
      <div class="launcher-main">
        ${appsPanel}
        ${shortcuts}
      </div>
      ${accountFooter}
    </div>
  `;

  const style = css`
    @scope ([data-scope="AppLauncher"]) to ([data-scope]) {
      & {
        height: 100%;
        min-height: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .launcher-main {
        flex: 1;
        min-height: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 1rem;
      }

      .account-footer {
        flex: none;
        display: flex;
        justify-content: center;
        width: 100%;
        padding: 0.35rem 0 0.15rem;
      }

      .account-footer-text {
        color: #fff;
        font-size: 0.8125rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1.2;
        cursor: pointer;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }

      .account-footer-text:active {
        opacity: 0.75;
      }

      .home-panel {
        flex: 0 1 auto;
        width: calc(100% - 2 * var(--home-inline, 1.25rem));
        max-width: 100%;
        max-height: 100%;
        margin-inline: auto;
        display: flex;
        flex-direction: column;
        padding: 1.85rem 0 1.35rem;
        border-radius: 2rem;
        background: rgba(255, 255, 255, 0.16);
        backdrop-filter: blur(40px) saturate(180%);
        -webkit-backdrop-filter: blur(40px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.26);
        box-shadow:
          0 16px 48px rgba(0, 0, 0, 0.22),
          inset 0 0.5px 0 rgba(255, 255, 255, 0.4);
      }

      .pages-viewport {
        flex: none;
        width: 100%;
        display: flex;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        touch-action: pan-x;
      }

      .pages-viewport::-webkit-scrollbar {
        display: none;
      }

      .page {
        flex: 0 0 100%;
        box-sizing: border-box;
        width: 100%;
        padding-inline: var(--home-inline, 0.85rem);
        scroll-snap-align: start;
        scroll-snap-stop: always;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(var(--home-cols, 4), minmax(0, 1fr));
        column-gap: var(--home-gap-x, 1.05rem);
        row-gap: var(--home-gap-y, 1.55rem);
        justify-items: center;
        align-content: start;
      }

      .panel-empty-wrap,
      .panel-signin {
        display: grid;
        place-items: center;
        box-sizing: border-box;
        width: 100%;
        padding: 0.5rem var(--home-inline, 0.85rem) 0.25rem;
      }

      .panel-signin {
        align-content: center;
        justify-items: center;
        gap: 0.65rem;
        text-align: center;
        padding-block: 2.35rem 2.1rem;
      }

      .panel-empty {
        margin: 0;
        padding: 1rem 0.5rem;
        text-align: center;
        font-size: 0.9375rem;
        font-weight: 600;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.85);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
      }

      .panel-signin-title {
        margin: 0;
        max-width: 18rem;
        font-size: 1.125rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.3;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.32);
      }

      .panel-signin-desc {
        margin: 0 0 0.55rem;
        max-width: 18rem;
        font-size: 0.875rem;
        font-weight: 450;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.78);
        text-shadow: 0 1px 1.5px rgba(0, 0, 0, 0.25);
      }

      .panel-signin-btn {
        appearance: none;
        -webkit-appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.34);
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.28) 0%,
            rgba(255, 255, 255, 0.14) 100%
          );
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
        color: #fff;
        font: inherit;
        font-size: 0.9375rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1;
        padding: 0.85rem 1.55rem;
        border-radius: 999px;
        cursor: pointer;
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.18),
          inset 0 1px 0 rgba(255, 255, 255, 0.35);
        text-shadow: 0 1px 1.5px rgba(0, 0, 0, 0.28);
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.16s cubic-bezier(0.2, 0.9, 0.2, 1), background 0.16s ease;
      }

      .panel-signin-btn:active {
        transform: scale(0.97);
      }

      .page-dots {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        margin-top: 0.55rem;
        min-height: 0.42rem;
        padding-inline: var(--home-inline, 0.85rem);
      }

      .page-dot {
        flex: none;
        box-sizing: border-box;
        width: 0.42rem;
        height: 0.42rem;
        min-width: 0.42rem;
        min-height: 0.42rem;
        max-width: 0.42rem;
        max-height: 0.42rem;
        aspect-ratio: 1;
        padding: 0;
        margin: 0;
        border: 0;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.38);
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.15s ease, transform 0.15s ease;
      }

      .page-dot.active {
        background: #fff;
        transform: scale(1.15);
      }

      .shortcuts {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        width: calc(100% - 2 * var(--home-inline, 1.25rem));
        max-width: 100%;
        margin-inline: auto;
        box-sizing: border-box;
      }

      @media (min-width: 640px) {
        .shortcuts {
          flex-direction: row;
          align-items: stretch;
        }

        .shortcut {
          flex: 1;
          min-width: 0;
        }
      }

      .shortcut {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        min-height: 4.75rem;
        padding: 1rem 1.15rem;
        border-radius: 1.5rem;
        text-decoration: none;
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.16),
          inset 0 1px 0 rgba(255, 255, 255, 0.22);
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.16s cubic-bezier(0.2, 0.9, 0.2, 1);
      }

      .shortcut:active {
        transform: scale(0.985);
      }

      .shortcut.gallery {
        background:
          linear-gradient(
            105deg,
            rgba(120, 100, 210, 0.55),
            rgba(140, 130, 200, 0.42) 55%,
            rgba(150, 145, 195, 0.38)
          );
      }

      .shortcut.create {
        background:
          linear-gradient(
            105deg,
            rgba(200, 70, 170, 0.62),
            rgba(220, 90, 150, 0.55) 45%,
            rgba(230, 120, 140, 0.48)
          );
      }

      .shortcut-badge {
        flex: none;
        display: grid;
        place-items: center;
        width: 2.85rem;
        height: 2.85rem;
        border-radius: 50%;
        color: #fff;
        border: 0;
        box-shadow: none;
      }

      .shortcut.gallery .shortcut-badge {
        background: linear-gradient(
          160deg,
          rgba(165, 150, 235, 0.78) 0%,
          rgba(135, 120, 210, 0.68) 100%
        );
      }

      .shortcut.create .shortcut-badge {
        background: linear-gradient(
          160deg,
          rgba(235, 130, 185, 0.82) 0%,
          rgba(215, 95, 155, 0.72) 100%
        );
      }

      .shortcut-badge [ui-icon] {
        --ui-icon-size: 1.55rem;
        color: #fff;
        filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.22));
      }

      .shortcut-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.18rem;
      }

      .shortcut-title {
        font-size: 1.0625rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.15;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
      }

      .shortcut-desc {
        font-size: 0.8125rem;
        font-weight: 450;
        line-height: 1.25;
        color: rgba(255, 255, 255, 0.78);
        text-shadow: 0 1px 1.5px rgba(0, 0, 0, 0.22);
      }

      .shortcut-chevron {
        flex: none;
        --ui-icon-size: 1.15rem;
        color: rgba(255, 255, 255, 0.88);
        opacity: 0.92;
      }
    }
  `;

  return [view, style];
}
