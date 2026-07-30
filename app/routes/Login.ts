import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { t } from "/utils/i18n";
import { isLoggedIn } from "/app/stores/userStore";
import { aboutUrl } from "/utils/app-url";

export const LoginPath = "/:lang/login" as const;

export default function Login({ params }: RoutePropsForPath<typeof LoginPath>) {
  const { route, query } = useLocation();
  const { lang } = params;
  const nextPath =
    query.next && query.next.startsWith("/") && !query.next.startsWith("//")
      ? query.next
      : aboutUrl(lang);
  const registered = isLoggedIn();

  function redirectIfLoggedIn() {
    if (registered) route(nextPath, true);
  }
  useEffect(() => redirectIfLoggedIn(), [registered, nextPath, route]);

  if (registered) return null;

  const view = html`
    <div data-scope="Login" class="page" ui-column>
      <div class="scroll" ui-container="sm">
        <header ui-margin="bottom-lg">
          <h1 ui-heading="lg">${t("Login")}</h1>
        </header>

        <div ui-card ui-padding="lg" ui-column="gap-md">
          <p>${t("Sign in to apply your ideas")}</p>
          <div ui-row="gap-sm wrap">
            <button type="button" ui-button="primary" commandfor="login-dialog" command="show-modal">
              ${t("Login")}
            </button>
            <button type="button" ui-button="tertiary" commandfor="register-dialog" command="show-modal">
              ${t("Register")}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const style = css`
    @scope ([data-scope="Login"]) to ([data-scope]) {
      &.page {
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      .scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding-top: calc(1.5rem + env(safe-area-inset-top, 0px));
        padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
      }
    }
  `;

  return [view, style];
}
