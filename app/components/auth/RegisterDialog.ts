import { html, css } from "/utils/markup";
import { useState, useRef, useEffect } from "preact/hooks";
import { register } from "/app/stores/userStore";
import { useLocation } from "preact-iso";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";

function registerErrorMessage(code?: string, message?: string): string {
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

export default function RegisterDialog() {
  const { path } = useLocation();
  const lang = getLang(path ?? "") ?? "en";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [termsError, setTermsError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (sending) return;
    setEmailError("");
    setTermsError("");
    if (!termsAccepted) {
      setTermsError(t("You must accept the terms of use to register."));
      return;
    }
    setSending(true);
    const result = await register(email.trim(), lang, termsAccepted, marketingOptIn);
    setSending(false);
    if (result.success) {
      closeDialog();
      if (result.existingUser) {
        window.dispatchEvent(new CustomEvent("open-login-dialog", { detail: { email: email.trim() } }));
      } else if (result.registration) {
        window.dispatchEvent(new CustomEvent("open-registration-success-dialog"));
      }
    } else {
      setEmailError(registerErrorMessage(result.error, result.errorMessage));
    }
  }

  useEffect(() => {
    function handler() {
      setEmail("");
      setEmailError("");
      setTermsError("");
      setTermsAccepted(false);
      setMarketingOptIn(false);
      dialogRef.current?.showModal();
    }
    window.addEventListener("open-register-dialog", handler);
    return () => window.removeEventListener("open-register-dialog", handler);
  }, []);

  const view = html`
    <dialog id="register-dialog" data-scope="RegisterDialog" ref=${dialogRef} ui-dialog="xs" closedby="any">
      <header ui-row="x-between y-start gap-lg">
        <h2>${t("Register")}</h2>
        <button ui-button="square inline" ui-icon="x" onClick=${closeDialog} aria-label=${t("Close")}></button>
      </header>
      <form id="register-form" ui-column="gap-md" onSubmit=${handleSubmit}>
        <div ui-field>
          <label for="register-email">${t("Email")}</label>
          <input
            type="email"
            id="register-email"
            value=${email}
            onInput=${(e: Event) => {
              setEmail((e.target as HTMLInputElement).value);
              if (emailError) setEmailError("");
            }}
            required
            disabled=${sending}
            aria-invalid=${emailError ? "true" : undefined}
          />
          <p role="error">${emailError || "\u00a0"}</p>
        </div>
        <label ui-row="gap-sm">
          <input
            type="checkbox"
            checked=${termsAccepted}
            onChange=${(e: Event) => {
              setTermsAccepted((e.target as HTMLInputElement).checked);
              if (termsError) setTermsError("");
            }}
          />
          <span>${t("I accept the terms of use")}</span>
        </label>
        ${termsError ? html`<p class="terms-error">${termsError}</p>` : null}
        <label ui-row="gap-sm">
          <input
            type="checkbox"
            checked=${marketingOptIn}
            onChange=${(e: Event) => setMarketingOptIn((e.target as HTMLInputElement).checked)}
          />
          <span>${t("Email me about Remiix updates")}</span>
        </label>
        <button type="submit" ui-button="primary block" disabled=${sending} aria-busy=${sending}>
          ${t("Register")}
        </button>
      </form>
    </dialog>
  `;

  const style = css`
    @scope ([data-scope="RegisterDialog"]) to ([data-scope]) {
      .terms-error {
        margin: 0;
        color: var(--error-700);
        font-size: 0.875rem;
      }
    }
  `;

  return [view, style];
}
