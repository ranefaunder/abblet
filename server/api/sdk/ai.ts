import type { BunRequest } from "bun";
import { AiRequestError, requestTextFromAi } from "/utils/ai-core.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { isOriginForAppSlug } from "/utils/app-host";
import { assertHasCredits, debitOpenRouterUsage } from "/utils/credits.server";
import { checkRateLimit } from "/utils/rate-limit.server";
import { parseBearerToken, resolveRuntimeToken } from "/utils/sdk-auth.server";
import { sdkCorsOptions, withSdkCors } from "/utils/sdk-cors.server";

const PROMPT_MAX = 8000;
const SYSTEM_MAX = 2000;
const DEFAULT_SYSTEM = "You are a helpful assistant. Be concise.";

export function getRuntimeAiModel(): string {
  return process.env.RUNTIME_AI_MODEL?.trim() || "google/gemini-2.5-flash-lite";
}

/**
 * POST /api/sdk/ai — run a cheap text completion for an app runtime (Bearer token).
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCorsOptions(req);
  },

  async POST(req: BunRequest) {
    const origin = req.headers.get("Origin");

    let body: { prompt?: unknown; system?: unknown };
    try {
      body = (await req.json()) as { prompt?: unknown; system?: unknown };
    } catch {
      return withSdkCors(apiError({ code: "INVALID_JSON", status: 400 }), origin);
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return withSdkCors(apiError({ code: "MISSING_PROMPT", status: 400 }), origin);
    }
    if (prompt.length > PROMPT_MAX) {
      return withSdkCors(apiError({ code: "PROMPT_TOO_LONG", status: 400 }), origin);
    }

    let system: string | undefined;
    if (body.system !== undefined && body.system !== null) {
      if (typeof body.system !== "string") {
        return withSdkCors(apiError({ code: "INVALID_SYSTEM", status: 400 }), origin);
      }
      system = body.system.trim();
      if (system.length > SYSTEM_MAX) {
        return withSdkCors(apiError({ code: "PROMPT_TOO_LONG", status: 400 }), origin);
      }
      if (!system) system = undefined;
    }

    const resolved = resolveRuntimeToken(parseBearerToken(req));
    if (!resolved.ok) {
      const code = resolved.reason === "expired" ? "TOKEN_EXPIRED" : "UNAUTHORIZED";
      return withSdkCors(apiError({ code, status: 401 }), origin);
    }

    const { userId, appSlug } = resolved.token;
    if (!origin || !isOriginForAppSlug(origin, appSlug)) {
      return apiError({ code: "ORIGIN_DENIED", status: 403 });
    }

    const maxAttempts = process.env.NODE_ENV === "development" ? 300 : 30;
    if (!checkRateLimit(userId, "sdk_ai", maxAttempts, 10)) {
      return withSdkCors(apiError({ code: "RATE_LIMITED", status: 429 }), origin);
    }

    try {
      assertHasCredits(userId);
    } catch (err) {
      if (err instanceof AiRequestError && err.code === "INSUFFICIENT_CREDITS") {
        return withSdkCors(apiError({ code: "INSUFFICIENT_CREDITS", status: 402 }), origin);
      }
      throw err;
    }

    try {
      const { text, costUsd } = await requestTextFromAi({
        systemPrompt: system ?? DEFAULT_SYSTEM,
        userPrompt: prompt,
        model: getRuntimeAiModel(),
      });
      debitOpenRouterUsage({
        userId,
        costUsd,
        floorKind: "runtime",
        reason: "ai_runtime",
        meta: { appSlug },
      });
      return withSdkCors(apiSuccess({ data: { text } }), origin);
    } catch (err) {
      if (err instanceof AiRequestError) {
        const status =
          err.code === "RATE_LIMIT_EXCEEDED"
            ? 429
            : err.code === "AI_TIMEOUT"
              ? 504
              : err.code === "INSUFFICIENT_CREDITS"
                ? 402
                : err.code === "API_KEY_INVALID"
                  ? 503
                  : 500;
        return withSdkCors(apiError({ code: err.code, status }), origin);
      }
      console.error("[api/sdk/ai]", { userId, appSlug, err });
      return withSdkCors(apiError({ code: "AI_ERROR", status: 500 }), origin);
    }
  },
};
