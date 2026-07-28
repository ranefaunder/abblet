import type { Language, TranslationKey } from "/types/i18n-types";
import { t } from "/utils/i18n";
import { createWelcomeEmail, sendEmailSafe } from "/utils/email.server";
import { generateNickname } from "/utils/nickname.server";
import { checkRateLimit } from "/utils/rate-limit.server";
import { getClientIP } from "/utils/request.server";
import { dbGetUserByEmail, dbCreateUser, dbUpdateUserLastLogin, dbExistsUserNickname } from "/server/database/queries/users";
import { createAuthSession } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import type { BunRequest } from "bun";

function validateEmail(email: string): TranslationKey | null {
  if (!email || typeof email !== "string" || email.length > 254)
    return email?.length > 254 ? "Email address is too long" : "Email address required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return "Invalid email address";
  return null;
}

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
    const skipRateLimit = process.env.APPSTUDO_E2E_SKIP_EMAIL === "1";
    const isAllowed = skipRateLimit || checkRateLimit(clientIP, "register", 5, 60);
    if (!isAllowed) {
      return apiError({
        code: "RATE_LIMIT_EXCEEDED",
        message: t("Too many requests. Wait a moment before retrying.", language),
        status: 429,
      });
    }

    const existingUser = dbGetUserByEmail(email);
    if (existingUser) {
      return apiSuccess({ data: { existingUser: true } });
    }

    const userId = crypto.randomUUID();
    const nickname = generateNickname((n) => dbExistsUserNickname(n));
    dbCreateUser({ id: userId, email, nickname, marketingOptIn });

    const welcomeContent = createWelcomeEmail(language);
    const sent = await sendEmailSafe(email, welcomeContent.subject, welcomeContent.text);
    if (!sent.ok) {
      const msg = sent.error ?? "";
      const errorKey: TranslationKey = msg.includes("Too many") || msg.includes("rate limit")
        ? "Too many requests. Wait a moment before retrying."
        : msg.includes("Email service")
          ? "Email service unavailable. Try again later."
          : "Error sending code. Try again.";
      return apiError({
        code: "EMAIL_SEND_FAILED",
        message: t(errorKey, language),
        status: 500,
      });
    }

    dbUpdateUserLastLogin(email);
    createAuthSession(req, userId);

    return apiSuccess({
      data: {
        registration: true,
        user: {
          id: userId,
          email,
          nickname,
          createdAt: new Date().toISOString(),
          marketingOptIn,
        },
      },
    });
  },
};
