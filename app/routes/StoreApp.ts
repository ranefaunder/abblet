import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { t } from "/utils/i18n";
import { appEditUrl, appPageUrl, storeAppUrl, storeUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import type { AppCategory } from "/utils/app-categories";
import type { StoreAppCard } from "/types/app-types";
import {
  clearStoreApp,
  openAppInstall,
  loadStore,
  loadStoreApp,
  storeApp,
  storeApps,
  storeBusy,
  storeAppError,
  storeAppLoading,
  remixStoreApp,
} from "/app/stores/storeListingStore";
import { requireLogin } from "/app/stores/userStore";

export const StoreAppPath = "/:lang/store/:slug" as const;

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

function RelatedTile({ app, lang }: { app: StoreAppCard; lang: string }) {
  const iconSrc = appIconSrc(app.iconId);
  return html`
    <a class="related-tile" href=${storeAppUrl(lang, app.slug)} ui-column="gap-sm">
      <span
        class="related-icon"
        style=${`background: ${previewGradient(app.slug)}`}
        aria-hidden="true"
      >
        ${iconSrc
          ? html`<img src=${iconSrc} alt="" width="64" height="64" decoding="async" />`
          : html`<span>${draftLetter(app.title)}</span>`}
      </span>
      <strong>${app.title}</strong>
      <small>${app.tagline || (app.category ? t(app.category as AppCategory) : t("App"))}</small>
    </a>
  `;
}

export default function StoreApp(_props: RoutePropsForPath<typeof StoreAppPath>) {
  const { params } = useRoute();
  const { route } = useLocation();
  const lang = params.lang ?? "en";
  const slug = params.slug ?? "";
  const app = storeApp.value;
  const loading = storeAppLoading.value;
  const busy = storeBusy.value;
  const [shareLabel, setShareLabel] = useState(t("Share"));
  const [copiedFlash, setCopiedFlash] = useState(false);

  useEffect(() => {
    if (slug) void loadStoreApp(slug);
    if (storeApps.value.length === 0) void loadStore();
    return () => clearStoreApp();
  }, [slug]);

  useEffect(() => {
    setShareLabel(t("Share"));
    setCopiedFlash(false);
  }, [slug, lang]);

  function onInstall() {
    if (!app) return;
    openAppInstall(app.slug);
  }

  function onOpen() {
    if (!app) return;
    window.location.href = appPageUrl(lang, app.slug);
  }

  async function onRemix() {
    if (!app) return;
    const cloned = await remixStoreApp(app.slug);
    if (cloned?.slug) {
      route(appEditUrl(lang, cloned.slug));
    }
  }

  async function onShare() {
    if (!app) return;
    const url = `${window.location.origin}${storeAppUrl(lang, app.slug)}`;
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

  const primaryCta = !app
    ? null
    : app.isOwner
      ? { label: t("Edit"), action: () => route(appEditUrl(lang, app.slug)), href: appEditUrl(lang, app.slug) }
      : app.installed
        ? { label: t("Open"), action: onOpen, href: null }
        : { label: t("Install"), action: onInstall, href: null };

  const view = html`
    <div data-scope="StoreApp" ui-column>
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
              <a href=${storeUrl(lang)} ui-button="primary sm">${t("Back to Store")}</a>
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
                      ${primaryCta?.href
                        ? html`<a href=${primaryCta.href} ui-button="primary">${primaryCta.label}</a>`
                        : html`
                          <button
                            type="button"
                            ui-button="primary"
                            disabled=${busy}
                            aria-busy=${busy}
                            onClick=${() => primaryCta?.action()}
                          >
                            ${primaryCta?.label}
                          </button>`}
                      ${!app.isOwner
                        ? html`
                          <button
                            type="button"
                            ui-button
                            disabled=${busy}
                            aria-busy=${busy}
                            onClick=${() => void onRemix()}
                          >
                            ${t("Remix")}
                          </button>`
                        : html`<a ui-button href=${appPageUrl(lang, app.slug)}>${t("Preview")}</a>`}
                      ${app.installed && !app.isOwner
                        ? html`
                          <button
                            type="button"
                            ui-button
                            disabled=${busy}
                            onClick=${() => onInstall()}
                          >
                            ${t("Install")}
                          </button>`
                        : !app.isOwner
                          ? html`<a ui-button href=${appPageUrl(lang, app.slug)}>${t("Preview")}</a>`
                          : ""}
                    </div>
                  </div>
                </div>
              </section>

              ${storeAppError.value
                ? html`<p class="error" role="alert">${storeAppError.value}</p>`
                : ""}

              <section class="meta" ui-row="gap-md x-around wrap">
                <div ui-column="gap-xs x-center">
                  <strong>${app.installCount}</strong>
                  <small>${t("Installs")}</small>
                </div>
                <div ui-column="gap-xs x-center">
                  <strong>${app.remixCount}</strong>
                  <small>${t("Remixes")}</small>
                </div>
                ${published
                  ? html`
                    <div ui-column="gap-xs x-center">
                      <strong class="date">${published}</strong>
                      <small>${t("Published")}</small>
                    </div>`
                  : ""}
              </section>

              ${app.description
                ? html`
                  <section class="about" ui-column="gap-sm">
                    <h2 ui-heading="sm">${t("About")}</h2>
                    <p>${app.description}</p>
                  </section>`
                : ""}

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
                    <div class="related-rail" ui-row="gap-md">
                      ${related.map(
                        (item) => html`<${RelatedTile} app=${item} lang=${lang} />`,
                      )}
                    </div>
                  </section>`
                : ""}
            </div>`}
    </div>
  `;

  const style = css`
    @scope ([data-scope="StoreApp"]) to ([data-scope]) {
      & {
        flex: 1;
        min-height: 0;
        background: var(--neutral-50);
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

      .meta {
        padding: 0.85rem 0.5rem;
        border-block: 1px solid var(--neutral-200);
      }

      .meta strong {
        font-size: 1.05rem;
        color: var(--neutral-950);
      }

      .meta strong.date {
        font-size: 0.9rem;
      }

      .meta small {
        color: var(--neutral-500);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 0.6875rem;
        font-weight: 650;
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

      .related-rail {
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
        padding-bottom: 0.15rem;
      }

      .related-rail::-webkit-scrollbar {
        display: none;
      }

      .related-tile {
        flex: none;
        width: 6.75rem;
        text-decoration: none;
        color: inherit;
      }

      .related-tile strong {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: 0.875rem;
        line-height: 1.25;
      }

      .related-tile small {
        color: var(--neutral-500);
        font-size: 0.6875rem;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .related-icon {
        width: 4.5rem;
        height: 4.5rem;
        border-radius: 1rem;
        overflow: hidden;
        display: grid;
        place-items: center;
        color: var(--white);
        font-weight: 700;
        font-size: 1.35rem;
      }

      .related-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
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
      }
    }
  `;

  return [view, style];
}
