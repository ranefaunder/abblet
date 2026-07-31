import { html, css } from "/utils/markup";
import type { AppCatalogItem } from "/app/components/app-catalog-item";
import IconName from "/app/components/IconName";

export type { AppCatalogItem };

export default function AppGrid({
  items,
  label,
}: {
  items: AppCatalogItem[];
  label?: string;
}) {
  if (items.length === 0) return null;

  const view = html`
    <div
      data-scope="AppGrid"
      class="app-grid"
      role="list"
      aria-label=${label}
    >
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
              size="sm"
            />
          </a>
        `,
      )}
    </div>
  `;

  const style = css`
    @scope ([data-scope="AppGrid"]) to ([data-scope]) {
      & {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(4.25rem, 1fr));
        gap: 0.75rem 0.55rem;
      }

      .tile {
        min-width: 0;
        text-decoration: none;
        color: inherit;
      }
    }
  `;

  return [view, style];
}
