import { html, css } from "/utils/markup";
import { t } from "/utils/i18n";
import { appIconSrc } from "/utils/app-icon";
import { previewGradient, draftLetter, draftAccentColor } from "/utils/app-preview";
import type { StoreAppCard } from "/types/app-types";

/** Featured / hero promo card for Apps & Games. */
export default function AppCard({
  app,
  href,
  eyebrow,
  cta = t("Open"),
}: {
  app: Pick<StoreAppCard, "slug" | "title" | "iconId" | "tagline" | "description">;
  href: string;
  eyebrow: string;
  cta?: string;
}) {
  const iconSrc = appIconSrc(app.iconId);

  const view = html`
    <a
      data-scope="AppCard"
      class="app-card"
      href=${href}
      style=${`--card-gradient: ${previewGradient(app.slug)}; --card-accent: ${draftAccentColor(app.slug)}`}
    >
      <span class="card-glow" aria-hidden="true"></span>
      <span class="card-body" ui-column="gap-sm">
        <small>${eyebrow}</small>
        <strong>${app.title}</strong>
        <p>${app.tagline || app.description}</p>
        <span class="card-cta">${cta}</span>
      </span>
      <span
        class="card-icon"
        style=${`background: ${previewGradient(app.slug)}`}
        aria-hidden="true"
      >
        ${iconSrc
          ? html`<img src=${iconSrc} alt="" width="96" height="96" decoding="async" />`
          : html`<span class="letter">${draftLetter(app.title)}</span>`}
      </span>
    </a>
  `;

  const style = css`
    @scope ([data-scope="AppCard"]) to ([data-scope]) {
      & {
        position: relative;
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: end;
        gap: 0.85rem;
        min-height: 11.5rem;
        padding: 1.1rem 1.15rem 1.05rem;
        border-radius: 1.5rem;
        text-decoration: none;
        color: var(--white);
        overflow: hidden;
        background: var(--card-gradient);
        box-shadow: 0 18px 40px color-mix(in oklab, var(--card-accent) 28%, transparent);
        animation: app-card-pop 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .card-glow {
        position: absolute;
        inset: auto -20% -40% 30%;
        height: 70%;
        background: radial-gradient(circle, color-mix(in oklab, var(--white) 35%, transparent), transparent 65%);
        pointer-events: none;
      }

      .card-body {
        position: relative;
        z-index: 1;
        min-width: 0;
      }

      .card-body small {
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.85;
      }

      .card-body > strong {
        font-size: clamp(1.45rem, 4.5vw, 1.9rem);
        letter-spacing: -0.035em;
        line-height: 1.05;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .card-body p {
        margin: 0;
        max-width: 28ch;
        color: color-mix(in oklab, var(--white) 82%, transparent);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .card-cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        padding: 0.45rem 1rem;
        border-radius: 999px;
        background: var(--white);
        color: var(--neutral-950);
        font-size: 0.875rem;
        font-weight: 700;
      }

      .card-icon {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 6.5rem;
        height: 6.5rem;
        border-radius: 1.55rem;
        overflow: hidden;
        color: var(--white);
        font-weight: 800;
        font-size: 2rem;
        box-shadow: 0 10px 24px color-mix(in oklab, var(--neutral-950) 12%, transparent);
        animation: app-card-float 3.2s ease-in-out infinite;
      }

      .card-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      @keyframes app-card-pop {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes app-card-float {
        0%,
        100% {
          transform: translateY(0) rotate(0deg);
        }
        50% {
          transform: translateY(-6px) rotate(2deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        &,
        .card-icon {
          animation: none;
        }
      }
    }
  `;

  return [view, style];
}
