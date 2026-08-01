import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { type AppCategory, isAppCategory } from "/utils/app-categories";
import { appsAppUrl, createUrl } from "/utils/app-url";
import type { StoreAppCard } from "/types/app-types";
import {
  storeApps,
  storeCategory,
  storeError,
  storeLoading,
  storeQuery,
  openHistory,
  loadStore,
  loadOpenHistory,
} from "/app/stores/storeListingStore";
import AppSlider from "/app/components/AppSlider";
import AppList from "/app/components/AppList";
import AppCard from "/app/components/AppCard";

export const AppsPath = "/:lang/apps" as const;

function categoryLabel(category: AppCategory): string {
  return t(category);
}

function toListItems(list: StoreAppCard[], lang: string) {
  return list.map((app) => ({
    slug: app.slug,
    title: app.title,
    iconId: app.iconId,
    href: appsAppUrl(lang, app.slug),
    subtitle: app.tagline || app.description || app.category || t("App"),
  }));
}

function toSliderItems(list: StoreAppCard[], lang: string) {
  return list.map((app) => ({
    slug: app.slug,
    title: app.title,
    iconId: app.iconId,
    href: appsAppUrl(lang, app.slug),
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

function groupByCategory(apps: StoreAppCard[]): { category: AppCategory; apps: StoreAppCard[] }[] {
  const map = new Map<AppCategory, StoreAppCard[]>();
  for (const app of apps) {
    const cat = isAppCategory(app.category) ? app.category : "Utilities";
    const list = map.get(cat) ?? [];
    list.push(app);
    map.set(cat, list);
  }
  return [...map.entries()]
    .map(([category, list]) => ({
      category,
      apps: [...list].sort(byPopularity),
    }))
    .filter((g) => g.apps.length >= 2)
    .sort((a, b) => b.apps.length - a.apps.length);
}

/**
 * Browse hierarchy (default):
 * 1. AppCard — one featured highlight
 * 2. AppSlider — recently used (personal, if any)
 * 3. AppList — popular charts (ranked)
 * 4. AppSlider — new apps
 * 5. AppSlider × categories — browse by topic
 *
 * Filtered / search: single AppList.
 */
export default function Apps(_props: RoutePropsForPath<typeof AppsPath>) {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const apps = storeApps.value;
  const loading = storeLoading.value;
  const category = storeCategory.value;
  const history = openHistory.value;
  const isDefaultBrowse = !storeQuery.value.trim() && !category;

  const ranked = [...apps].sort(byPopularity);
  const featured = isDefaultBrowse ? (ranked[0] ?? null) : null;
  const featuredSlug = featured?.slug ?? null;
  const withoutFeatured = featuredSlug
    ? apps.filter((a) => a.slug !== featuredSlug)
    : apps;

  const popular = [...withoutFeatured].sort(byPopularity).slice(0, 10);
  const newest = [...withoutFeatured].sort(byNewest).slice(0, 12);
  const categoryGroups = isDefaultBrowse
    ? groupByCategory(withoutFeatured.filter((a) => a.category !== "Games")).slice(0, 4)
    : [];
  const filteredList = !isDefaultBrowse ? [...apps].sort(byPopularity) : [];

  useEffect(() => {
    void loadStore({ category: null, excludeCategory: "Games" });
    void loadOpenHistory({ excludeCategory: "Games" });
  }, []);

  function selectCategory(next: AppCategory | null) {
    void loadStore({ category: next, excludeCategory: next ? null : "Games" });
  }

  const view = html`
    <div data-scope="Apps">
      <div class="content" ui-column="gap-2xl" ui-padding="inline-md">
        <header class="page-head" ui-column="gap-sm">
          <h1 class="page-title">${t("Apps")}</h1>
          <p class="page-lede">${t("Discover apps made by others")}</p>
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
                <div ui-column="gap-sm x-center" ui-padding="xl">
                  <p ui-heading="sm">${t("No apps in the Store yet")}</p>
                  <p>${t("Published apps will show up here.")}</p>
                  <a
                    href=${createUrl(lang)}
                    ui-button="primary"
                  >${t("Create an app")}</a>
                </div>`
              : isDefaultBrowse
                ? html`
                  ${featured
                    ? html`
                      <section>
                        <${AppCard}
                          app=${featured}
                          href=${appsAppUrl(lang, featured.slug)}
                          eyebrow=${t("Featured")}
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
                            href: appsAppUrl(lang, item.slug),
                          }))}
                        />
                      </section>`
                    : ""}

                  ${popular.length > 0
                    ? html`
                      <section ui-column="gap-sm">
                        <h2 ui-heading="sm">${t("Popular apps")}</h2>
                        <${AppList}
                          ranked
                          label=${t("Popular apps")}
                          items=${toListItems(popular, lang)}
                        />
                      </section>`
                    : ""}

                  ${newest.length > 0
                    ? html`
                      <section ui-column="gap-sm">
                        <h2 ui-heading="sm">${t("New & Noteworthy")}</h2>
                        <${AppSlider}
                          label=${t("New & Noteworthy")}
                          items=${toSliderItems(newest, lang)}
                        />
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
                        <${AppSlider}
                          label=${categoryLabel(group.category)}
                          items=${toSliderItems(group.apps, lang)}
                        />
                      </section>`,
                  )}`
                : html`
                  <section ui-column="gap-sm">
                    <h2 ui-heading="sm">
                      ${category
                        ? categoryLabel(category)
                        : storeQuery.value.trim()
                          ? t("Results")
                          : t("New & Noteworthy")}
                    </h2>
                    <${AppList}
                      ranked
                      label=${category
                        ? categoryLabel(category)
                        : storeQuery.value.trim()
                          ? t("Results")
                          : t("New & Noteworthy")}
                      items=${toListItems(filteredList, lang)}
                    />
                  </section>`}
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Apps"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
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
    }
  `;

  return [view, style];
}
