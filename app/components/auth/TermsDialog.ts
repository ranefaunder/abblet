import { html } from "/utils/markup";
import { useRef, useEffect } from "preact/hooks";
import { t } from "/utils/i18n";

export default function TermsDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function handler() {
      dialogRef.current?.showModal();
    }
    window.addEventListener("open-terms-dialog", handler);
    return () => window.removeEventListener("open-terms-dialog", handler);
  }, []);

  return html`
    <dialog id="terms-dialog" ref=${dialogRef} ui-dialog="md" closedby="any">
      <header ui-row="x-between y-start gap-lg">
        <h2 ui-heading="sm">Terms of use</h2>
        <button ui-button="square inline" ui-icon="x" onClick=${() => dialogRef.current?.close()} aria-label="Close"></button>
      </header>
      <div ui-column="gap-md">
        <p>${t("Rmix is a platform for creating personal apps. By using the service you accept these terms.")}</p>
        <p>Use the service for personal, non-abusive purposes. We may update features as the product evolves.</p>
      </div>
    </dialog>
  `;
}
