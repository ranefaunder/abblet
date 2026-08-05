import type { Language, TranslationKey } from "/types/i18n-types";
import { t } from "/utils/i18n";
import { checkRateLimit } from "/utils/rate-limit.server";
import { getClientIP } from "/utils/request.server";
import { dbGetUserByEmail } from "/server/database/queries/users";
import { apiError, apiSuccess } from "/utils/api.server";
import { issueAndSendLoginCode } from "/utils/login-code.server";
import type { BunRequest } from "bun";

function validateEmail(email: string): TranslationKey | null {
  if (!email || typeof email !== "string" || email.length > 254)
    return email?.length > 254 ? "Email address is too long" : "Email address required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return "Invalid email address";
  return null;
}

/** POST – Lähetä kirjautumiskoodi (anti-enumeration: always success-shaped if email valid). */
export default {
  async POST(req: BunRequest) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError({ code: "INVALID_JSON" });
    }
    const b = body as { email?: string; language?: string };
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    const language = (b?.language || "en") as Language;

    const emailError = validateEmail(email);
    if (emailError)
      return apiError({
        code: "INVALID_EMAIL",
        message: t(emailError, language),
      });

    const clientIP = getClientIP(req);
    const isAllowed = checkRateLimit(clientIP, "login_code_request", 3, 10);
    if (!isAllowed) {
      return apiError({
        code: "RATE_LIMIT_EXCEEDED",
        message: t("Too many requests. Wait a moment before retrying.", language),
        status: 429,
      });
    }

    const existingUser = dbGetUserByEmail(email);
    // Anti-enumeration: do not reveal whether the account exists.
    if (!existingUser || (existingUser.is_guest ?? 0) === 1) {
      return apiSuccess({
        data: {
          debugCode: undefined as string | undefined,
        },
      });
    }

    const sent = await issueAndSendLoginCode(email, language);
    if (!sent.ok) {
      return apiError({
        code: "EMAIL_SEND_FAILED",
        message: t(sent.errorKey, language),
        status: 500,
      });
    }

    return apiSuccess({
      data: {
        debugCode: process.env.NODE_ENV === "development" ? sent.code : undefined,
      },
    });
  },
};
