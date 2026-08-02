import LoginDialog from "/app/components/auth/LoginDialog";
import LoginCodeDialog from "/app/components/auth/LoginCodeDialog";
import RegisterDialog from "/app/components/auth/RegisterDialog";
import RegistrationSuccessDialog from "/app/components/auth/RegistrationSuccessDialog";
import TermsDialog from "/app/components/auth/TermsDialog";
import PremiumDialog from "/app/components/PremiumDialog";
import { html } from "/utils/markup";

export default function Dialogs() {
  return html`
    <${LoginDialog} />
    <${LoginCodeDialog} />
    <${RegisterDialog} />
    <${TermsDialog} />
    <${RegistrationSuccessDialog} />
    <${PremiumDialog} />
  `;
}
