import { html, css } from "/utils/markup";
import { useRef, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";

export default function RegistrationSuccessDialog() {
  const { route, path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function handler() {
      dialogRef.current?.showModal();
    }
    window.addEventListener("open-registration-success-dialog", handler);
    return () => window.removeEventListener("open-registration-success-dialog", handler);
  }, []);

  const view = html`
    <dialog id="registration-success-dialog" ref=${dialogRef} ui-dialog="xs" closedby="any">
      <header>
        <h2>${t("Welcome to Abblet!")}</h2>
      </header>
      <p>${t("Thank you for joining Abblet. Describe what you need and Abblet applies it — your first app in minutes.")}</p>
      <footer>
        <button
          type="button"
          ui-button="primary block"
          onClick=${() => {
            dialogRef.current?.close();
            route(`/${lang}/create`, true);
          }}
        >
          ${t("Create App")}
        </button>
      </footer>
    </dialog>
  `;

  return [view, css``];
}
