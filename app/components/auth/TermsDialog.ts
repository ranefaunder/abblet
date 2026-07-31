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
        <h2 ui-heading="sm">${t("Terms of use")}</h2>
        <button
          ui-button="square inline"
          ui-icon="x"
          onClick=${() => dialogRef.current?.close()}
          aria-label=${t("Close")}
        ></button>
      </header>
      <div ui-column="gap-md">
        <p>
          ${t(
            "Remiix is a service by Faunder for requesting, remixing, and running personal apps. By using Remiix you accept these terms.",
          )}
        </p>

        <div ui-column="gap-sm">
          <h3 ui-heading="sm">${t("How apps are made")}</h3>
          <p>
            ${t(
              "When you describe an idea or ask for a change, you are requesting Remiix to create or adapt an app. Remiix generates the software. You are a requester and user of that software — not its author.",
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
          <p>
            ${t(
              "Your prompts, ideas, and the personal data you enter into an app remain yours. The app source code and related software materials do not.",
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

        <div ui-column="gap-sm">
          <h3 ui-heading="sm">${t("Acceptable use")}</h3>
          <p>
            ${t(
              "Use Remiix for lawful, non-abusive purposes. We may update the service and these terms as the product evolves. Continued use after changes means you accept the updated terms.",
            )}
          </p>
        </div>
      </div>
    </dialog>
  `;
}
