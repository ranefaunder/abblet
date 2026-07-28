import { html, css } from "/utils/markup";
import { useState, useRef, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { requestLoginCode, user, logout, isLoggedIn } from "/app/stores/userStore";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";

const STORAGE_KEYS = { email: "appstudo-login-email" } as const;

export default function LoginDialog() {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const registered = isLoggedIn();

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSendCode(e: Event) {
    e.preventDefault();
    setSendingCode(true);
    setError("");
    const result = await requestLoginCode(email.trim(), lang);
    setSendingCode(false);
    if (!result.success) {
      setError(result.errorMessage ?? result.error ?? "");
      return;
    }
    closeDialog();
    window.dispatchEvent(
      new CustomEvent("open-login-dialog-for-code", {
        detail: { email: email.trim(), showCodeSentInfo: true },
      }),
    );
  }

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.email);
    if (saved) setEmail(saved);
  }, []);

  if (registered) {
    return html`
      <dialog id="login-dialog" data-scope="LoginDialog" ref=${dialogRef} ui-dialog="xs" closedby="any">
        <header ui-row="x-between y-start gap-lg">
          <h2 ui-heading="sm">${t("Account")}</h2>
          <button ui-button="square inline" ui-icon="x" onClick=${closeDialog} aria-label="Close"></button>
        </header>
        <p>${t("Logged in as:")} <strong>${user.value!.email}</strong></p>
        <footer>
          <button type="button" onClick=${async () => { await logout(); closeDialog(); }} ui-button="primary">${t("Log out")}</button>
        </footer>
      </dialog>
    `;
  }

  const view = html`
    <dialog id="login-dialog" data-scope="LoginDialog" ref=${dialogRef} ui-dialog="xs" closedby="any">
      <header ui-row="x-between y-start gap-lg">
        <h2>${t("Login")}</h2>
        <button ui-button="square inline" ui-icon="x" onClick=${closeDialog} aria-label="Close"></button>
      </header>
      <form id="login-send-code-form" onSubmit=${handleSendCode}>
        <div ui-field>
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            value=${email}
            onInput=${(e: Event) => {
              const val = (e.target as HTMLInputElement).value;
              setEmail(val);
              if (val) localStorage.setItem(STORAGE_KEYS.email, val);
            }}
            required
            disabled=${sendingCode}
            placeholder="name@example.com"
          />
          <p role="error">${error || ""}</p>
        </div>
      </form>
      <footer ui-column="gap-md x-center">
        <button type="submit" form="login-send-code-form" ui-button="primary block" disabled=${sendingCode}>
          Send login code
        </button>
        <button
          type="button"
          ui-button="inline xs"
          onClick=${() => {
            closeDialog();
            window.dispatchEvent(new CustomEvent("open-register-dialog"));
          }}
        >
          No account yet? Register
        </button>
      </footer>
    </dialog>
  `;

  return [view, css``];
}
