import { html, css } from "/utils/markup";
import { t } from "/utils/i18n";

const FAUNDER_URL = "https://faunder.fi";

/** Site-wide footer — Rmix is a Faunder product. */
export default function SiteFooter() {
  const view = html`
    <footer data-scope="SiteFooter" class="site-footer">
      <div class="inner" ui-row="gap-md y-center x-between wrap">
        <a
          class="faunder"
          href=${FAUNDER_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label=${t("Faunder — maker of Rmix")}
        >
          <img
            class="mark"
            src="/static/images/ffffaunder.svg"
            alt=""
            width="28"
            height="24"
          />
          <img
            class="wordmark"
            src="/static/images/faunder.svg"
            alt="Faunder"
            width="100"
            height="20"
          />
        </a>
        <p class="credit">
          ${t("Rmix is made by")}
          ${" "}
          <a href=${FAUNDER_URL} target="_blank" rel="noopener noreferrer">Faunder</a>
        </p>
      </div>
    </footer>
  `;

  const style = css`
    @scope ([data-scope="SiteFooter"]) to ([data-scope]) {
      &.site-footer {
        flex: none;
        border-top: 1px solid var(--neutral-200);
        background: color-mix(in oklab, var(--neutral-50) 70%, var(--white));
        padding:
          1.25rem
          max(1rem, env(safe-area-inset-right, 0px))
          calc(1.25rem + env(safe-area-inset-bottom, 0px))
          max(1rem, env(safe-area-inset-left, 0px));
      }

      .inner {
        width: min(100%, 48rem);
        margin-inline: auto;
      }

      .faunder {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        text-decoration: none;
        color: var(--neutral-950);
      }

      .faunder:hover {
        opacity: 0.75;
      }

      .mark {
        display: block;
        height: 1.15rem;
        width: auto;
      }

      .wordmark {
        display: block;
        height: 0.95rem;
        width: auto;
      }

      .credit {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--neutral-500);
      }

      .credit a {
        color: var(--neutral-800);
        font-weight: 600;
        text-decoration: none;
      }

      .credit a:hover {
        color: var(--primary-700);
      }
    }
  `;

  return [view, style];
}
