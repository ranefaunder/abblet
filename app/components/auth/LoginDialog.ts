import { html, css } from "/utils/markup";
import { useState, useRef, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { requestLoginCode, user, logout, isLoggedIn } from "/app/stores/userStore";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";

const STORAGE_KEYS = { email: "abblet-login-email" } as const;

function requestErrorMessage(code?: string, message?: string): string {
  switch (code) {
    case "RATE_LIMIT_EXCEEDED":
      return t("Too many requests. Wait a moment before retrying.");
    case "INVALID_EMAIL":
      return message || t("Invalid email address");
    case "NETWORK_ERROR":
      return t("Network error");
    case "EMAIL_SEND_FAILED":
      return message || t("Error sending code. Try again.");
    default:
      break;
  }
  return message || code || t("Error sending code. Try again.");
}

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
    if (sendingCode) return;
    setSendingCode(true);
    setError("");
    const result = await requestLoginCode(email.trim(), lang);
    setSendingCode(false);
    if (!result.success) {
      setError(requestErrorMessage(result.error, result.errorMessage));
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
    const saved =
      localStorage.getItem(STORAGE_KEYS.email) ?? localStorage.getItem("appstudo-login-email");
    if (saved) {
      setEmail(saved);
      localStorage.setItem(STORAGE_KEYS.email, saved);
      localStorage.removeItem("appstudo-login-email");
    }
  }, []);

  if (registered) {
    return html`
      <dialog id="login-dialog" data-scope="LoginDialog" ref=${dialogRef} ui-dialog="xs" closedby="any">
        <header ui-row="x-between y-start gap-lg">
          <h2 ui-heading="sm">${t("Account")}</h2>
          <button ui-button="square inline" ui-icon="x" onClick=${closeDialog} aria-label=${t("Close")}></button>
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
        <button ui-button="square inline" ui-icon="x" onClick=${closeDialog} aria-label=${t("Close")}></button>
      </header>
      <form id="login-send-code-form" onSubmit=${handleSendCode} ui-column="gap-md">
        <div ui-field>
          <label for="email">${t("Email")}</label>
          <input
            type="email"
            id="email"
            value=${email}
            onInput=${(e: Event) => {
              const val = (e.target as HTMLInputElement).value;
              setEmail(val);
              if (error) setError("");
              if (val) localStorage.setItem(STORAGE_KEYS.email, val);
            }}
            required
            disabled=${sendingCode}
            placeholder="name@example.com"
            aria-invalid=${error ? "true" : undefined}
          />
          <p role="error">${error || "\u00a0"}</p>
        </div>
        <button
          type="submit"
          ui-button="primary block"
          disabled=${sendingCode}
          aria-busy=${sendingCode}
        >
          ${t("Send login code")}
        </button>
        <button
          type="button"
          ui-button="inline xs"
          onClick=${() => {
            closeDialog();
            window.dispatchEvent(new CustomEvent("open-register-dialog"));
          }}
        >
          ${t("No account yet? Register")}
        </button>
      </form>
    </dialog>
  `;

  return [view, css``];
}
