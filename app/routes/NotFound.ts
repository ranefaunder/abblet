import { html, css } from "/utils/markup";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";
import { splashUrl } from "/utils/app-url";

/** Oletusreitillä ei ole path-mallia; router välittää matchPropsina. */
type NotFoundPageProps = {
  path: string;
  query: Record<string, string>;
  params: Record<string, string>;
};

export default function NotFound({ path, params }: NotFoundPageProps) {
  const currentLang = params.lang || getLang(path) || "en";

  const view = html`
    <div data-scope="NotFound" ui-column="x-center y-center" class="not-found">
      <div ui-column="gap-sm x-center" class="content">
        <p class="code" aria-hidden="true">404</p>
        <h1 ui-heading="xl">${t("Page not found")}</h1>
        <p class="description">The page you are looking for does not exist or has been moved.</p>
        <a href=${splashUrl(currentLang)} ui-button="primary lg" ui-margin="top-md">
          ${t("Go home")}
        </a>
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="NotFound"]) to ([data-scope]) {
      &.not-found {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 2rem 1.5rem calc(2rem + env(safe-area-inset-bottom, 0px));
      }

      .content {
        text-align: center;
      }

      .code {
        font-size: 6rem;
        font-weight: 700;
        color: var(--neutral-300);
        line-height: 1;
      }

      .description {
        color: var(--neutral-600);
      }
    }
  `;

  return [view, style];
}
