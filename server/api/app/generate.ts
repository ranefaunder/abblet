import type { BunRequest } from "bun";
import { withAuthOrGuest } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbCreateApp, dbGenerateAppSlug, dbGetAppBySlug, dbUpdateApp } from "/server/database/queries/apps";
import { dbAddAppMessage, dbListAppMessages } from "/server/database/queries/app-messages";
import { generateAppConfig } from "/utils/ai-apps.server";
import { generateAppIcon } from "/utils/ai-app-icons.server";
import { apiErrorFromAi } from "/utils/ai-api.server";
import { resolveEditAiModel } from "/utils/ai-core.server";
import { DEFAULT_EDIT_AI_MODEL, isEditAiModelKey, resolveStoredModelRef } from "/utils/ai-models";
import type { AppDetail } from "/types/app-config-types";
import type { Language } from "/types/i18n-types";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";
import { checkRateLimit } from "/utils/rate-limit.server";
import { getClientIP } from "/utils/request.server";

/**
 * Create a finished app from the first user prompt.
 * No empty draft row — the app appears in My Apps immediately (with icon).
 */
export default {
  async POST(req: BunRequest) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError({ code: "INVALID_JSON" });
    }

    const b = body as { message?: string; model?: string };
    const language = (getLang(req.url) ?? "en") as Language;
    const message = typeof b.message === "string" ? b.message.trim() : "";
    const modelKey = b.model == null || b.model === ""
      ? DEFAULT_EDIT_AI_MODEL
      : isEditAiModelKey(b.model)
        ? b.model
        : null;

    if (!modelKey) {
      return apiError({ code: "INVALID_MODEL", message: t("Invalid AI model.", language) });
    }
    if (!message || message.length > 2000) {
      return apiError({
        code: "INVALID_PROMPT",
        message: t("Describe the change you want.", language),
      });
    }

    // Guest session only after validation — avoids orphan cookies on bad input.
    return withAuthOrGuest(req, async (user) => {
      const clientIP = getClientIP(req);
      const generateLimit = user.isGuest ? 8 : 20;
      if (!checkRateLimit(clientIP, "app_generate", generateLimit, 60)) {
        return apiError({
          code: "RATE_LIMIT_EXCEEDED",
          message: t("Too many requests. Wait a moment before retrying.", language),
          status: 429,
        });
      }

      const model = resolveEditAiModel(modelKey);
      const aiStartedAt = Date.now();
      let generated;
      try {
        generated = await generateAppConfig(message, language, model);
      } catch (err) {
        const aiError = apiErrorFromAi(err, language);
        if (aiError) return aiError;
        throw err;
      }
      if (!generated) {
        return apiError({
          code: "GENERATION_FAILED",
          message: t("Could not create app. Try again.", language),
          status: 500,
        });
      }

      const durationMs = Date.now() - aiStartedAt;
      const storedModelRef = resolveStoredModelRef({
        requestedKey: modelKey,
        modelUsed: generated.modelUsed,
      });

      const id = crypto.randomUUID();
      const slug = dbGenerateAppSlug();
      dbCreateApp({
        id,
        ownerId: user.id,
        title: generated.config.title,
        description: generated.config.description,
        slug,
        configJson: JSON.stringify(generated.config),
        isDraft: false,
        category: generated.config.category ?? null,
        tagline: generated.config.tagline ?? null,
      });

      const iconResult = await generateAppIcon({
        title: generated.config.title,
        description: generated.config.description,
        clientIP,
      });
      if (iconResult) {
        dbUpdateApp(id, { iconId: iconResult.iconId });
      }

      let assistantReply = t("I built \"$title\" for you. Open the app or tell me what to change.", {
        title: generated.config.title,
      }, language);
      if (iconResult) {
        assistantReply = `${assistantReply}\n\n${t("I updated the app icon.", language)}`;
      }

      dbAddAppMessage({
        id: crypto.randomUUID(),
        appId: id,
        role: "user",
        content: message,
      });
      dbAddAppMessage({
        id: crypto.randomUUID(),
        appId: id,
        role: "assistant",
        content: assistantReply,
        modelKey: storedModelRef,
        costUsd: generated.costUsd,
        durationMs,
        iconModelKey: iconResult?.model ?? null,
        iconCostUsd: iconResult?.costUsd ?? null,
        iconDurationMs: iconResult?.durationMs ?? null,
        usage: [
          {
            tool: "generate",
            modelKey: generated.modelUsed,
            costUsd: generated.costUsd,
            durationMs,
            responseJson: generated.responseJson ?? undefined,
          },
          ...(iconResult
            ? [
                {
                  tool: "regenerateIcon" as const,
                  modelKey: iconResult.model,
                  costUsd: iconResult.costUsd,
                  durationMs: iconResult.durationMs,
                },
              ]
            : []),
        ],
      });

      const row = dbGetAppBySlug(slug)!;
      const detail: AppDetail = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        visibility: row.visibility,
        ownerId: row.owner_id,
        config: generated.config,
        canEdit: true,
        isDraft: false,
        iconId: row.icon_id ?? null,
        category: row.category ?? generated.config.category ?? null,
        tagline: row.tagline ?? generated.config.tagline ?? null,
      };

      return apiSuccess({
        data: {
          app: detail,
          messages: dbListAppMessages(id),
          user: {
            id: user.id,
            email: user.email,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            nickname: user.nickname ?? null,
            marketingOptIn: user.marketingOptIn === true,
            isGuest: user.isGuest === true,
          },
        },
        status: 201,
      });
    });
  },
};
