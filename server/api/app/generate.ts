import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbCreateApp, dbGenerateAppSlug, dbGetAppBySlug, dbUpdateApp } from "/server/database/queries/apps";
import { dbAddAppMessage, dbListAppMessages } from "/server/database/queries/app-messages";
import { generateAppConfig } from "/utils/ai-apps.server";
import { generateAppIcon } from "/utils/ai-app-icons.server";
import { apiErrorFromAi } from "/utils/ai-api.server";
import { resolveEditAiModel } from "/utils/ai-core.server";
import { assertHasCredits, debitOpenRouterUsage, sumOpenRouterCosts } from "/utils/credits.server";
import { DEFAULT_EDIT_AI_MODEL, resolveStoredModelRef } from "/utils/ai-models";
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

    const b = body as { message?: string };
    const language = (getLang(req.url) ?? "en") as Language;
    const message = typeof b.message === "string" ? b.message.trim() : "";
    const modelKey = DEFAULT_EDIT_AI_MODEL;

    if (!message || message.length > 2000) {
      return apiError({
        code: "INVALID_PROMPT",
        message: t("Describe the change you want.", language),
      });
    }

    return withAuth(req, async (user) => {
      const clientIP = getClientIP(req);
      if (!checkRateLimit(clientIP, "app_generate", 20, 60)) {
        return apiError({
          code: "RATE_LIMIT_EXCEEDED",
          message: t("Too many requests. Wait a moment before retrying.", language),
          status: 429,
        });
      }

      try {
        assertHasCredits(user.id);
      } catch (err) {
        const aiError = apiErrorFromAi(err, language);
        if (aiError) return aiError;
        throw err;
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
        config: generated.config,
        isDraft: false,
        category: generated.config.category ?? null,
        tagline: generated.config.tagline ?? null,
        summary: t("Created the app", language),
      });

      const iconResult = await generateAppIcon({
        title: generated.config.title,
        description: generated.config.description,
        clientIP,
      });
      if (iconResult) {
        dbUpdateApp(id, { iconId: iconResult.iconId });
      }

      debitOpenRouterUsage({
        userId: user.id,
        costUsd: sumOpenRouterCosts([generated.costUsd, iconResult?.costUsd]),
        floorKind: "edit",
        reason: "ai_generate",
        meta: { appId: id, slug },
      });

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

      const defaultNext = t("Write what you want to change…", language);
      dbUpdateApp(id, { nextPrompt: defaultNext });

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
        nextPrompt: row.next_prompt ?? defaultNext,
      };

      return apiSuccess({
        data: {
          app: detail,
          messages: dbListAppMessages(id),
          nextPrompt: defaultNext,
        },
      });
    });
  },
};
