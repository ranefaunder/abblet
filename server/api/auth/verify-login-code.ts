import { checkRateLimit } from "/utils/rate-limit.server";
import { getClientIP } from "/utils/request.server";
import { dbGetLoginCode, dbGetUsedLoginCode, dbUpdateLoginCodeUsed } from "/server/database/queries/login-codes";
import { dbGetUserByEmail, dbUpdateUserLastLogin } from "/server/database/queries/users";
import { createAuthSession } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";
import type { Language } from "/types/i18n-types";
import type { BunRequest } from "bun";

export default {
  async POST(req: BunRequest) {
    const language = (getLang(req.url) ?? "en") as Language;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError({ code: "INVALID_JSON" });
    }
    const b = body as { email?: string; code?: unknown };
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    const code = b?.code;

    if (!email || !code) {
      return apiError({
        code: "EMAIL_AND_CODE_REQUIRED",
        message: t("Email and code are required.", language),
      });
    }

    const clientIP = getClientIP(req);
    const ipOk = checkRateLimit(clientIP, "login_attempt", 5, 10);
    const emailOk = checkRateLimit(`email:${email}`, "login_attempt", 5, 10);
    if (!ipOk || !emailOk) {
      return apiError({
        code: "RATE_LIMIT_EXCEEDED",
        message: t("Too many attempts. Wait a moment and try again.", language),
        status: 429,
      });
    }

    const normalizedCode = String(code).trim();
    const loginCode = dbGetLoginCode(email, normalizedCode);

    if (!loginCode) {
      const usedCode = dbGetUsedLoginCode(email, normalizedCode);
      if (usedCode) {
        return apiError({
          code: "LOGIN_CODE_ALREADY_USED",
          message: t("This login code was already used. Request a new one.", language),
          status: 401,
        });
      }
      return apiError({
        code: "LOGIN_CODE_INVALID",
        message: t("Invalid code", language),
        status: 401,
      });
    }

    dbUpdateLoginCodeUsed(loginCode.id);

    const existingUser = dbGetUserByEmail(email);
    if (!existingUser || (existingUser.is_guest ?? 0) === 1) {
      return apiError({
        code: "USER_NOT_FOUND",
        message: t("No account found for this email. Please register first.", language),
        status: 404,
      });
    }

    dbUpdateUserLastLogin(email);
    createAuthSession(req, existingUser.id);

    return apiSuccess({
      data: {
        user: {
          id: existingUser.id,
          email: existingUser.email,
          createdAt: existingUser.created_at,
          lastLogin: existingUser.last_login,
          nickname: existingUser.nickname ?? null,
          marketingOptIn: (existingUser.marketing_opt_in ?? 0) === 1,
          plan: existingUser.plan === "premium" ? "premium" : "free",
        },
      },
    });
  },
};
