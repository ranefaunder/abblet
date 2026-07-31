import { html, css } from "/utils/markup";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";
import type { AppCatalogItem } from "/app/components/app-catalog-item";

export type { AppCatalogItem };

export default function AppList({
  items,
  label,
  ranked = false,
}: {
  items: AppCatalogItem[];
  label?: string;
  /** Show 1-based rank numbers (charts / popular). */
  ranked?: boolean;
}) {
  if (items.length === 0) return null;

  const view = html`
    <div
      data-scope="AppList"
      class="app-list"
      role="list"
      aria-label=${label}
    >
      ${items.map((item, i) => {
        const iconSrc = appIconSrc(item.iconId);
        return html`
          <a
            class="row"
            role="listitem"
            href=${item.href}
            ui-row="y-center gap-md"
          >
            ${ranked
              ? html`<span class="rank" aria-hidden="true">${i + 1}</span>`
              : ""}
            <span
              class="icon"
              style=${`background: ${previewGradient(item.slug)}`}
              aria-hidden="true"
            >
              ${iconSrc
                ? html`<img src=${iconSrc} alt="" width="56" height="56" decoding="async" />`
                : html`<span>${draftLetter(item.title)}</span>`}
            </span>
            <span class="meta" ui-column="gap-xs">
              <strong>${item.title}</strong>
              ${item.subtitle ? html`<small>${item.subtitle}</small>` : ""}
            </span>
          </a>
        `;
      })}
    </div>
  `;

  const style = css`
    @scope ([data-scope="AppList"]) to ([data-scope]) {
      & {
        background: var(--white);
        border: 1px solid var(--neutral-200);
        border-radius: 1rem;
        padding: 0.25rem 0.85rem;
      }

      .row {
        text-decoration: none;
        color: inherit;
        padding: 0.7rem 0;
        border-bottom: 1px solid var(--neutral-200);
      }

      .row:last-child {
        border-bottom: none;
      }

      .rank {
        flex: none;
        width: 1.25rem;
        text-align: center;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .icon {
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

      .icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .meta {
        flex: 1;
        min-width: 0;
      }

      .meta strong {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: 0.875rem;
      }

      .meta small {
        color: var(--neutral-500);
        font-size: 0.75rem;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    }
  `;

  return [view, style];
}
