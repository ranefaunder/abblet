import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { type AppCategory, isAppCategory } from "/utils/app-categories";
import { aboutUrl, appEditUrl, galleryAppUrl } from "/utils/app-url";
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
import { requireLogin } from "/app/stores/userStore";

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
  const apps = galleryApps.value;
  const loading = galleryLoading.value;
  const category = galleryCategory.value;
  const categories = galleryCategories.value;
  const history = installHistory.value;
  const visibleCategories =
    category && !categories.includes(category) ? [...categories, category] : categories;
  const isDefaultBrowse = !galleryQuery.value.trim() && !category;

  const featuredApps = isDefaultBrowse ? apps.slice(0, Math.min(2, apps.length)) : [];
  const popular = [...apps]
    .sort((a, b) => b.installCount - a.installCount || b.remixCount - a.remixCount)
    .slice(0, 12);
  const charts = [...apps]
    .sort((a, b) => b.installCount - a.installCount || b.remixCount - a.remixCount)
    .slice(0, 8);
  const categoryGroups = isDefaultBrowse ? groupByCategory(apps).slice(0, 4) : [];
  const filteredList = !isDefaultBrowse ? apps : [];
  const aboutPitchApps =
    apps.length === 0
      ? []
      : Array.from({ length: 7 }, (_, i) => apps[(i * 2) % apps.length]!);

  useEffect(() => {
    void loadGallery();
    void loadInstallHistory();
  }, []);

  function selectCategory(next: AppCategory | null) {
    void loadGallery({ category: next });
  }

  const view = html`
    <div data-scope="Store">
      ${visibleCategories.length > 0
        ? html`
          <div class="chips-bar" ui-padding="inline-md block-sm">
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
            </div>
          </div>`
        : ""}

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
                    <div class="create-pitch-copy" ui-column="gap-md">
                      <p class="create-eyebrow">${t("Make your own")}</p>
                      <h2 class="create-title">${t("Make your own apps with AI")}</h2>
                      <p class="create-lede">
                        ${t("Describe what you need in plain language. Rmix builds a working app in minutes — then you improve it by chatting. No code needed.")}
                      </p>
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
                    <div class="create-demo" aria-hidden="true">
                      <div class="create-demo-stage">
                        <div class="create-demo-msg user" style="--d: 0.05s">
                          <p>${t("A habit tracker for my morning routine")}</p>
                        </div>
                        <div class="create-demo-msg build" style="--d: 0.35s">
                          <div class="create-demo-build">
                            <span class="create-demo-dots" aria-hidden="true">
                              <i></i><i></i><i></i>
                            </span>
                            <span>${t("Building your app…")}</span>
                          </div>
                          <div class="create-demo-bars">
                            <span style="--w: 88%"></span>
                            <span style="--w: 64%"></span>
                            <span style="--w: 76%"></span>
                          </div>
                        </div>
                        <div class="create-demo-msg result" style="--d: 0.7s">
                          <div class="create-demo-app">
                            <span class="create-demo-app-icon" aria-hidden="true">H</span>
                            <div ui-column="gap-xs">
                              <strong>${t("Morning Habits")}</strong>
                              <small>${t("Ready to open")}</small>
                            </div>
                          </div>
                          <p class="create-demo-reply">
                            ${t("Done — open it, then ask for changes anytime.")}
                          </p>
                        </div>
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
                                href=${galleryAppUrl(lang, item.slug)}
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

        <section class="about-pitch">
          ${aboutPitchApps.length > 0
            ? html`
              <div class="about-pitch-icons" ui-row="gap-md y-center x-center wrap">
                ${aboutPitchApps.map(
                  (app, i) => html`
                    <a
                      class="about-pitch-icon"
                      href=${galleryAppUrl(lang, app.slug)}
                      aria-label=${app.title}
                      title=${app.title}
                      style=${`--icon-size: ${2.35 + (i % 3) * 0.22}rem`}
                    >
                      <${AppIcon} app=${app} />
                    </a>`,
                )}
              </div>`
            : ""}
          <div class="about-pitch-inner" ui-column="gap-md x-center">
            <h2 class="about-pitch-title">
              ${t("Instead of settling for software that almost fits, make software that does.")}
            </h2>
            <p class="about-pitch-lede">
              ${t("An app store where every app is remixable to fit you.")}
            </p>
            <a href=${aboutUrl(lang)} ui-button="primary">${t("About Rmix")}</a>
          </div>
        </section>
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Store"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
        padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
      }

      .chips-bar {
        border-bottom: 1px solid var(--neutral-200);
        background: color-mix(in oklab, var(--neutral-50) 88%, var(--white));
      }

      .chips {
        max-width: 48rem;
        margin-inline: auto;
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
        display: grid;
        gap: 1.75rem;
        align-items: center;
        border-radius: 1.35rem;
        border: 1px solid var(--neutral-200);
        background:
          radial-gradient(ellipse 80% 70% at 100% 0%, var(--neutral-100), transparent 55%),
          radial-gradient(ellipse 60% 50% at 0% 100%, color-mix(in oklab, var(--primary-100) 55%, transparent), transparent 50%),
          var(--white);
        padding: 2rem 1.25rem 1.9rem;
      }

      .create-pitch-copy {
        position: relative;
        z-index: 1;
        max-width: 24rem;
      }

      .create-eyebrow {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .create-title {
        margin: 0;
        max-width: 12ch;
        font-size: clamp(1.85rem, 5.5vw, 2.55rem);
        font-weight: 700;
        letter-spacing: -0.045em;
        line-height: 1.02;
        color: var(--neutral-950);
        text-wrap: balance;
      }

      .create-lede {
        margin: 0;
        color: var(--neutral-600);
        font-size: 1.05rem;
        line-height: 1.45;
        text-wrap: pretty;
      }

      .create-cta {
        display: flex;
      }

      .create-cta [ui-button] {
        min-width: 9.5rem;
      }

      .create-demo {
        position: relative;
        z-index: 1;
        justify-self: stretch;
        min-width: 0;
      }

      .create-demo-stage {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        padding: 1rem;
        border-radius: 1.15rem;
        background:
          linear-gradient(160deg, var(--neutral-100), var(--white) 45%, var(--neutral-50));
        border: 1px solid var(--neutral-200);
        box-shadow:
          0 18px 40px rgba(15, 20, 25, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.8);
        transform: rotate(1.25deg);
      }

      .create-demo-msg {
        animation: create-demo-in 0.55s ease-out both;
        animation-delay: var(--d, 0s);
      }

      .create-demo-msg.user {
        align-self: flex-end;
        max-width: 92%;
      }

      .create-demo-msg.user p {
        margin: 0;
        padding: 0.7rem 0.9rem;
        border-radius: 1.05rem 1.05rem 0.3rem 1.05rem;
        background: var(--neutral-950);
        color: var(--white);
        font-size: 0.8125rem;
        font-weight: 550;
        line-height: 1.35;
        box-shadow: 0 8px 18px rgba(15, 20, 25, 0.18);
      }

      .create-demo-msg.build,
      .create-demo-msg.result {
        align-self: stretch;
        max-width: 100%;
      }

      .create-demo-build {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        margin-bottom: 0.55rem;
        font-size: 0.75rem;
        font-weight: 650;
        letter-spacing: 0.02em;
        color: var(--neutral-600);
      }

      .create-demo-dots {
        display: inline-flex;
        gap: 0.22rem;
      }

      .create-demo-dots i {
        width: 0.35rem;
        height: 0.35rem;
        border-radius: 999px;
        background: var(--primary-500);
        animation: create-demo-dot 1.1s ease-in-out infinite;
      }

      .create-demo-dots i:nth-child(2) {
        animation-delay: 0.15s;
      }

      .create-demo-dots i:nth-child(3) {
        animation-delay: 0.3s;
      }

      .create-demo-bars {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.75rem;
        border-radius: 0.95rem;
        background: color-mix(in oklab, var(--white) 70%, var(--neutral-50));
        border: 1px solid var(--neutral-200);
      }

      .create-demo-bars span {
        display: block;
        height: 0.4rem;
        width: var(--w, 70%);
        border-radius: 999px;
        background: linear-gradient(
          90deg,
          var(--neutral-200),
          var(--primary-200),
          var(--neutral-200)
        );
        background-size: 200% 100%;
        animation: create-demo-shimmer 1.6s linear infinite;
      }

      .create-demo-msg.result {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }

      .create-demo-app {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.7rem 0.8rem;
        border-radius: 1rem;
        background: var(--white);
        border: 1px solid var(--neutral-200);
        box-shadow: 0 10px 24px rgba(15, 20, 25, 0.08);
      }

      .create-demo-app-icon {
        flex: none;
        width: 2.6rem;
        height: 2.6rem;
        border-radius: 0.7rem;
        display: grid;
        place-items: center;
        font-weight: 700;
        font-size: 1.05rem;
        color: var(--white);
        background: linear-gradient(145deg, var(--primary-500), var(--primary-700));
        box-shadow: 0 6px 14px color-mix(in oklab, var(--primary-600) 35%, transparent);
      }

      .create-demo-app strong {
        font-size: 0.875rem;
        letter-spacing: -0.02em;
        color: var(--neutral-950);
      }

      .create-demo-app small {
        font-size: 0.75rem;
        color: var(--success-700, var(--primary-700));
        font-weight: 600;
      }

      .create-demo-reply {
        margin: 0;
        padding: 0.65rem 0.85rem;
        border-radius: 0.3rem 1.05rem 1.05rem 1.05rem;
        background: var(--white);
        border: 1px solid var(--neutral-200);
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--neutral-700);
      }

      @keyframes create-demo-in {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes create-demo-dot {
        0%,
        80%,
        100% {
          opacity: 0.35;
          transform: translateY(0);
        }
        40% {
          opacity: 1;
          transform: translateY(-2px);
        }
      }

      @keyframes create-demo-shimmer {
        from {
          background-position: 100% 0;
        }
        to {
          background-position: -100% 0;
        }
      }

      .about-pitch {
        margin-top: 0.5rem;
        padding: 2rem 1.25rem 1.85rem;
        border-radius: 1.25rem;
        background: var(--neutral-950);
        color: var(--white);
        text-align: center;
      }

      .about-pitch-icons {
        margin-bottom: 1.5rem;
      }

      .about-pitch-icon {
        display: block;
        width: var(--icon-size, 2.5rem);
        height: var(--icon-size, 2.5rem);
        border-radius: calc(var(--icon-size, 2.5rem) * 0.24);
        overflow: hidden;
        flex: none;
        text-decoration: none;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        transition: transform 0.15s ease;
      }

      .about-pitch-icon:hover {
        transform: scale(1.08) translateY(-2px);
      }

      .about-pitch-icon .app-icon {
        width: 100%;
        height: 100%;
        border-radius: inherit;
        font-size: calc(var(--icon-size, 2.5rem) * 0.38);
      }

      .about-pitch-inner {
        max-width: 26rem;
        margin-inline: auto;
      }

      .about-pitch-title {
        margin: 0;
        max-width: 18ch;
        font-size: clamp(1.45rem, 4.2vw, 2rem);
        font-weight: 700;
        letter-spacing: -0.035em;
        line-height: 1.12;
        text-wrap: balance;
      }

      .about-pitch-lede {
        margin: 0;
        font-size: 1rem;
        line-height: 1.45;
        color: rgba(255, 255, 255, 0.62);
        text-wrap: balance;
      }

      .about-pitch a[ui-button="primary"] {
        --_btn-bg: var(--white);
        --_btn-fg: var(--neutral-950);
      }

      @media (min-width: 640px) {
        .create-pitch {
          grid-template-columns: minmax(0, 1.15fr) minmax(11rem, 0.85fr);
          gap: 2rem;
          padding: 2.5rem 1.75rem 2.35rem;
        }

        .create-title {
          font-size: 2.55rem;
        }

        .create-lede {
          font-size: 1.1rem;
        }

        .create-demo-stage {
          transform: rotate(2deg);
        }

        .about-pitch {
          padding: 2.35rem 1.5rem 2.1rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .create-demo-msg,
        .create-demo-dots i,
        .create-demo-bars span {
          animation: none;
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

      @media (max-width: 719px) {
        /* One featured card on small screens — two stacked cards overlap the fold. */
        .today .today-card:nth-child(n + 2) {
          display: none;
        }
      }

      @media (min-width: 720px) {
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
