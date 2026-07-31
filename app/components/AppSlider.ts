import { html, css } from "/utils/markup";
import type { AppCatalogItem } from "/app/components/app-catalog-item";
import IconName from "/app/components/IconName";

export type { AppCatalogItem };
/** @deprecated Use AppCatalogItem */
export type AppSliderItem = AppCatalogItem;

export default function AppSlider({
  items,
  label,
}: {
  items: AppCatalogItem[];
  label?: string;
}) {
  if (items.length === 0) return null;

  const view = html`
    <div data-scope="AppSlider" class="app-slider-root">
      <div class="app-slider" role="list" aria-label=${label}>
        ${items.map(
          (item) => html`
            <a
              class="tile"
              role="listitem"
              href=${item.href}
              title=${item.title}
            >
              <${IconName}
                slug=${item.slug}
                title=${item.title}
                iconId=${item.iconId}
                size="md"
              />
            </a>
          `,
        )}
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="AppSlider"]) to ([data-scope]) {
      /*
       * Full-bleed to the screen (or content column) edges.
       * Matches ui-padding="inline-md" (1rem) on parent .content.
       */
      & {
        --page-inline: 1rem;
        --gap: 0.85rem;
        --tile-max: 5.75rem;
        --peek: 0.55;
        container-type: inline-size;
        container-name: app-slider;
        width: calc(100% + 2 * var(--page-inline));
        max-width: 100vw;
        margin-inline: calc(-1 * var(--page-inline));
      }

      .app-slider {
        display: flex;
        flex-wrap: nowrap;
        gap: var(--gap);
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
        padding-block: 0 0.25rem;
        padding-inline: var(--page-inline);
      }

      .app-slider::-webkit-scrollbar {
        display: none;
      }

      .tile {
        flex: none;
        width: min(
          var(--tile-max),
          calc((100cqw - var(--page-inline) * 2 - var(--gap) * 2) / (2 + var(--peek)))
        );
        text-decoration: none;
        color: inherit;
      }

      @container app-slider (min-width: 36rem) {
        .tile {
          width: min(
            var(--tile-max),
            calc((100cqw - var(--page-inline) * 2 - var(--gap) * 3) / (3 + var(--peek)))
          );
        }
      }

      @container app-slider (min-width: 52rem) {
        .tile {
          width: min(
            var(--tile-max),
            calc((100cqw - var(--page-inline) * 2 - var(--gap) * 4) / (4 + var(--peek)))
          );
        }
      }
    }
  `;

  return [view, style];
}
