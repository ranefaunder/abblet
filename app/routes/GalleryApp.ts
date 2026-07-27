import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { useLocation, useRoute } from "preact-iso";
import { t } from "/utils/i18n";
import { appEditUrl, appPageUrl, galleryUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import {
  clearGalleryApp,
  openAppInstall,
  loadGalleryApp,
  galleryApp,
  galleryBusy,
  galleryAppError,
  galleryAppLoading,
  remixGalleryApp,
} from "/app/stores/galleryStore";
import type { AppCategory } from "/utils/app-categories";

export const GalleryAppPath = "/:lang/gallery/:slug" as const;

export default function GalleryApp(_props: RoutePropsForPath<typeof GalleryAppPath>) {
  const { params } = useRoute();
  const { route } = useLocation();
  const lang = params.lang ?? "en";
  const slug = params.slug ?? "";
  const app = galleryApp.value;
  const loading = galleryAppLoading.value;
  const busy = galleryBusy.value;

  useEffect(() => {
    if (slug) void loadGalleryApp(slug);
    return () => clearGalleryApp();
  }, [slug]);

  function onInstall() {
    if (!app) return;
    openAppInstall(app.slug);
  }

  async function onRemix() {
    if (!app) return;
    const cloned = await remixGalleryApp(app.slug);
    if (cloned?.slug) {
      route(appEditUrl(lang, cloned.slug));
    }
  }

  const iconSrc = appIconSrc(app?.iconId);
  const gradient = previewGradient(slug);
  const letter = draftLetter(app?.title ?? "?");

  const view = html`
    <div data-scope="GalleryApp" ui-column>
      <header class="top" ui-padding="inline-md block-md">
        <div class="top-row">
          <div class="top-start">
            <a
              href=${galleryUrl(lang)}
              ui-button="tertiary square sm"
              ui-icon="arrow-left"
              aria-label=${t("Back")}
            ></a>
          </div>
          <div class="top-center">
            <h1 ui-heading="sm">${t("Store")}</h1>
          </div>
          <div class="top-end" aria-hidden="true"></div>
        </div>
      </header>

      ${loading && !app
        ? html`
          <div ui-column="gap-md x-center y-center" ui-padding="xl" class="state">
            <i ui-icon="spinner lg"></i>
            <p>${t("Loading…")}</p>
          </div>`
        : !app
          ? html`
            <div ui-column="gap-md x-center y-center" ui-padding="xl" class="state">
              <p>${galleryAppError.value ?? t("App not found")}</p>
              <a href=${galleryUrl(lang)} ui-button="primary sm">${t("Store")}</a>
            </div>`
          : html`
            <div class="content" ui-column="gap-lg x-center">
              <div ui-column="gap-sm x-center" class="hero">
                <span class="app-icon" style=${`background: ${gradient}`} aria-hidden="true">
                  ${iconSrc
                    ? html`<img src=${iconSrc} alt="" width="112" height="112" decoding="async" />`
                    : html`<span>${letter}</span>`}
                </span>
                <h1 ui-heading="lg">${app.title}</h1>
                <p class="tagline">${app.tagline || app.description}</p>
                ${app.ownerNickname
                  ? html`<p class="author">${t("By $name", { name: app.ownerNickname })}</p>`
                  : ""}
              </div>

              <div ui-row="gap-sm x-center wrap">
                <button
                  type="button"
                  ui-button="primary"
                  disabled=${busy}
                  aria-busy=${busy}
                  onClick=${() => onInstall()}
                >
                  ${t("Install")}
                </button>
                ${app.isOwner
                  ? html`<a ui-button href=${appEditUrl(lang, app.slug)}>${t("Edit")}</a>`
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
                <a ui-button href=${appPageUrl(lang, app.slug)}>${t("Preview")}</a>
              </div>

              ${galleryAppError.value
                ? html`<p ui-card="error" ui-padding="md" role="alert">${galleryAppError.value}</p>`
                : ""}

              <section ui-card ui-padding="lg" ui-column="gap-md" class="panel">
                <div ui-row="gap-lg x-around">
                  <div ui-column="gap-xs x-center">
                    <strong>${app.installCount}</strong>
                    <small>${t("Installs")}</small>
                  </div>
                  ${app.category
                    ? html`
                      <div ui-column="gap-xs x-center">
                        <strong>${t(app.category as AppCategory)}</strong>
                        <small>${t("Category")}</small>
                      </div>`
                    : ""}
                </div>
                <hr />
                <div ui-column="gap-xs">
                  <h2 ui-heading="sm">${t("About")}</h2>
                  <p class="about">${app.description}</p>
                </div>
              </section>
            </div>`}
    </div>
  `;

  const style = css`
    @scope ([data-scope="GalleryApp"]) to ([data-scope]) {
      & {
        flex: 1;
        min-height: 0;
        background: var(--neutral-50);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .top {
        flex: none;
        padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
        border-bottom: 1px solid var(--neutral-200);
        background: color-mix(in oklab, var(--neutral-50) 88%, var(--white));
        backdrop-filter: blur(12px);
      }

      .top-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
      }

      .top-start {
        justify-self: start;
      }

      .top-center {
        justify-self: center;
        min-width: 0;
        text-align: center;
      }

      .top-center h1 {
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .top-end {
        justify-self: stretch;
        min-width: 0;
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
        width: min(100%, 36rem);
        margin-inline: auto;
        padding: 1rem 1rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
        box-sizing: border-box;
      }

      .hero {
        text-align: center;
      }

      .app-icon {
        width: 7rem;
        height: 7rem;
        border-radius: 1.5rem;
        overflow: hidden;
        display: grid;
        place-items: center;
        color: var(--white);
        font-size: 2.5rem;
        font-weight: 750;
        box-shadow: 0 10px 28px oklch(from var(--neutral-900) l c h / 18%);
      }

      .app-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .tagline {
        margin: 0;
        max-width: 22rem;
        color: var(--neutral-600);
      }

      .author {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--primary-600);
      }

      .panel {
        width: 100%;
      }

      .panel small {
        color: var(--neutral-500);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 0.6875rem;
        font-weight: 650;
      }

      .about {
        margin: 0;
        white-space: pre-wrap;
        color: var(--neutral-700);
      }

      @media (min-width: 720px) {
        .top {
          width: min(100%, 36rem);
          margin-inline: auto;
        }
      }
    }
  `;

  return [view, style];
}
