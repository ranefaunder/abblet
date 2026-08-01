import { html, css } from "/utils/markup";
import { h } from "preact";
import { useSignal } from "@preact/signals";
import { t } from "/utils/i18n";
import { highlightJavaScript } from "/utils/highlight-js";

/** Read-only syntax-highlighted source dialog (Create / Store). */
export default function CodeViewDialog({
  id,
  code,
}: {
  id: string;
  code: string;
}) {
  const highlighted = highlightJavaScript(code);
  const copied = useSignal(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      copied.value = true;
      window.setTimeout(() => {
        copied.value = false;
      }, 1600);
    } catch {
      /* ignore */
    }
  }

  const view = html`
    <dialog id=${id} data-scope="CodeViewDialog" ui-dialog="right lg edge" closedby="any">
      <header class="code-header">
        <div class="code-header-actions">
          <button
            type="button"
            class="code-header-btn"
            ui-off
            disabled=${!code}
            aria-label=${copied.value ? t("Copied") : t("Copy")}
            onClick=${() => void copyCode()}
          >
            <i ui-icon=${copied.value ? "check" : "copy"} aria-hidden="true"></i>
            <span>${copied.value ? t("Copied") : t("Copy")}</span>
          </button>
          <button
            type="button"
            class="code-header-btn"
            ui-off
            commandfor=${id}
            command="close"
          >
            <i ui-icon="x" aria-hidden="true"></i>
            <span>${t("Close")}</span>
          </button>
        </div>
      </header>
      <div class="code-editor">
        <pre class="code-highlight" tabindex="0">
          ${h("code", { dangerouslySetInnerHTML: { __html: `${highlighted}\n` } })}
        </pre>
      </div>
    </dialog>
  `;

  const style = css`
    @scope ([data-scope="CodeViewDialog"]) to ([data-scope]) {
      &:where(dialog) {
        padding: 0;
        max-height: 100dvh;
        background: #141414;
        color: #f4f4f5;
        border: none;
      }

      &:where(dialog[open]) {
        display: flex;
        flex-direction: column;
      }

      .code-header {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
        flex: none;
        padding-top: calc(0.65rem + env(safe-area-inset-top, 0px));
        padding-bottom: 0.65rem;
        padding-inline: 0.85rem 0.75rem;
        background: #0b0b0c;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .code-header-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .code-header-btn {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        min-height: 2.35rem;
        margin: 0;
        border: 0;
        border-radius: 0.7rem;
        padding: 0.4rem 0.7rem;
        background: transparent;
        color: rgba(255, 255, 255, 0.82);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.14s ease, color 0.14s ease;
      }

      .code-header-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .code-header-btn:disabled {
        opacity: 0.4;
        pointer-events: none;
      }

      .code-header-btn [ui-icon] {
        font-size: 1.1rem;
        color: inherit;
      }

      .code-editor {
        position: relative;
        flex: 1;
        min-height: 0;
        background: #141414;
      }

      .code-highlight {
        position: absolute;
        inset: 0;
        margin: 0;
        padding: 1rem 1.1rem calc(1rem + env(safe-area-inset-bottom, 0px));
        font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace;
        font-size: 14px;
        line-height: 1.65;
        tab-size: 2;
        white-space: pre;
        overflow: auto;
        border: none;
        color: #d4d4d4;
        background: #141414;
      }

      .code-highlight:focus {
        outline: none;
      }

      .code-highlight > code {
        display: block;
        font: inherit;
        white-space: pre;
      }

      .code-highlight .hl-keyword { color: #c586c0; }
      .code-highlight .hl-string { color: #ce9178; }
      .code-highlight .hl-comment { color: #6a9955; font-style: italic; }
      .code-highlight .hl-number { color: #b5cea8; }
      .code-highlight .hl-function { color: #dcdcaa; }
      .code-highlight .hl-class { color: #4ec9b0; }
      .code-highlight .hl-builtin { color: #569cd6; }
    }
  `;

  return [view, style];
}
