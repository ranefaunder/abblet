import { html, css } from "/utils/markup";
import { useRef } from "preact/hooks";
import { t } from "/utils/i18n";

const POINTS = [
  {
    icon: "globe",
    title: "Anyone can open it",
    body: "Your app gets a public Store page and a shareable link.",
  },
  {
    icon: "code",
    title: "Listing and source go public",
    body: "Title, description, icon, and source code are visible in the Store.",
  },
  {
    icon: "git-fork",
    title: "Others can remix it",
    body: "People can adapt your app into their own version with a prompt.",
  },
] as const;

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

  const view = html`
    <dialog
      id=${id}
      ref=${dialogRef}
      class="publish-dialog"
      data-scope="PublishDialog"
      ui-dialog="sm"
      closedby="any"
    >
      <header class="pub-header" ui-row="x-between y-start gap-md">
        <div class="pub-intro" ui-column="gap-sm">
          <p class="pub-eyebrow">${t("Remiix Store")}</p>
          <h2 class="pub-title">${t("Publish to the Store")}</h2>
          <p class="pub-lede">
            ${t("Share what you built so others can use it — and remix it further.")}
          </p>
        </div>
        <button
          type="button"
          ui-button="square inline"
          ui-icon="x"
          onClick=${close}
          aria-label=${t("Close")}
        ></button>
      </header>

      <div class="pub-body">
        <ul class="pub-points" ui-off>
          ${POINTS.map(
            (point) => html`
              <li class="pub-point">
                <span class="pub-point-icon" aria-hidden="true">
                  <i ui-icon=${point.icon}></i>
                </span>
                <div class="pub-point-copy" ui-column="gap-xs">
                  <strong>${t(point.title)}</strong>
                  <span>${t(point.body)}</span>
                </div>
              </li>
            `,
          )}
        </ul>

        <aside class="pub-legal">
          <p>
            ${t(
              "Publishing keeps the app under Faunder’s copyright and open source (MPL 2.0). You don’t get ownership — only the rights that license gives.",
            )}
            ${" "}
            <a
              href="https://www.mozilla.org/MPL/2.0/"
              target="_blank"
              rel="noopener noreferrer"
              ui-link
            >
              ${t("Mozilla Public License 2.0")}
            </a>
          </p>
        </aside>
      </div>

      <footer class="pub-footer" ui-row="gap-sm x-end y-center wrap">
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

  return [view, styles()];
}

function styles() {
  return css`
    @scope ([data-scope="PublishDialog"]) to ([data-scope]) {
      &.publish-dialog {
        --pub-ink: var(--neutral-800, #1c1c1e);
        --pub-muted: var(--neutral-500, #6e6e73);
        --pub-line: var(--neutral-200, #e5e5ea);
        --pub-soft: var(--neutral-50, #f5f5f7);
        --pub-accent: var(--primary-600, #007aff);
      }

      /* Faunder: header 24/24/16, body inline 24, footer 16/24/24 */
      .pub-header {
        align-items: flex-start;
      }

      .pub-intro {
        min-width: 0;
        flex: 1 1 auto;
        padding-inline-end: 0.5rem;
      }

      .pub-eyebrow {
        margin: 0;
        font-size: 0.6875rem;
        font-weight: 650;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--pub-accent);
      }

      .pub-title {
        margin: 0;
        font-size: 1.375rem;
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.2;
        color: var(--pub-ink);
      }

      .pub-lede {
        margin: 0;
        max-width: 32rem;
        font-size: 0.9375rem;
        font-weight: 500;
        line-height: 1.45;
        color: var(--pub-muted);
      }

      .pub-body {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding-block: 0.25rem 0.25rem;
        box-sizing: border-box;
      }

      .pub-points {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }

      .pub-point {
        display: grid;
        grid-template-columns: 2.5rem 1fr;
        gap: 0.75rem;
        align-items: start;
        padding: 0.75rem 0.875rem;
        border: 1px solid var(--pub-line);
        border-radius: 0.875rem;
        background: var(--pub-soft);
        box-sizing: border-box;
      }

      .pub-point-icon {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.7rem;
        background: var(--white, #fff);
        border: 1px solid var(--pub-line);
        color: var(--pub-accent);
        box-sizing: border-box;
      }

      .pub-point-icon [ui-icon] {
        --ui-icon-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
      }

      .pub-point-copy {
        min-width: 0;
        padding-block: 0.2rem;
      }

      .pub-point-copy strong {
        font-size: 0.9375rem;
        font-weight: 650;
        letter-spacing: -0.02em;
        color: var(--pub-ink);
      }

      .pub-point-copy span {
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--pub-muted);
      }

      .pub-legal {
        margin: 0;
        padding: 0.75rem 0.875rem;
        border-radius: 0.75rem;
        border: 1px dashed var(--pub-line);
        background: transparent;
        box-sizing: border-box;
      }

      .pub-legal p {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.45;
        color: var(--pub-muted);
      }

      .pub-footer {
        margin: 0;
        border-top: 1px solid var(--pub-line);
      }
    }
  `;
}

export function openPublishDialog(id = "publish-dialog") {
  const dialog = document.getElementById(id) as HTMLDialogElement | null;
  dialog?.showModal();
}
