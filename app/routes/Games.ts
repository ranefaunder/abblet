import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { gamesAppUrl, createUrl } from "/utils/app-url";
import type { StoreAppCard } from "/types/app-types";
import {
  storeApps,
  storeError,
  storeLoading,
  openHistory,
  loadStore,
  loadOpenHistory,
} from "/app/stores/storeListingStore";
import AppSlider from "/app/components/AppSlider";
import AppList from "/app/components/AppList";
import AppCard from "/app/components/AppCard";

export const GamesPath = "/:lang/games" as const;

function toListItems(list: StoreAppCard[], lang: string) {
  return list.map((app) => ({
    slug: app.slug,
    title: app.title,
    iconId: app.iconId,
    href: gamesAppUrl(lang, app.slug),
    subtitle: app.tagline || app.description || t("Games"),
  }));
}

function toSliderItems(list: StoreAppCard[], lang: string) {
  return list.map((app) => ({
    slug: app.slug,
    title: app.title,
    iconId: app.iconId,
    href: gamesAppUrl(lang, app.slug),
  }));
}

function byPopularity(a: StoreAppCard, b: StoreAppCard): number {
  return b.openCount - a.openCount || b.remixCount - a.remixCount;
}

function byNewest(a: StoreAppCard, b: StoreAppCard): number {
  const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
  const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
  return tb - ta || byPopularity(a, b);
}

/**
 * Same browse hierarchy as Apps (no category chips — all items are Games):
 * 1. AppCard — featured
 * 2. AppSlider — recently used
 * 3. AppList — popular (ranked)
 * 4. AppSlider — new drops
 */
export default function Games(_props: RoutePropsForPath<typeof GamesPath>) {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const apps = storeApps.value;
  const loading = storeLoading.value;
  const history = openHistory.value;

  const ranked = [...apps].sort(byPopularity);
  const featured = ranked[0] ?? null;
  const featuredSlug = featured?.slug ?? null;
  const withoutFeatured = featuredSlug
    ? apps.filter((a) => a.slug !== featuredSlug)
    : apps;

  const popular = [...withoutFeatured].sort(byPopularity).slice(0, 10);
  const newest = [...withoutFeatured].sort(byNewest).slice(0, 12);

  useEffect(() => {
    void loadStore({ category: "Games", excludeCategory: null });
    void loadOpenHistory({ category: "Games" });
  }, []);

  const view = html`
    <div data-scope="Games">
      <div class="content" ui-column="gap-2xl" ui-padding="inline-md">
        <header class="page-head" ui-column="gap-sm">
          <h1 class="page-title">${t("Games")}</h1>
          <p class="page-lede">${t("Discover games made by others")}</p>
        </header>

        ${loading && apps.length === 0
          ? html`
            <div ui-column="gap-md x-center" ui-padding="xl">
              <i ui-icon="spinner lg"></i>
              <p>${t("Loading…")}</p>
            </div>`
          : storeError.value
            ? html`<p role="alert">${storeError.value}</p>`
            : apps.length === 0
              ? html`
                <div class="empty" ui-column="gap-sm x-center" ui-padding="xl">
                  <p ui-heading="sm">${t("No games yet")}</p>
                  <p>${t("Published games will show up here.")}</p>
                  <a
                    href=${createUrl(lang)}
                    ui-button="primary"
                  >${t("Create")}</a>
                </div>`
              : html`
                ${featured
                  ? html`
                    <section>
                      <${AppCard}
                        app=${featured}
                        href=${gamesAppUrl(lang, featured.slug)}
                        eyebrow=${t("Play now")}
                      />
                    </section>`
                  : ""}

                ${history.length > 0
                  ? html`
                    <section ui-column="gap-sm">
                      <h2 ui-heading="sm">${t("Recently used")}</h2>
                      <${AppSlider}
                        label=${t("Recently used")}
                        items=${history.map((item) => ({
                          slug: item.slug,
                          title: item.title,
                          iconId: item.iconId,
                          href: gamesAppUrl(lang, item.slug),
                        }))}
                      />
                    </section>`
                  : ""}

                ${popular.length > 0
                  ? html`
                    <section ui-column="gap-sm">
                      <h2 ui-heading="sm">${t("Popular")}</h2>
                      <${AppList}
                        ranked
                        label=${t("Popular")}
                        items=${toListItems(popular, lang)}
                      />
                    </section>`
                  : ""}

                ${newest.length > 0
                  ? html`
                    <section ui-column="gap-sm">
                      <h2 ui-heading="sm">${t("New drops")}</h2>
                      <${AppSlider}
                        label=${t("New drops")}
                        items=${toSliderItems(newest, lang)}
                      />
                    </section>`
                  : ""}`}
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Games"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
        min-height: 100%;
      }

      .content {
        padding-top: 1.35rem;
        max-width: 48rem;
        margin-inline: auto;
        width: 100%;
        box-sizing: border-box;
      }

      .page-title {
        margin: 0;
        font-size: clamp(2.1rem, 6vw, 2.75rem);
        font-weight: 800;
        letter-spacing: -0.05em;
        line-height: 1;
        color: var(--neutral-950);
      }

      .page-lede {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.4;
        color: var(--neutral-600);
      }

      .empty {
        border-radius: 1.5rem;
        background: color-mix(in oklab, var(--white) 80%, transparent);
        border: 1px dashed var(--neutral-300);
      }
    }
  `;

  return [view, style];
}
