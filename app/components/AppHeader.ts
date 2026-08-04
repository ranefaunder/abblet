import { html, css } from "/utils/markup";
import { useLocation } from "preact-iso";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";
import { AVAILABLE_LANGUAGES, type Language } from "/i18n/languages";
import { switchClientLanguage, translations } from "/app/stores/i18nStore";

export default function AppHeader() {
  const { path, route } = useLocation();
  const lang = (getLang(path ?? "") ?? "en") as Language;
  void translations.value;

  const view = html`
    <header data-scope="AppHeader" class="app-header">
      <div class="app-header-inner" ui-row="gap-sm y-center x-end">
        <select
          id="app-lang"
          class="lang-select"
          ui-off
          value=${lang}
          aria-label=${t("Language")}
          onChange=${(e: Event) => {
            const next = (e.currentTarget as HTMLSelectElement).value as Language;
            if (!next || next === lang) return;
            switchClientLanguage(next, path ?? `/${lang}/`, route);
          }}
        >
          <button type="button">
            <i ui-icon="globe" aria-hidden="true"></i>
            <span class="lang-code">${lang.toUpperCase()}</span>
          </button>
          ${(Object.keys(AVAILABLE_LANGUAGES) as Language[]).map(
            (code) => html`
              <option value=${code} lang=${code} selected=${code === lang}>
                ${AVAILABLE_LANGUAGES[code].nativeName}
              </option>
            `,
          )}
        </select>
      </div>
    </header>
  `;

  // Picker lives in the top layer outside @scope — style it globally by class.
  const style = css`
    @scope ([data-scope="AppHeader"]) to ([data-scope]) {
      &.app-header {
        flex: none;
        padding-top: env(safe-area-inset-top, 0px);
        background: transparent;
        border: none;
      }

      .app-header-inner {
        box-sizing: border-box;
        width: 100%;
        max-width: 48rem;
        margin-inline: auto;
        padding: 0.35rem 1rem 0;
      }

      .lang-select {
        appearance: base-select;
        flex: none;
        width: fit-content;
        max-width: 12rem;
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--neutral-700);
        font: inherit;
        font-size: 0.875rem;
        line-height: 1.2;
        cursor: pointer;
      }

      .lang-select::picker-icon {
        display: none;
      }

      .lang-select > button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        margin: 0;
        padding: 0.3rem 0.5rem;
        border: none;
        border-radius: 0.45rem;
        background: transparent;
        box-shadow: none;
        color: inherit;
        font: inherit;
        font-weight: 650;
        letter-spacing: 0.02em;
        line-height: 1.2;
        cursor: pointer;
      }

      .lang-select > button:hover,
      .lang-select:focus-visible > button {
        background: color-mix(in oklab, var(--neutral-200) 55%, transparent);
      }

      .lang-select:focus-visible {
        outline: none;
      }

      .lang-select > button [ui-icon] {
        flex: none;
        color: var(--neutral-600);
      }

      .lang-select .lang-code {
        letter-spacing: 0.04em;
      }
    }

    .lang-select,
    .lang-select::picker(select) {
      appearance: base-select;
    }

    .lang-select::picker(select) {
      box-sizing: border-box;
      margin: 0;
      padding: 0.25rem;
      border: 1px solid var(--neutral-200);
      border-radius: 0.65rem;
      background: var(--white);
      color: var(--neutral-900);
      box-shadow: none !important;
      filter: none !important;
      top: calc(anchor(bottom) + 0.25rem);
      right: anchor(right);
      left: auto;
      width: max-content;
      min-width: 9rem;
      overflow: visible;
    }

    .lang-select option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 0.65rem;
      border: none;
      border-radius: 0.45rem;
      background: transparent;
      color: var(--neutral-800);
      cursor: pointer;
    }

    .lang-select option:hover,
    .lang-select option:focus {
      background: var(--neutral-100);
    }

    .lang-select option:checked {
      font-weight: 650;
      background: color-mix(in oklab, var(--primary-100) 70%, var(--neutral-50));
    }

    .lang-select option::checkmark {
      order: 1;
      margin-inline-start: auto;
      margin-inline-end: 0;
    }
  `;

  return html`${view}${style}`;
}
