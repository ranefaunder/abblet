import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { type AppCategory, isAppCategory } from "/utils/app-categories";
import { appsAppUrl, createUrl } from "/utils/app-url";
import type { AppSummary, StoreAppCard } from "/types/app-types";
import {
  storeApps,
  storeCategory,
  storeError,
  storeLoading,
  storeQuery,
  loadStore,
  ensureStoreBrowseScope,
} from "/app/stores/storeListingStore";
import AppSlider from "/app/components/AppSlider";
import AppList from "/app/components/AppList";
import AppCard from "/app/components/AppCard";
import { apps as libraryApps, loadApps } from "/app/stores/appStore";
import { isLoggedIn } from "/app/stores/userStore";

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

/** Store detail: published → slug URL; unpublished → UUID capability URL. */
function ownedAppHref(app: AppSummary, lang: string): string {
  if (app.visibility === "public") return appsAppUrl(lang, app.slug);
  return appsAppUrl(lang, app.id);
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
 * 2. AppSlider — My Apps (owned, if any)
 * 3. AppSlider — recently used (personal, if any)
 * 4. AppList — popular charts (ranked)
 * 5. AppSlider — new apps
 * 6. AppSlider × categories — browse by topic
 *
 * Filtered / search: single AppList.
 */
export default function Apps(_props: RoutePropsForPath<typeof AppsPath>) {
  ensureStoreBrowseScope("apps");
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const apps = storeApps.value;
  const loading = storeLoading.value;
  const category = storeCategory.value;
  const isDefaultBrowse = !storeQuery.value.trim() && !category;
  const myApps = libraryApps.value.filter(
    (app) => app.owned && app.category !== "Games",
  );

  const ranked = [...apps].sort(byPopularity);
  const featured = isDefaultBrowse ? (ranked[0] ?? null) : null;

  const popular = [...apps].sort(byPopularity).slice(0, 10);
  const newest = [...apps].sort(byNewest).slice(0, 12);
  const categoryGroups = isDefaultBrowse
    ? groupByCategory(apps.filter((a) => a.category !== "Games")).slice(0, 4)
    : [];
  const filteredList = !isDefaultBrowse ? [...apps].sort(byPopularity) : [];

  useEffect(() => {
    void loadStore({ category: null, excludeCategory: "Games" });
    if (isLoggedIn()) void loadApps();
  }, []);

  const view = html`
    <div data-scope="Apps">
      <div class="content" ui-column="gap-xl" ui-padding="inline-md">
        <header class="page-head" ui-column="gap-xs">
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

                  ${myApps.length > 0
                    ? html`
                      <section ui-column="gap-xs">
                        <h2 ui-heading="sm">${t("My Apps")}</h2>
                        <${AppSlider}
                          label=${t("My Apps")}
                          items=${myApps.map((app) => ({
                            slug: app.slug,
                            title: app.title,
                            iconId: app.iconId,
                            href: ownedAppHref(app, lang),
                          }))}
                        />
                      </section>`
                    : ""}

                  ${popular.length > 0
                    ? html`
                      <section ui-column="gap-xs">
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
                      <section ui-column="gap-xs">
                        <h2 ui-heading="sm">${t("New & Noteworthy")}</h2>
                        <${AppSlider}
                          label=${t("New & Noteworthy")}
                          items=${toSliderItems(newest, lang)}
                        />
                      </section>`
                    : ""}

                  ${categoryGroups.map(
                    (group) => html`
                      <section ui-column="gap-xs">
                        <h2 ui-heading="sm">${categoryLabel(group.category)}</h2>
                        <${AppSlider}
                          label=${categoryLabel(group.category)}
                          items=${toSliderItems(group.apps, lang)}
                        />
                      </section>`,
                  )}`
                : html`
                  <section ui-column="gap-xs">
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
        padding-top: 1rem;
        padding-bottom: 0.5rem;
        max-width: 48rem;
        margin-inline: auto;
        width: 100%;
        box-sizing: border-box;
      }

      .page-title {
        margin: 0;
        font-size: clamp(1.85rem, 5.5vw, 2.4rem);
        font-weight: 800;
        letter-spacing: -0.05em;
        line-height: 1;
        color: var(--neutral-950);
      }

      .page-lede {
        margin: 0;
        font-size: 0.975rem;
        line-height: 1.35;
        color: var(--neutral-600);
      }
    }
  `;

  return [view, style];
}
