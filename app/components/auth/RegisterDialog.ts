import { html, css } from "/utils/markup";
import { useState, useRef, useEffect } from "preact/hooks";
import { register } from "/app/stores/userStore";
import { useLocation } from "preact-iso";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";

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
      setEmailError(result.errorMessage ?? result.error ?? "");
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
        <button ui-button="square inline" ui-icon="x" onClick=${closeDialog} aria-label="Close"></button>
      </header>
      <form id="register-form" ui-column="gap-md" onSubmit=${handleSubmit}>
        <div ui-field>
          <label for="register-email">Email</label>
          <input
            type="email"
            id="register-email"
            value=${email}
            onInput=${(e: Event) => setEmail((e.target as HTMLInputElement).value)}
            required
            disabled=${sending}
          />
          <p role="error">${emailError || ""}</p>
        </div>
        <label ui-row="gap-sm">
          <input
            type="checkbox"
            checked=${termsAccepted}
            onChange=${(e: Event) => setTermsAccepted((e.target as HTMLInputElement).checked)}
          />
          <span>I accept the terms of use</span>
        </label>
        <p role="error">${termsError || ""}</p>
        <label ui-row="gap-sm">
          <input
            type="checkbox"
            checked=${marketingOptIn}
            onChange=${(e: Event) => setMarketingOptIn((e.target as HTMLInputElement).checked)}
          />
          <span>${t("Email me about R⫶⫶MIX updates")}</span>
        </label>
      </form>
      <footer ui-column="gap-md x-center">
        <button type="submit" form="register-form" ui-button="primary block" disabled=${sending}>
          ${t("Register")}
        </button>
      </footer>
    </dialog>
  `;

  return [view, css``];
}
