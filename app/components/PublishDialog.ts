import { html } from "/utils/markup";
import { useRef } from "preact/hooks";
import { t } from "/utils/i18n";

/** Confirm before publishing an app to the Store. */
export default function PublishDialog({
  id = "publish-dialog",
  publishing = false,
  onConfirm,
}: {
  id?: string;
  publishing?: boolean;
  onConfirm: () => boolean | Promise<boolean | void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function close() {
    dialogRef.current?.close();
  }

  async function confirm() {
    const ok = await onConfirm();
    if (ok === false) return;
    close();
  }

  return html`
    <dialog id=${id} ref=${dialogRef} ui-dialog="md" closedby="any">
      <header ui-row="x-between y-start gap-lg">
        <h2 ui-heading="sm">${t("Publish to the Store")}</h2>
        <button
          type="button"
          ui-button="square inline"
          ui-icon="x"
          onClick=${close}
          aria-label=${t("Close")}
        ></button>
      </header>
      <div ui-column="gap-md">
        <p>
          ${t(
            "Publishing makes your app public in the Remiix Store. Anyone can open it, view its source, and remix it.",
          )}
        </p>

        <div ui-column="gap-sm">
          <h3 ui-heading="sm">${t("What becomes public")}</h3>
          <p>
            ${t(
              "Your app’s title, description, icon, and source code appear in the Store. People can run the app and create their own remixed copies.",
            )}
          </p>
        </div>

        <div ui-column="gap-sm">
          <h3 ui-heading="sm">${t("Copyright")}</h3>
          <p>
            ${t(
              "All apps available through Remiix — including Store apps, remixed apps, and apps created from your requests — are copyrighted by Faunder, the maker of Remiix. Copyright does not transfer to you when you request, remix, install, or run an app.",
            )}
          </p>
        </div>

        <div ui-column="gap-sm">
          <h3 ui-heading="sm">${t("License")}</h3>
          <p>
            ${t(
              "App source code is licensed under the Mozilla Public License 2.0 (MPL 2.0). Under that license you may use, study, modify, and redistribute the licensed source, subject to MPL 2.0’s terms (including sharing modifications to covered files under the same license).",
            )}
            ${" "}
            <a href="https://www.mozilla.org/MPL/2.0/" target="_blank" rel="noopener noreferrer" ui-link>
              ${t("Mozilla Public License 2.0")}
            </a>
          </p>
          <p>
            ${t(
              "Publishing, remixing, or downloading an app through Remiix does not grant you ownership — only the rights MPL 2.0 provides.",
            )}
          </p>
        </div>
      </div>
      <footer ui-row="gap-sm x-end y-center">
        <button type="button" ui-button onClick=${close}>${t("Cancel")}</button>
        <button
          type="button"
          ui-button="primary"
          disabled=${publishing}
          aria-busy=${publishing}
          onClick=${() => void confirm()}
        >
          ${t("Publish to Store")}
        </button>
      </footer>
    </dialog>
  `;
}

export function openPublishDialog(id = "publish-dialog") {
  const dialog = document.getElementById(id) as HTMLDialogElement | null;
  dialog?.showModal();
}
