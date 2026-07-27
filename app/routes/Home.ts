import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { type AppCategory, isAppCategory } from "/utils/app-categories";
import { aboutUrl, appEditUrl, appPageUrl, galleryAppUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter, draftAccentColor } from "/utils/app-preview";
import type { GalleryAppCard } from "/types/app-types";
import {
  galleryApps,
  galleryCategories,
  galleryCategory,
  galleryError,
  galleryLoading,
  galleryQuery,
  installHistory,
  loadGallery,
  loadInstallHistory,
} from "/app/stores/galleryStore";
import { isLoggedIn, logout, openLoginDialog, requireLogin, user } from "/app/stores/userStore";

export const HomePath = "/:lang" as const;

function categoryLabel(category: AppCategory): string {
  return t(category);
}

function formatInstalledAt(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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

function AppIcon({
  app,
  size = "",
}: {
  app: Pick<GalleryAppCard, "slug" | "title" | "iconId">;
  size?: "" | "sm" | "md" | "lg";
}) {
  const iconSrc = appIconSrc(app.iconId);
  return html`
    <span
      class=${`app-icon${size ? ` ${size}` : ""}`}
      style=${`background: ${previewGradient(app.slug)}`}
      aria-hidden="true"
    >
      ${iconSrc
        ? html`<img src=${iconSrc} alt="" width="64" height="64" decoding="async" />`
        : html`<span>${draftLetter(app.title)}</span>`}
    </span>
  `;
}

function TodayCard({ app, lang }: { app: GalleryAppCard; lang: string }) {
  const cta = app.isOwner ? t("Edit") : app.installed ? t("Open") : t("Get");
  return html`
    <a
      class="today-card"
      href=${galleryAppUrl(lang, app.slug)}
      style=${`--card-gradient: ${previewGradient(app.slug)}; --card-accent: ${draftAccentColor(app.slug)}`}
    >
      <span class="today-art" aria-hidden="true">
        <${AppIcon} app=${app} size="lg" />
      </span>
      <span class="today-body" ui-column="gap-sm">
        <small>${t("Featured")}</small>
        <strong>${app.title}</strong>
        <p>${app.tagline || app.description}</p>
      </span>
      <span class="today-footer" ui-row="y-center gap-md">
        <${AppIcon} app=${app} size="sm" />
        <span ui-column="gap-xs" class="meta">
          <strong>${app.title}</strong>
          <small>${app.category ? categoryLabel(app.category as AppCategory) : t("App")}</small>
        </span>
        <span ui-button="primary sm">${cta}</span>
      </span>
    </a>
  `;
}

function RailTile({ app, lang }: { app: GalleryAppCard; lang: string }) {
  return html`
    <a class="rail-tile" href=${galleryAppUrl(lang, app.slug)} ui-column="gap-sm">
      <${AppIcon} app=${app} size="md" />
      <strong>${app.title}</strong>
      <small>${app.tagline || app.category || t("App")}</small>
    </a>
  `;
}

function ChartRow({
  app,
  lang,
  rank,
}: {
  app: GalleryAppCard;
  lang: string;
  rank: number;
}) {
  const cta = app.isOwner ? t("Edit") : app.installed ? t("Open") : t("Get");
  return html`
    <a class="chart-row" href=${galleryAppUrl(lang, app.slug)} ui-row="y-center gap-md">
      <span class="rank">${rank}</span>
      <${AppIcon} app=${app} />
      <span ui-column="gap-xs" class="meta">
        <strong>${app.title}</strong>
        <small>${app.tagline || app.description}</small>
      </span>
      <span ui-button="sm">${cta}</span>
    </a>
  `;
}

function groupByCategory(apps: GalleryAppCard[]): { category: AppCategory; apps: GalleryAppCard[] }[] {
  const map = new Map<AppCategory, GalleryAppCard[]>();
  for (const app of apps) {
    const cat = isAppCategory(app.category) ? app.category : "Utilities";
    const list = map.get(cat) ?? [];
    list.push(app);
    map.set(cat, list);
  }
  return [...map.entries()]
    .map(([category, list]) => ({ category, apps: list }))
    .filter((g) => g.apps.length >= 2)
    .sort((a, b) => b.apps.length - a.apps.length);
}

export default function Home(_props: RoutePropsForPath<typeof HomePath>) {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const draftQ = useSignal(galleryQuery.value);
  const searchOpen = useSignal(Boolean(galleryQuery.value.trim()));
  const searchRef = useRef<HTMLInputElement>(null);
  const apps = galleryApps.value;
  const loading = galleryLoading.value;
  const category = galleryCategory.value;
  const categories = galleryCategories.value;
  const history = installHistory.value;
  const visibleCategories =
    category && !categories.includes(category) ? [...categories, category] : categories;
  const isDefaultBrowse = !galleryQuery.value.trim() && !category;
  const loggedIn = isLoggedIn();

  const featuredApps = isDefaultBrowse ? apps.slice(0, Math.min(2, apps.length)) : [];
  const popular = [...apps]
    .sort((a, b) => b.installCount - a.installCount || b.remixCount - a.remixCount)
    .slice(0, 12);
  const charts = [...apps]
    .sort((a, b) => b.installCount - a.installCount || b.remixCount - a.remixCount)
    .slice(0, 8);
  const categoryGroups = isDefaultBrowse ? groupByCategory(apps).slice(0, 4) : [];
  const filteredList = !isDefaultBrowse ? apps : [];

  useEffect(() => {
    void loadGallery();
    void loadInstallHistory();
  }, []);

  useEffect(() => {
    if (searchOpen.value) searchRef.current?.focus();
  }, [searchOpen.value]);

  function submitSearch(e: Event) {
    e.preventDefault();
    void loadGallery({ q: draftQ.value });
  }

  function openSearch() {
    searchOpen.value = true;
  }

  function onSearchBlur() {
    if (draftQ.value.trim()) return;
    searchOpen.value = false;
    if (galleryQuery.value.trim()) void loadGallery({ q: "" });
  }

  function selectCategory(next: AppCategory | null) {
    void loadGallery({ category: next });
  }

  const accountMenu = loggedIn
    ? html`
        <div ui-menu="bottom-right">
          <button type="button" ui-button="tertiary sm" popovertarget="store-account-menu">
            ${user.value?.nickname || user.value?.email || t("Account")}
          </button>
          <div id="store-account-menu" popover="auto" role="menu">
            <a role="menuitem" href=${`/${lang}/settings`}>${t("Settings")}</a>
            <a role="menuitem" href=${aboutUrl(lang)}>${t("About Rmix")}</a>
            <hr />
            <button type="button" role="menuitem" onClick=${() => void logout()}>
              ${t("Log out")}
            </button>
          </div>
        </div>`
    : html`
      <button type="button" ui-button="tertiary sm" onClick=${openLoginDialog}>
        ${t("Sign in")}
      </button>`;

  const view = html`
    <div data-scope="Store">
      <header class="top" ui-padding="inline-md block-md" ui-column="gap-md">
        <div ui-row="gap-sm y-center x-between">
          <a class="brand" href=${`/${lang}/`} aria-label="Rmix">
            <img src="/static/rmix.svg" alt="Rmix" width="96" height="22" />
          </a>
          <div class="actions" ui-row="gap-sm y-center">
            ${searchOpen.value
              ? html`
                <form onSubmit=${submitSearch} class="search">
                  <label class="sr-only" for="store-search">${t("Search apps")}</label>
                  <input
                    id="store-search"
                    ref=${searchRef}
                    type="search"
                    ui-input="sm"
                    placeholder=${t("Search apps")}
                    value=${draftQ.value}
                    onInput=${(e: Event) => {
                      draftQ.value = (e.target as HTMLInputElement).value;
                    }}
                    onBlur=${onSearchBlur}
                  />
                </form>`
              : html`
                <button
                  type="button"
                  ui-button="tertiary square sm"
                  ui-icon="search"
                  aria-label=${t("Search apps")}
                  onClick=${openSearch}
                ></button>`}
            <a
              href=${appEditUrl(lang)}
              ui-button="primary sm"
              onClick=${(e: Event) => {
                if (requireLogin()) return;
                e.preventDefault();
              }}
            >${t("Create")}</a>
            ${accountMenu}
          </div>
        </div>

        ${visibleCategories.length > 0
          ? html`
            <div class="chips" role="tablist" aria-label=${t("Categories")} ui-row="gap-sm">
              <button
                type="button"
                ui-button=${!category ? "primary sm" : "tertiary sm"}
                onClick=${() => selectCategory(null)}
              >
                ${t("All")}
              </button>
              ${visibleCategories.map(
                (c) => html`
                  <button
                    type="button"
                    ui-button=${category === c ? "primary sm" : "tertiary sm"}
                    onClick=${() => selectCategory(c)}
                  >
                    ${categoryLabel(c)}
                  </button>`,
              )}
            </div>`
          : ""}
      </header>

      <div class="content" ui-column="gap-2xl" ui-padding="inline-md">
        ${loading && apps.length === 0
          ? html`
            <div ui-column="gap-md x-center" ui-padding="xl">
              <i ui-icon="spinner lg"></i>
              <p>${t("Loading…")}</p>
            </div>`
          : galleryError.value
            ? html`<p role="alert">${galleryError.value}</p>`
            : apps.length === 0
              ? html`
                <div ui-column="gap-sm x-center" ui-padding="xl">
                  <p ui-heading="sm">${t("No apps in the Store yet")}</p>
                  <p>${t("Published apps will show up here.")}</p>
                  <a
                    href=${appEditUrl(lang)}
                    ui-button="primary"
                    onClick=${(e: Event) => {
                      if (requireLogin()) return;
                      e.preventDefault();
                    }}
                  >${t("Create an app")}</a>
                </div>`
              : isDefaultBrowse
                ? html`
                  ${featuredApps.length > 0
                    ? html`
                      <section class="today" ui-column="gap-md">
                        ${featuredApps.map(
                          (app) => html`<${TodayCard} app=${app} lang=${lang} />`,
                        )}
                      </section>`
                    : ""}

                  <section class="create-pitch">
                    <div class="create-pitch-bg" aria-hidden="true"></div>
                    <div class="create-pitch-inner" ui-column="gap-md">
                      <header class="create-head" ui-column="gap-sm">
                        <h2>${t("Make your own apps with AI")}</h2>
                        <p class="create-lede">
                          ${t("Describe what you need in plain language. Rmix builds a working app in minutes — then you improve it by chatting. No code needed.")}
                        </p>
                      </header>
                      <div class="create-cta">
                        <a
                          href=${appEditUrl(lang)}
                          ui-button="primary"
                          onClick=${(e: Event) => {
                            if (requireLogin()) return;
                            e.preventDefault();
                          }}
                        >${t("Create an app")}</a>
                      </div>
                    </div>
                  </section>

                  ${history.length > 0
                    ? html`
                      <section ui-column="gap-sm">
                        <h2 ui-heading="sm">${t("Previously installed")}</h2>
                        <div class="rail" ui-row="gap-md">
                          ${history.map(
                            (item) => html`
                              <a
                                class="rail-tile history"
                                href=${appPageUrl(lang, item.slug)}
                                ui-column="gap-xs x-center"
                              >
                                <${AppIcon}
                                  app=${{
                                    slug: item.slug,
                                    title: item.title,
                                    iconId: item.iconId,
                                  }}
                                  size="md"
                                />
                                <strong>${item.title}</strong>
                                <small>${formatInstalledAt(item.installedAt, lang)}</small>
                              </a>`,
                          )}
                        </div>
                      </section>`
                    : ""}

                  ${popular.length > 0
                    ? html`
                      <section ui-column="gap-sm">
                        <h2 ui-heading="sm">${t("Popular apps")}</h2>
                        <div class="rail" ui-row="gap-md">
                          ${popular.map(
                            (app) => html`<${RailTile} app=${app} lang=${lang} />`,
                          )}
                        </div>
                      </section>`
                    : ""}

                  ${categoryGroups.map(
                    (group) => html`
                      <section ui-column="gap-sm">
                        <div ui-row="x-between y-center gap-md">
                          <h2 ui-heading="sm">${categoryLabel(group.category)}</h2>
                          <button
                            type="button"
                            ui-button="inline sm"
                            onClick=${() => selectCategory(group.category)}
                          >
                            ${t("See all")}
                          </button>
                        </div>
                        <div class="rail" ui-row="gap-md">
                          ${group.apps.map(
                            (app) => html`<${RailTile} app=${app} lang=${lang} />`,
                          )}
                        </div>
                      </section>`,
                  )}

                  ${charts.length > 0
                    ? html`
                      <section ui-column="gap-sm">
                        <h2 ui-heading="sm">${t("Top charts")}</h2>
                        <div class="charts" ui-column>
                          ${charts.map(
                            (app, i) =>
                              html`<${ChartRow} app=${app} lang=${lang} rank=${i + 1} />`,
                          )}
                        </div>
                      </section>`
                    : ""}`
                : html`
                  <section ui-column="gap-sm">
                    <h2 ui-heading="sm">
                      ${category
                        ? categoryLabel(category)
                        : galleryQuery.value.trim()
                          ? t("Results")
                          : t("New & Noteworthy")}
                    </h2>
                    <div class="charts" ui-column>
                      ${filteredList.map(
                        (app, i) =>
                          html`<${ChartRow} app=${app} lang=${lang} rank=${i + 1} />`,
                      )}
                    </div>
                  </section>`}
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Store"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
        padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
      }

      .top {
        position: sticky;
        top: 0;
        z-index: 2;
        padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
        border-bottom: 1px solid var(--neutral-200);
        background: color-mix(in oklab, var(--neutral-50) 88%, var(--white));
        backdrop-filter: blur(12px);
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
        flex: 1;
        justify-content: flex-end;
      }

      .search {
        min-width: 0;
        flex: 1;
        max-width: 14rem;
      }

      .chips {
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .chips::-webkit-scrollbar {
        display: none;
      }

      .chips > [ui-button] {
        flex: none;
      }

      .content {
        padding-top: 1.25rem;
        max-width: 48rem;
        margin-inline: auto;
      }

      .create-pitch {
        position: relative;
        overflow: hidden;
        border-radius: 1.25rem;
        border: 1px solid color-mix(in oklab, var(--primary-200) 55%, var(--neutral-200));
        background: var(--white);
        isolation: isolate;
      }

      .create-pitch-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        background:
          radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--primary-200) 55%, transparent), transparent 55%),
          radial-gradient(90% 80% at 100% 10%, color-mix(in oklab, var(--secondary-200) 40%, transparent), transparent 50%),
          linear-gradient(165deg, color-mix(in oklab, var(--primary-50) 70%, var(--white)), var(--white) 58%, var(--neutral-50));
        pointer-events: none;
      }

      .create-pitch-bg::after {
        content: "";
        position: absolute;
        inset: auto -10% -35% 35%;
        height: 70%;
        border-radius: 50%;
        background: color-mix(in oklab, var(--primary-100) 45%, transparent);
        filter: blur(28px);
        opacity: 0.7;
      }

      .create-pitch-inner {
        position: relative;
        z-index: 1;
        padding: 1.5rem 1.25rem 1.4rem;
        max-width: 28rem;
      }

      .create-head h2 {
        margin: 0;
        font-size: 1.55rem;
        font-weight: 700;
        letter-spacing: -0.035em;
        line-height: 1.12;
        color: var(--neutral-950);
      }

      .create-lede {
        margin: 0;
        color: var(--neutral-600);
        font-size: 1rem;
        line-height: 1.45;
      }

      .create-cta {
        display: flex;
      }

      .create-cta [ui-button] {
        min-width: 9.5rem;
      }

      @media (min-width: 640px) {
        .create-pitch-inner {
          padding: 1.75rem 1.5rem 1.55rem;
        }

        .create-head h2 {
          font-size: 1.85rem;
        }

        .create-lede {
          font-size: 1.05rem;
        }
      }

      .today-card {
        display: flex;
        flex-direction: column;
        text-decoration: none;
        color: inherit;
        border-radius: 1.25rem;
        overflow: hidden;
        background: var(--white);
        border: 1px solid var(--neutral-200);
      }

      .today-art {
        display: grid;
        place-items: center;
        min-height: 11rem;
        background: var(--card-gradient);
      }

      .today-body {
        padding: 1rem 1.15rem 0.25rem;
      }

      .today-body small,
      .meta small,
      .rail-tile small,
      .rank {
        color: var(--neutral-500);
      }

      .today-body small {
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-size: 0.6875rem;
      }

      .today-body > strong {
        font-size: 1.45rem;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }

      .today-body p {
        margin: 0;
        color: var(--neutral-500);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .today-footer {
        margin: 0.75rem;
        padding: 0.6rem 0.7rem;
        border-radius: 0.9rem;
        background: var(--neutral-100);
      }

      .meta {
        min-width: 0;
        flex: 1;
      }

      .meta strong,
      .rail-tile strong,
      .today-body > strong {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .meta strong {
        -webkit-line-clamp: 1;
        font-size: 0.875rem;
      }

      .today-footer [ui-button],
      .chart-row [ui-button] {
        pointer-events: none;
      }

      .rail {
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .rail::-webkit-scrollbar {
        display: none;
      }

      .rail-tile {
        flex: none;
        width: 6.75rem;
        text-decoration: none;
        color: inherit;
      }

      .rail-tile.history {
        width: 5.75rem;
        text-align: center;
      }

      .rail-tile small {
        font-size: 0.6875rem;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .charts {
        background: var(--white);
        border: 1px solid var(--neutral-200);
        border-radius: 1rem;
        padding: 0.25rem 0.85rem;
      }

      .chart-row {
        text-decoration: none;
        color: inherit;
        padding: 0.7rem 0;
        border-bottom: 1px solid var(--neutral-200);
      }

      .chart-row:last-child {
        border-bottom: none;
      }

      .rank {
        flex: none;
        width: 1.25rem;
        text-align: center;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .app-icon {
        flex: none;
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 0.9rem;
        overflow: hidden;
        display: grid;
        place-items: center;
        color: var(--white);
        font-weight: 700;
        font-size: 1.25rem;
      }

      .app-icon.sm {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.65rem;
        font-size: 0.9rem;
      }

      .app-icon.md {
        width: 5.5rem;
        height: 5.5rem;
        border-radius: 1.15rem;
        font-size: 1.75rem;
      }

      .app-icon.lg {
        width: 6.5rem;
        height: 6.5rem;
        border-radius: 1.4rem;
        font-size: 2.25rem;
      }

      .app-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media (max-width: 719px) {
        /* One featured card on small screens — two stacked cards overlap the fold. */
        .today .today-card:nth-child(n + 2) {
          display: none;
        }
      }

      @media (min-width: 720px) {
        .top {
          max-width: 48rem;
          margin-inline: auto;
          width: 100%;
          box-sizing: border-box;
        }

        .today {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
      }
    }
  `;

  return [view, style];
}
