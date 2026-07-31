import { html, css } from "/utils/markup";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter } from "/utils/app-preview";

export default function IconName({
  slug,
  title,
  iconId,
  size = "md",
}: {
  slug: string;
  title: string;
  iconId: string | null;
  /** `sm` = AppGrid, `md` = AppSlider */
  size?: "sm" | "md";
}) {
  const iconSrc = appIconSrc(iconId);

  const view = html`
    <span data-scope="IconName" class=${`icon-name ${size}`}>
      <span
        class="icon"
        style=${`background: ${previewGradient(slug)}`}
        aria-hidden="true"
      >
        ${iconSrc
          ? html`<img src=${iconSrc} alt="" width="64" height="64" decoding="async" />`
          : html`<span class="letter">${draftLetter(title)}</span>`}
      </span>
      <strong class="label">${title}</strong>
    </span>
  `;

  const style = css`
    @scope ([data-scope="IconName"]) to ([data-scope]) {
      & {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        min-width: 0;
        text-align: center;
        color: inherit;
      }

      .icon {
        display: grid;
        place-items: center;
        width: 100%;
        aspect-ratio: 1;
        border-radius: 22.5%;
        overflow: hidden;
        color: var(--white);
        font-weight: 700;
        flex: none;
      }

      .icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .label {
        margin: 0;
        width: 100%;
        font-weight: 600;
        line-height: 1.2;
        text-align: center;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      &.sm .icon {
        font-size: 1.35rem;
      }

      &.sm .label {
        font-size: 0.75rem;
      }

      &.md .icon {
        font-size: 1.75rem;
      }

      &.md .label {
        font-size: 0.8125rem;
      }
    }
  `;

  return [view, style];
}
