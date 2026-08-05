import { randomInt } from "crypto";
import type { Language, TranslationKey } from "/types/i18n-types";
import { t } from "/utils/i18n";
import { createLoginCodeEmail, sendEmailSafe } from "/utils/email.server";
import { dbDeleteExpiredLoginCodes, dbCreateLoginCode } from "/server/database/queries/login-codes";

export function isE2eSkipEmail(): boolean {
  return process.env.APPSTUDO_E2E_SKIP_EMAIL === "1" && process.env.NODE_ENV !== "production";
}

/** Create a 6-digit login code, persist it, and email it. */
export async function issueAndSendLoginCode(
  email: string,
  language: Language,
): Promise<
  | { ok: true; code: string }
  | { ok: false; errorKey: TranslationKey }
> {
  dbDeleteExpiredLoginCodes();

  let code = "";
  for (let i = 0; i < 6; i++) {
    code += randomInt(0, 10);
  }
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  dbCreateLoginCode({ email, code, expiresAt });

  if (isE2eSkipEmail()) {
    if (process.env.NODE_ENV === "development") {
      console.info(`🔑 E2E/DEV: Login code for ${email}: ${code}`);
    }
    return { ok: true, code };
  }

  const emailContent = createLoginCodeEmail(code, language);
  const sent = await sendEmailSafe(email, emailContent.subject, emailContent.text);
  if (!sent.ok) {
    const msg = sent.error ?? "";
    const errorKey: TranslationKey =
      msg.includes("Too many") || msg.includes("rate limit")
        ? "Too many requests. Wait a moment before retrying."
        : msg.includes("Email service")
          ? "Email service unavailable. Try again later."
          : "Error sending code. Try again.";
    return { ok: false, errorKey };
  }

  if (process.env.NODE_ENV === "development") {
    console.info(`🔑 DEVELOPMENT: Login code for ${email}: ${code}`);
  }

  return { ok: true, code };
}

export function emailSendFailedMessage(errorKey: TranslationKey, language: Language): string {
  return t(errorKey, language);
}
