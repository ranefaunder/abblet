import { AiRequestError } from "/utils/ai-core.server";
import { apiError } from "/utils/api.server";
import { t } from "/utils/i18n";
import type { Language } from "/types/i18n-types";

export function apiErrorFromAi(err: unknown, language: Language): Response | null {
  if (!(err instanceof AiRequestError)) return null;

  switch (err.code) {
    case "INSUFFICIENT_CREDITS":
      return apiError({
        code: "INSUFFICIENT_CREDITS",
        message: t("Your AI credit ran out. Get Premium or try again next month.", language),
        status: 402,
      });
    case "RATE_LIMIT_EXCEEDED":
      return apiError({
        code: "RATE_LIMIT_EXCEEDED",
        message: t("Too many requests. Wait a moment before retrying.", language),
        status: 429,
      });
    case "API_KEY_INVALID":
      return apiError({
        code: "API_KEY_INVALID",
        message: t("AI service misconfigured. Try again later.", language),
        status: 503,
      });
    case "AI_TIMEOUT":
      return apiError({
        code: "AI_TIMEOUT",
        message: t("The AI took too long to respond. Try again or pick another model.", language),
        status: 504,
      });
    default:
      return apiError({
        code: "GENERATION_FAILED",
        message: t("Could not create app. Try again.", language),
        status: 500,
      });
  }
}
