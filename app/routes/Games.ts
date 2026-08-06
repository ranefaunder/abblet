import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { gamesAppUrl, createUrl } from "/utils/app-url";
import type { AppSummary, StoreAppCard } from "/types/app-types";
import {
  storeApps,
  storeError,
  storeLoading,
  loadStore,
  ensureStoreBrowseScope,
} from "/app/stores/storeListingStore";
import AppSlider from "/app/components/AppSlider";
import AppList from "/app/components/AppList";
import AppCard from "/app/components/AppCard";
import { apps as libraryApps, loadApps } from "/app/stores/appStore";
import { isLoggedIn } from "/app/stores/userStore";

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

/** Store detail: published → slug URL; unpublished → UUID capability URL. */
function ownedGameHref(app: AppSummary, lang: string): string {
  if (app.visibility === "public") return gamesAppUrl(lang, app.slug);
  return gamesAppUrl(lang, app.id);
}

/**
 * Same browse hierarchy as Apps (no category chips — all items are Games):
 * 1. AppCard — featured
 * 2. AppSlider — My Games (owned, if any)
 * 3. AppList — popular (ranked)
 * 4. AppSlider — new drops
 */
export default function Games(_props: RoutePropsForPath<typeof GamesPath>) {
  ensureStoreBrowseScope("games");
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const apps = storeApps.value;
  const loading = storeLoading.value;
  const myGames = libraryApps.value.filter(
    (app) => app.owned && app.category === "Games",
  );

  const ranked = [...apps].sort(byPopularity);
  const featured = ranked[0] ?? null;

  const popular = [...apps].sort(byPopularity).slice(0, 10);
  const newest = [...apps].sort(byNewest).slice(0, 12);

  useEffect(() => {
    void loadStore({ category: "Games", excludeCategory: null });
    if (isLoggedIn()) void loadApps();
  }, []);

  const view = html`
    <div data-scope="Games">
      <div class="content" ui-column="gap-xl" ui-padding="inline-md">
        <header class="page-head" ui-column="gap-xs">
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

                ${myGames.length > 0
                  ? html`
                    <section ui-column="gap-xs">
                      <h2 ui-heading="sm">${t("My Games")}</h2>
                      <${AppSlider}
                        label=${t("My Games")}
                        items=${myGames.map((app) => ({
                          slug: app.slug,
                          title: app.title,
                          iconId: app.iconId,
                          href: ownedGameHref(app, lang),
                        }))}
                      />
                    </section>`
                  : ""}

                ${popular.length > 0
                  ? html`
                    <section ui-column="gap-xs">
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
                    <section ui-column="gap-xs">
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

      .empty {
        border-radius: 1.5rem;
        background: color-mix(in oklab, var(--white) 80%, transparent);
        border: 1px dashed var(--neutral-300);
      }
    }
  `;

  return [view, style];
}
