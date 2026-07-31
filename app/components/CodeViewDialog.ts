import { html, css } from "/utils/markup";
import { h } from "preact";
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

  const view = html`
    <dialog id=${id} data-scope="CodeViewDialog" ui-dialog="right lg edge" closedby="any">
      <header ui-row="x-between y-center gap-md" ui-padding="inline-md block-sm">
        <h2 ui-heading="sm">${t("Code")}</h2>
        <button
          type="button"
          ui-button="inline"
          ui-icon="x"
          commandfor=${id}
          command="close"
          aria-label=${t("Close")}
        ></button>
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
      }

      &:where(dialog[open]) {
        display: flex;
        flex-direction: column;
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
        padding: 1rem 1.1rem;
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
