import type { Language, TranslationKey } from "/types/i18n-types";
import { t } from "/utils/i18n";
import { checkRateLimit } from "/utils/rate-limit.server";
import { getClientIP } from "/utils/request.server";
import { generateNickname } from "/utils/nickname.server";
import { dbGetUserByEmail, dbCreateUser, dbExistsUserNickname } from "/server/database/queries/users";
import { apiError, apiSuccess } from "/utils/api.server";
import { issueAndSendLoginCode, isE2eSkipEmail } from "/utils/login-code.server";
import type { BunRequest } from "bun";

function validateEmail(email: string): TranslationKey | null {
  if (!email || typeof email !== "string" || email.length > 254)
    return email?.length > 254 ? "Email address is too long" : "Email address required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return "Invalid email address";
  return null;
}

/**
 * Register: create account (if new) and send login code — no session until verify.
 */
export default {
  async POST(req: BunRequest) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError({ code: "INVALID_JSON" });
    }
    const b = body as { email?: string; language?: string; termsAccepted?: boolean; marketingOptIn?: boolean };
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    const language = (b?.language || "en") as Language;
    const termsAccepted = b?.termsAccepted === true;
    const marketingOptIn = b?.marketingOptIn === true;

    const emailError = validateEmail(email);
    if (emailError)
      return apiError({
        code: "INVALID_EMAIL",
        message: t(emailError, language),
      });

    if (!termsAccepted) {
      return apiError({
        code: "TERMS_NOT_ACCEPTED",
        message: t("You must accept the terms of use to register.", language),
        status: 400,
      });
    }

    const clientIP = getClientIP(req);
    const skipRateLimit = isE2eSkipEmail();
    const isAllowed = skipRateLimit || checkRateLimit(clientIP, "register", 5, 60);
    if (!isAllowed) {
      return apiError({
        code: "RATE_LIMIT_EXCEEDED",
        message: t("Too many requests. Wait a moment before retrying.", language),
        status: 429,
      });
    }

    const existingUser = dbGetUserByEmail(email);
    let isNewRegistration = false;
    if (!existingUser) {
      const userId = crypto.randomUUID();
      const nickname = generateNickname((n) => dbExistsUserNickname(n));
      dbCreateUser({ id: userId, email, nickname, marketingOptIn });
      isNewRegistration = true;
    }

    const sent = await issueAndSendLoginCode(email, language);
    if (!sent.ok) {
      return apiError({
        code: "EMAIL_SEND_FAILED",
        message: t(sent.errorKey, language),
        status: 500,
      });
    }

    // Same shape for new + existing: do not leak account existence via session or distinct flags.
    return apiSuccess({
      data: {
        registration: isNewRegistration,
        needsVerification: true,
        debugCode: process.env.NODE_ENV === "development" ? sent.code : undefined,
      },
    });
  },
};
