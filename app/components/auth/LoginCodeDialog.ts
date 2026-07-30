import { html, css } from "/utils/markup";
import { useState, useRef, useEffect } from "preact/hooks";
import { login } from "/app/stores/userStore";
import { t } from "/utils/i18n";

type OpenDetail = { email: string; showCodeSentInfo?: boolean };

function verifyErrorMessage(code?: string, message?: string): string {
  switch (code) {
    case "LOGIN_CODE_INVALID":
      return t("Invalid code");
    case "LOGIN_CODE_ALREADY_USED":
      return t("This login code was already used. Request a new one.");
    case "RATE_LIMIT_EXCEEDED":
      return t("Too many attempts. Wait a moment and try again.");
    case "USER_NOT_FOUND":
      return t("No account found for this email. Please register first.");
    case "EMAIL_AND_CODE_REQUIRED":
      return t("Email and code are required.");
    case "NETWORK_ERROR":
      return t("Network error");
    default:
      break;
  }
  switch (message) {
    case "Invalid code":
      return t("Invalid code");
    case "Network error":
      return t("Network error");
    default:
      return message || t("Invalid code");
  }
}

export default function LoginCodeDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [showCodeSentInfo, setShowCodeSentInfo] = useState(true);

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleVerifyCode(e: Event) {
    e.preventDefault();
    if (verifyingCode) return;
    setVerifyingCode(true);
    setError("");
    const result = await login(email.trim(), code.trim());
    setVerifyingCode(false);
    if (!result.success) {
      setError(verifyErrorMessage(result.error, result.errorMessage));
      return;
    }
    closeDialog();
    setEmail("");
    setCode("");
  }

  useEffect(() => {
    function handler(e: CustomEvent<OpenDetail>) {
      const emailVal = e.detail?.email?.trim() ?? "";
      if (!emailVal) return;
      setEmail(emailVal);
      setShowCodeSentInfo(e.detail?.showCodeSentInfo !== false);
      setCode("");
      setError("");
      requestAnimationFrame(() => {
        dialogRef.current?.showModal();
        codeInputRef.current?.focus();
      });
    }
    window.addEventListener("open-login-dialog-for-code", handler as EventListener);
    return () => window.removeEventListener("open-login-dialog-for-code", handler as EventListener);
  }, []);

  const view = html`
    <dialog id="login-code-dialog" data-scope="LoginCodeDialog" ref=${dialogRef} ui-dialog="xs" closedby="any">
      <header ui-row="x-between y-start gap-lg">
        <h2>${t("Enter login code")}</h2>
        <button ui-button="square inline" ui-icon="x" onClick=${closeDialog} aria-label=${t("Close")}></button>
      </header>
      <form id="login-verify-form" onSubmit=${handleVerifyCode} ui-column="gap-md">
        ${showCodeSentInfo && html`<p class="code-info">${t("Check your inbox and enter the 6-digit code.")}</p>`}
        <div ui-field>
          <label for="login-code-email">${t("Email")}</label>
          <input type="email" id="login-code-email" value=${email} readOnly />
        </div>
        <div ui-field>
          <label for="login-code-input">${t("Login code")}</label>
          <input
            class="code-input"
            type="text"
            id="login-code-input"
            ref=${codeInputRef}
            value=${code}
            onInput=${(e: Event) => {
              const val = (e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 6);
              setCode(val);
              if (error) setError("");
            }}
            maxLength=${6}
            required
            inputmode="numeric"
            autocomplete="one-time-code"
            aria-invalid=${error ? "true" : undefined}
          />
          <p role="error">${error || "\u00a0"}</p>
        </div>
        <button type="submit" ui-button="primary block" disabled=${verifyingCode} aria-busy=${verifyingCode}>
          ${t("Login")}
        </button>
      </form>
    </dialog>
  `;

  const style = css`
    @scope ([data-scope="LoginCodeDialog"]) to ([data-scope]) {
      .code-info {
        font-size: 0.875rem;
        color: var(--neutral-600);
      }
      .code-input {
        font-weight: 600;
        font-size: 1.25rem;
        letter-spacing: 0.25rem;
      }
    }
  `;

  return [view, style];
}
