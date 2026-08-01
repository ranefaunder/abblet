import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { t } from "/utils/i18n";
import { createUrl, openAppUrl, catalogAppUrl, appsUrl, gamesUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import type { AppCategory } from "/utils/app-categories";
import {
  clearStoreApp,
  loadStore,
  loadStoreApp,
  recordAppOpen,
  storeApp,
  storeApps,
  storeBusy,
  storeAppError,
  storeAppLoading,
  remixStoreApp,
} from "/app/stores/storeListingStore";
import AppSlider from "/app/components/AppSlider";
import CodeViewDialog from "/app/components/CodeViewDialog";

export const AppPath = "/:lang/apps/:slug" as const;
export const GamePath = "/:lang/games/:slug" as const;

type AppRouteProps =
  | RoutePropsForPath<typeof AppPath>
  | RoutePropsForPath<typeof GamePath>;

function formatPublishedAt(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(lang === "fi" ? "fi-FI" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

export default function App(_props: AppRouteProps) {
  const { params } = useRoute();
  const { route, path } = useLocation();
  const lang = params.lang ?? "en";
  const slug = params.slug ?? "";
  const catalog: "apps" | "games" = (path ?? "").includes(`/${lang}/games/`)
    ? "games"
    : "apps";
  const catalogListUrl = catalog === "games" ? gamesUrl(lang) : appsUrl(lang);
  const detailUrl = (s: string) => catalogAppUrl(lang, s, catalog);
  const app = storeApp.value;
  const loading = storeAppLoading.value;
  const busy = storeBusy.value;
  const [shareLabel, setShareLabel] = useState(t("Share"));
  const [copiedFlash, setCopiedFlash] = useState(false);

  useEffect(() => {
    if (slug) void loadStoreApp(slug);
    if (storeApps.value.length === 0) {
      void loadStore(
        catalog === "games"
          ? { category: "Games", excludeCategory: null }
          : undefined,
      );
    }
    return () => clearStoreApp();
  }, [slug, catalog]);

  useEffect(() => {
    setShareLabel(t("Share"));
    setCopiedFlash(false);
  }, [slug, lang]);

  async function onRemix() {
    if (!app) return;
    const cloned = await remixStoreApp(app.slug);
    if (cloned?.slug) {
      route(createUrl(lang, cloned.slug));
    }
  }

  async function onShare() {
    if (!app) return;
    const url = `${window.location.origin}${detailUrl(app.slug)}`;
    const shareData = { title: app.title, text: app.tagline || app.title, url };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareLabel(t("Link copied"));
      setCopiedFlash(true);
      window.setTimeout(() => {
        setShareLabel(t("Share"));
        setCopiedFlash(false);
      }, 1800);
    } catch {
      /* ignore */
    }
  }

  const iconSrc = appIconSrc(app?.iconId);
  const gradient = previewGradient(slug);
  const letter = draftLetter(app?.title ?? "?");
  const published = formatPublishedAt(app?.publishedAt ?? null, lang);

  const related =
    app && app.category
      ? storeApps.value
          .filter((a) => a.slug !== app.slug && a.category === app.category)
          .slice(0, 8)
      : storeApps.value.filter((a) => a.slug !== slug).slice(0, 8);

  const view = html`
    <div data-scope="App" ui-column>
      ${loading && !app
        ? html`
          <div ui-column="gap-md x-center y-center" ui-padding="xl" class="state">
            <i ui-icon="spinner lg"></i>
            <p>${t("Loading…")}</p>
          </div>`
        : !app
          ? html`
            <div ui-column="gap-md x-center y-center" ui-padding="xl" class="state">
              <p>${storeAppError.value ?? t("App not found")}</p>
              <a href=${catalogListUrl} ui-button="primary sm">
                ${catalog === "games" ? t("Back to Games") : t("Back to Apps")}
              </a>
            </div>`
          : html`
            <div class="content" ui-column="gap-xl" ui-padding="inline-md">
              <section class="hero">
                <span
                  class="app-icon"
                  style=${iconSrc ? "" : `background: ${gradient}`}
                  aria-hidden="true"
                >
                  ${iconSrc
                    ? html`<img src=${iconSrc} alt="" width="112" height="112" decoding="async" />`
                    : html`<span>${letter}</span>`}
                </span>
                <div class="hero-main" ui-column="gap-md">
                  <div class="hero-copy" ui-column="gap-sm">
                    <h1 class="title">${app.title}</h1>
                    ${app.tagline ? html`<p class="tagline">${app.tagline}</p>` : ""}
                  </div>
                  <div class="actions" ui-column="gap-sm">
                    <div class="cta-row" ui-row="gap-sm wrap">
                      <a
                        href=${openAppUrl(lang, app.slug)}
                        ui-button="primary"
                        onClick=${() => recordAppOpen(app.slug)}
                      >${t("Open")}</a>
                      ${app.isOwner
                        ? html`<a href=${createUrl(lang, app.slug)} ui-button>${t("Edit")}</a>`
                        : html`
                          <button
                            type="button"
                            ui-button
                            disabled=${busy}
                            aria-busy=${busy}
                            onClick=${() => void onRemix()}
                          >
                            ${t("Remix")}
                          </button>`}
                    </div>
                  </div>
                </div>
              </section>

              ${storeAppError.value
                ? html`<p class="error" role="alert">${storeAppError.value}</p>`
                : ""}

              ${app.description
                ? html`
                  <section class="about" ui-column="gap-sm">
                    <h2 ui-heading="sm">${t("About")}</h2>
                    <p>${app.description}</p>
                  </section>`
                : ""}

              ${published
                ? html`
                  <p class="published-line">
                    ${t("Published")} · ${published}
                  </p>`
                : ""}

              <section class="open-source">
                <div class="open-source-bg" aria-hidden="true"></div>
                <div class="open-source-mark" aria-hidden="true">
                  <i ui-icon="copyleft 2xl"></i>
                </div>
                <div class="open-source-inner" ui-column="gap-md">
                  <header class="open-source-head" ui-column="gap-sm">
                    <p class="open-source-eyebrow">${t("Open source")}</p>
                    <h2>${t("Proudly open source")}</h2>
                    <p class="open-source-lede">
                      ${t("Every app in the Store ships with its source. Read it, learn from it, remix it — under the Mozilla Public License 2.0.")}
                    </p>
                  </header>
                  <div class="open-source-actions" ui-row="gap-sm y-center wrap">
                    ${app.code
                      ? html`
                        <button
                          type="button"
                          ui-button="sm"
                          ui-icon="code"
                          commandfor="store-code-dialog"
                          command="show-modal"
                        >
                          ${t("View source")}
                        </button>`
                      : ""}
                    <a
                      href="https://www.mozilla.org/MPL/2.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                      ui-button="tertiary sm"
                    >${t("Mozilla Public License 2.0")}</a>
                  </div>
                </div>
                ${app.code
                  ? html`<${CodeViewDialog} id="store-code-dialog" code=${app.code} />`
                  : ""}
              </section>

              <section class="share-row" ui-row="gap-sm y-center x-between wrap">
                <div ui-column="gap-xs">
                  <strong>${t("Share this app")}</strong>
                  <small>${t("Send the Store link to a friend.")}</small>
                </div>
                <button
                  type="button"
                  ui-button=${copiedFlash ? "primary sm" : "sm"}
                  onClick=${() => void onShare()}
                >
                  ${shareLabel}
                </button>
              </section>

              ${!app.isOwner
                ? html`
                  <section class="remix-pitch">
                    <div class="remix-pitch-bg" aria-hidden="true"></div>
                    <div class="remix-pitch-inner" ui-column="gap-md">
                      <header class="remix-head" ui-column="gap-sm">
                        <h2>${t("Make it yours with Remix")}</h2>
                        <p class="remix-lede">
                          ${t("Remix creates your own copy of this app. Then change it by chatting — add features, tweak the look, make it fit you. No code needed.")}
                        </p>
                      </header>
                      <div class="remix-cta">
                        <button
                          type="button"
                          ui-button="primary"
                          disabled=${busy}
                          aria-busy=${busy}
                          onClick=${() => void onRemix()}
                        >
                          ${t("Remix")}
                        </button>
                      </div>
                    </div>
                  </section>`
                : ""}

              ${related.length > 0
                ? html`
                  <section ui-column="gap-sm">
                    <h2 ui-heading="sm">${t("More like this")}</h2>
                    <${AppSlider}
                      label=${t("More like this")}
                      items=${related.map((item) => ({
                        slug: item.slug,
                        title: item.title,
                        iconId: item.iconId,
                        href: detailUrl(item.slug),
                        subtitle:
                          item.tagline ||
                          (item.category ? t(item.category as AppCategory) : t("App")),
                      }))}
                    />
                  </section>`
                : ""}
            </div>`}
    </div>
  `;

  const style = css`
    @scope ([data-scope="App"]) to ([data-scope]) {
      & {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .state {
        flex: 1;
        color: var(--neutral-500);
        text-align: center;
        overflow-y: auto;
      }

      .content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding-top: 1.25rem;
        padding-bottom: calc(1.75rem + env(safe-area-inset-bottom, 0px));
        max-width: 48rem;
        width: 100%;
        margin-inline: auto;
        box-sizing: border-box;
      }

      .hero {
        margin: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.25rem;
        text-align: center;
      }

      .hero-main {
        width: 100%;
        align-items: center;
      }

      .hero-copy {
        align-items: center;
      }

      .app-icon {
        flex: none;
        width: 6.5rem;
        height: 6.5rem;
        border-radius: 1.4rem;
        overflow: hidden;
        display: grid;
        place-items: center;
        color: var(--white);
        font-size: 2.35rem;
        font-weight: 750;
      }

      .app-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .title {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 750;
        letter-spacing: -0.03em;
        line-height: 1.15;
        color: var(--neutral-950);
      }

      .tagline {
        margin: 0;
        max-width: 28rem;
        color: var(--neutral-600);
        font-size: 1.05rem;
        line-height: 1.4;
      }

      .actions {
        width: 100%;
        align-items: center;
      }

      .cta-row {
        justify-content: center;
      }

      .error {
        margin: 0;
        padding: 0.85rem 1rem;
        border-radius: 0.9rem;
        background: color-mix(in oklab, var(--error-100) 80%, var(--white));
        color: var(--error-800);
        border: 1px solid var(--error-200);
      }

      .about h2 {
        margin: 0;
      }

      .about p {
        margin: 0;
        white-space: pre-wrap;
        color: var(--neutral-700);
        line-height: 1.5;
      }

      .published-line {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--neutral-500);
      }

      .open-source {
        position: relative;
        overflow: hidden;
        border-radius: 1.25rem;
        border: 1px solid color-mix(in oklab, var(--success-300) 50%, var(--neutral-200));
        background: var(--white);
        isolation: isolate;
      }

      .open-source-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        background:
          radial-gradient(110% 90% at 100% 0%, color-mix(in oklab, var(--success-200) 60%, transparent), transparent 55%),
          radial-gradient(80% 70% at 0% 100%, color-mix(in oklab, var(--info-200) 45%, transparent), transparent 50%),
          linear-gradient(155deg, color-mix(in oklab, var(--success-50) 75%, var(--white)), var(--white) 52%, var(--neutral-50));
        pointer-events: none;
      }

      .open-source-bg::before {
        content: "</>";
        position: absolute;
        right: -0.15rem;
        bottom: -0.55rem;
        font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace;
        font-size: clamp(4.5rem, 22vw, 7.5rem);
        font-weight: 800;
        letter-spacing: -0.08em;
        line-height: 0.85;
        color: color-mix(in oklab, var(--success-700) 12%, transparent);
        transform: rotate(-8deg);
        pointer-events: none;
        user-select: none;
      }

      .open-source-bg::after {
        content: "";
        position: absolute;
        inset: auto 40% -40% -15%;
        height: 75%;
        border-radius: 50%;
        background: color-mix(in oklab, var(--success-100) 55%, transparent);
        filter: blur(30px);
        opacity: 0.8;
      }

      .open-source-mark {
        position: absolute;
        top: 1.15rem;
        right: 1.15rem;
        z-index: 1;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: color-mix(in oklab, var(--white) 70%, var(--success-100));
        border: 1px solid color-mix(in oklab, var(--success-300) 55%, var(--neutral-200));
        color: var(--success-800);
        box-shadow: 0 8px 24px color-mix(in oklab, var(--success-700) 10%, transparent);
      }

      .open-source-inner {
        position: relative;
        z-index: 1;
        padding: 1.5rem 1.25rem 1.4rem;
        max-width: 30rem;
      }

      .open-source-eyebrow {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--success-800);
      }

      .open-source-head h2 {
        margin: 0;
        font-size: clamp(1.15rem, 3.2vw, 1.35rem);
        font-weight: 750;
        letter-spacing: -0.03em;
        line-height: 1.15;
        color: var(--neutral-950);
      }

      .open-source-lede {
        margin: 0;
        color: var(--neutral-700);
        font-size: 0.9375rem;
        line-height: 1.45;
      }

      .open-source-actions {
        margin-top: 0.15rem;
      }

      .remix-pitch {
        position: relative;
        overflow: hidden;
        border-radius: 1.25rem;
        border: 1px solid color-mix(in oklab, var(--primary-200) 55%, var(--neutral-200));
        background: var(--white);
        isolation: isolate;
      }

      .remix-pitch-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        background:
          radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--primary-200) 55%, transparent), transparent 55%),
          radial-gradient(90% 80% at 100% 10%, color-mix(in oklab, var(--secondary-200) 40%, transparent), transparent 50%),
          linear-gradient(165deg, color-mix(in oklab, var(--primary-50) 70%, var(--white)), var(--white) 58%, var(--neutral-50));
        pointer-events: none;
      }

      .remix-pitch-bg::after {
        content: "";
        position: absolute;
        inset: auto -10% -35% 35%;
        height: 70%;
        border-radius: 50%;
        background: color-mix(in oklab, var(--primary-100) 45%, transparent);
        filter: blur(28px);
        opacity: 0.7;
      }

      .remix-pitch-inner {
        position: relative;
        z-index: 1;
        padding: 1.5rem 1.25rem 1.4rem;
        max-width: 28rem;
      }

      .remix-head h2 {
        margin: 0;
        font-size: 1.45rem;
        font-weight: 700;
        letter-spacing: -0.035em;
        line-height: 1.12;
        color: var(--neutral-950);
      }

      .remix-lede {
        margin: 0;
        color: var(--neutral-600);
        font-size: 1rem;
        line-height: 1.45;
      }

      .remix-cta {
        display: flex;
      }

      .share-row {
        padding: 1rem 1.05rem;
        border-radius: 1rem;
        background: var(--white);
        border: 1px solid var(--neutral-200);
      }

      .share-row strong {
        font-size: 0.9375rem;
      }

      .share-row small {
        color: var(--neutral-500);
        font-size: 0.8125rem;
      }

      @media (min-width: 720px) {
        .hero {
          flex-direction: row;
          align-items: flex-start;
          text-align: left;
          gap: 1.75rem;
        }

        .hero-main,
        .hero-copy,
        .actions {
          align-items: flex-start;
        }

        .cta-row {
          justify-content: flex-start;
        }

        .app-icon {
          width: 8.5rem;
          height: 8.5rem;
          border-radius: 1.65rem;
          font-size: 2.75rem;
        }

        .title {
          font-size: 2.25rem;
        }

        .remix-pitch-inner {
          padding: 1.75rem 1.5rem 1.55rem;
        }

        .remix-head h2 {
          font-size: 1.7rem;
        }

        .open-source-inner {
          padding: 1.75rem 1.5rem 1.55rem;
        }

        .open-source-mark {
          top: 1.35rem;
          right: 1.35rem;
          width: 3rem;
          height: 3rem;
        }
      }
    }
  `;

  return [view, style];
}
