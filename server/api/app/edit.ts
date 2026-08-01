import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError } from "/utils/api.server";
import { dbGetAppBySlug, dbUpdateApp } from "/server/database/queries/apps";
import { dbCommitAppVersion, resolveAppConfig } from "/server/database/queries/app-versions";
import { dbAddAppMessage, dbListAppMessages } from "/server/database/queries/app-messages";
import {
  addCost,
  classifyEditIntent,
  editAppConfig,
  generateAppConfig,
  updateAppMeta,
} from "/utils/ai-apps.server";
import { generateAppIcon } from "/utils/ai-app-icons.server";
import { apiErrorFromAi } from "/utils/ai-api.server";
import { resolveEditAiModel } from "/utils/ai-core.server";
import { assertHasCredits, debitOpenRouterUsage, sumOpenRouterCosts } from "/utils/credits.server";
import {
  DEFAULT_EDIT_AI_MODEL,
  resolveStoredModelRef,
  type EditAiModelKey,
} from "/utils/ai-models";
import {
  isDraftConfig,
  type AppConfig,
  type AppDetail,
  type AppEditToolUsage,
} from "/types/app-config-types";
import type { Language } from "/types/i18n-types";
import { getLang } from "/utils/lang";
import { t } from "/utils/i18n";
import { checkRateLimit } from "/utils/rate-limit.server";
import { getClientIP } from "/utils/request.server";

export type EditStreamEvent =
  | { type: "progress"; text: string; steps?: string[]; index?: number }
  | { type: "heartbeat" }
  | {
      type: "done";
      data: {
        app: AppDetail;
        messages: ReturnType<typeof dbListAppMessages>;
        nextPrompt?: string | null;
      };
    }
  | {
      type: "error";
      error: { code: string; message?: string };
      status?: number;
      /** Chat history including the failed turn (user + assistant error). */
      messages?: ReturnType<typeof dbListAppMessages>;
    };

type PersistCtx = { appId: string; userMessage: string; usage: AppEditToolUsage[] };

function toDetail(
  row: NonNullable<ReturnType<typeof dbGetAppBySlug>>,
  config: AppConfig,
): AppDetail {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    ownerId: row.owner_id,
    config: { ...config, title: row.title },
    canEdit: true,
    isDraft: row.is_draft === 1,
    iconId: row.icon_id ?? null,
    category: row.category ?? config.category ?? null,
    tagline: row.tagline ?? config.tagline ?? null,
    nextPrompt: row.next_prompt ?? null,
    latestVersionId: row.latest_version_id ?? null,
    publishedVersionId: row.published_version_id ?? null,
  };
}

const STREAM_HEARTBEAT_MS = 8_000;

function ndjsonResponse(run: (send: (event: EditStreamEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: EditStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), STREAM_HEARTBEAT_MS);
      try {
        await run(send);
      } catch (err) {
        console.error("Edit stream failed:", err);
        send({
          type: "error",
          error: { code: "GENERATION_FAILED", message: "Could not update app. Try again." },
          status: 500,
        });
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Persist the failed turn in chat history and stream it back as an assistant reply. */
function failEditTurn(
  send: (e: EditStreamEvent) => void,
  err: { code: string; message: string; status?: number },
  persist?: PersistCtx,
) {
  let messages: ReturnType<typeof dbListAppMessages> | undefined;
  if (persist) {
    try {
      dbAddAppMessage({
        id: crypto.randomUUID(),
        appId: persist.appId,
        role: "user",
        content: persist.userMessage,
      });
      dbAddAppMessage({
        id: crypto.randomUUID(),
        appId: persist.appId,
        role: "assistant",
        content: err.message,
        costUsd:
          persist.usage.reduce((sum, u) => addCost(sum, u.costUsd ?? null), null as number | null) ??
          null,
        durationMs: persist.usage.reduce((sum, u) => sum + (u.durationMs ?? 0), 0) || null,
        usage: persist.usage.length > 0 ? persist.usage : null,
      });
      messages = dbListAppMessages(persist.appId);
    } catch (e) {
      console.error("Failed to persist edit error turn:", e);
    }
  }
  send({
    type: "error",
    error: { code: err.code, message: err.message },
    status: err.status,
    ...(messages ? { messages } : {}),
  });
}

async function sendAiError(
  send: (e: EditStreamEvent) => void,
  res: Response,
  language: Language,
  persist?: PersistCtx,
) {
  let code = "GENERATION_FAILED";
  let message = t("Could not update app. Try again.", language);
  let status = 500;
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
      status?: number;
    };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
    status = body.status ?? res.status;
  } catch {
    // keep defaults
  }
  failEditTurn(send, { code, message, status }, persist);
}

async function runEditTurn(opts: {
  send: (e: EditStreamEvent) => void;
  row: NonNullable<ReturnType<typeof dbGetAppBySlug>>;
  current: AppConfig;
  creating: boolean;
  message: string;
  language: Language;
  model: string;
  modelKey: EditAiModelKey;
  clientIP: string;
  slug: string;
  usage: AppEditToolUsage[];
  persist: PersistCtx;
  userId: string;
}): Promise<void> {
  const {
    send,
    row,
    current,
    creating,
    message,
    language,
    model,
    modelKey,
    clientIP,
    slug,
    usage,
    persist,
    userId,
  } = opts;

  const fail = (code: string, msg: string, status = 500) =>
    failEditTurn(send, { code, message: msg, status }, persist);
  const failAi = (res: Response) => sendAiError(send, res, language, persist);

  let nextConfig: AppConfig = current;
  let assistantReply: string;
  let needsNewIcon = false;
  let costUsd: number | null = null;
  let modelUsed: string | null = null;
  let nextPrompt: string | null = null;
  const replyParts: string[] = [];

  if (creating) {
    const createSteps = [
      t("Building your app…", language),
      t("Designing the home-screen icon…", language),
    ];
    send({ type: "progress", text: createSteps[0]!, steps: createSteps, index: 0 });

    const started = Date.now();
    let generated;
    try {
      generated = await generateAppConfig(message, language, model);
    } catch (err) {
      const aiError = apiErrorFromAi(err, language);
      if (aiError) {
        await failAi(aiError);
        return;
      }
      throw err;
    }
    if (!generated) {
      fail("GENERATION_FAILED", t("Could not create app. Try again.", language));
      return;
    }
    nextConfig = generated.config;
    costUsd = generated.costUsd;
    modelUsed = generated.modelUsed;
    usage.push({
      tool: "generate",
      modelKey: generated.modelUsed,
      costUsd: generated.costUsd,
      durationMs: Date.now() - started,
      responseJson: generated.responseJson ?? undefined,
    });
    assistantReply = t("I built \"$title\" for you. Open the app or tell me what to change.", {
      title: generated.config.title,
    }, language);
    nextPrompt = t("Write what you want to change…", language);
    needsNewIcon = true;
    send({ type: "progress", text: createSteps[1]!, steps: createSteps, index: 1 });
  } else {
    send({ type: "progress", text: t("Figuring out what you need…", language) });

    const history = dbListAppMessages(row.id);
    const intentModel = resolveEditAiModel("gpt-mini");
    const intentStarted = Date.now();
    let intent;
    try {
      intent = await classifyEditIntent({
        current,
        history,
        instruction: message,
        language,
        model: intentModel,
      });
    } catch (err) {
      const aiError = apiErrorFromAi(err, language);
      if (aiError) {
        await failAi(aiError);
        return;
      }
      throw err;
    }
    if (!intent) {
      fail("GENERATION_FAILED", t("Could not update app. Try again.", language));
      return;
    }

    usage.push({
      tool: "intent",
      modelKey: intent.modelUsed,
      costUsd: intent.costUsd,
      durationMs: Date.now() - intentStarted,
      responseJson: intent.responseJson ?? undefined,
    });
    costUsd = intent.costUsd;
    modelUsed = intent.modelUsed;
    nextPrompt = intent.nextPrompt;
    const { tools, progress } = intent;

    const steps = progress.length > 0 ? progress : [t("Working on your app…", language)];
    let stepIndex = 0;
    const emitStep = (text?: string) => {
      const line = text ?? steps[Math.min(stepIndex, steps.length - 1)]!;
      send({ type: "progress", text: line, steps, index: Math.min(stepIndex, steps.length - 1) });
      stepIndex++;
    };
    emitStep();

    if (tools.includes("updateCode")) {
      emitStep();
      let result;
      try {
        result = await editAppConfig({
          current: nextConfig,
          history,
          instruction: message,
          language,
          model,
        });
      } catch (err) {
        const aiError = apiErrorFromAi(err, language);
        if (aiError) {
          await failAi(aiError);
          return;
        }
        throw err;
      }
      if (!result) {
        fail("GENERATION_FAILED", t("Could not update app. Try again.", language));
        return;
      }
      nextConfig = result.config;
      costUsd = addCost(costUsd, result.costUsd);
      modelUsed = result.modelUsed ?? modelUsed;
      for (const step of result.usageSteps) {
        usage.push({
          tool: step.tool,
          modelKey: step.modelUsed,
          costUsd: step.costUsd,
          durationMs: step.durationMs,
          responseJson: step.responseJson ?? undefined,
        });
      }
      replyParts.push(result.summary);
    }

    if (tools.includes("updateMeta")) {
      emitStep();
      const started = Date.now();
      let meta;
      try {
        meta = await updateAppMeta({
          current: nextConfig,
          instruction: message,
          language,
          model,
        });
      } catch (err) {
        const aiError = apiErrorFromAi(err, language);
        if (aiError) {
          await failAi(aiError);
          return;
        }
        throw err;
      }
      if (!meta) {
        fail("GENERATION_FAILED", t("Could not update app. Try again.", language));
        return;
      }
      nextConfig = {
        ...nextConfig,
        title: meta.title,
        description: meta.description,
        tagline: meta.tagline || undefined,
        category: meta.category as AppConfig["category"],
      };
      costUsd = addCost(costUsd, meta.costUsd);
      modelUsed = meta.modelUsed ?? modelUsed;
      usage.push({
        tool: "updateMeta",
        modelKey: meta.modelUsed,
        costUsd: meta.costUsd,
        durationMs: Date.now() - started,
        responseJson: meta.responseJson ?? undefined,
      });
      replyParts.push(meta.summary);
    }

    needsNewIcon = tools.includes("regenerateIcon") && Boolean(row.icon_id);
    if (needsNewIcon) emitStep();

    if (tools.length === 0) {
      assistantReply = intent.reply;
    } else if (replyParts.length > 0) {
      assistantReply = replyParts.join("\n\n");
    } else {
      assistantReply = intent.reply;
    }
  }

  const durationMs = usage.reduce((sum, u) => sum + (u.durationMs ?? 0), 0);
  const storedModelRef = resolveStoredModelRef({ requestedKey: modelKey, modelUsed });

  let iconId: string | null | undefined;
  let iconModelKey: string | null = null;
  let iconCostUsd: number | null = null;
  let iconDurationMs: number | null = null;
  if (needsNewIcon) {
    const iconResult = await generateAppIcon({
      title: nextConfig.title,
      description: nextConfig.description,
      clientIP,
    });
    if (iconResult) {
      iconId = iconResult.iconId;
      iconModelKey = iconResult.model;
      iconCostUsd = iconResult.costUsd;
      iconDurationMs = iconResult.durationMs;
      usage.push({
        tool: "regenerateIcon",
        modelKey: iconResult.model,
        costUsd: iconResult.costUsd,
        durationMs: iconResult.durationMs,
      });
      assistantReply = `${assistantReply}\n\n${t("I updated the app icon.", language)}`;
    } else {
      assistantReply = `${assistantReply}\n\n${t("I couldn't update the app icon right now. Try again in a moment.", language)}`;
    }
  }

  // Versioned: runnable content. Title + icon are fixed per owned app (remixes get new ones).
  const versionContentChanged =
    creating ||
    nextConfig.code !== current.code ||
    nextConfig.prompt !== current.prompt ||
    nextConfig.status !== current.status ||
    nextConfig.tagName !== current.tagName;

  const identityOrListingChanged =
    nextConfig.title !== row.title ||
    nextConfig.description !== row.description ||
    (nextConfig.tagline ?? null) !== (row.tagline ?? null) ||
    (nextConfig.category ?? null) !== (row.category ?? null) ||
    Boolean(iconId);

  // Title + icon are app-scoped (not versioned). Code/content edits insert a new version.
  if (versionContentChanged) {
    const changeSummary = creating
      ? t("Created the app", language)
      : replyParts
          .map((p) => p.trim())
          .filter(Boolean)
          .join(" ")
          .slice(0, 160) || message.trim().slice(0, 120);
    dbCommitAppVersion(
      row.id,
      { ...nextConfig, title: nextConfig.title },
      {
        fromVersionId: creating ? null : row.latest_version_id,
        summary: changeSummary,
      },
    );
  }

  if (versionContentChanged || identityOrListingChanged) {
    dbUpdateApp(row.id, {
      title: nextConfig.title,
      description: nextConfig.description,
      isDraft: creating ? false : undefined,
      category: nextConfig.category ?? null,
      tagline: nextConfig.tagline ?? null,
      ...(iconId ? { iconId } : {}),
      ...(nextPrompt?.trim() ? { nextPrompt: nextPrompt.trim() } : {}),
    });
  } else if (nextPrompt?.trim()) {
    dbUpdateApp(row.id, { nextPrompt: nextPrompt.trim() });
  }

  dbAddAppMessage({ id: crypto.randomUUID(), appId: row.id, role: "user", content: message });
  dbAddAppMessage({
    id: crypto.randomUUID(),
    appId: row.id,
    role: "assistant",
    content: assistantReply,
    modelKey: storedModelRef,
    costUsd,
    durationMs,
    iconModelKey,
    iconCostUsd,
    iconDurationMs,
    usage,
  });

  debitOpenRouterUsage({
    userId,
    costUsd: sumOpenRouterCosts(usage.map((u) => u.costUsd)),
    floorKind: "edit",
    reason: "ai_edit",
    meta: { appId: row.id, slug },
  });

  const updated = dbGetAppBySlug(slug)!;
  send({
    type: "done",
    data: {
      app: toDetail(updated, nextConfig),
      messages: dbListAppMessages(row.id),
      nextPrompt,
    },
  });
}

export default {
  async POST(req: BunRequest) {
    return withAuth(req, async (user) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ code: "INVALID_JSON" });
      }

      const b = body as { slug?: string; message?: string };
      const slug = typeof b.slug === "string" ? b.slug.trim() : "";
      const message = typeof b.message === "string" ? b.message.trim() : "";
      const language = (getLang(req.url) ?? "en") as Language;
      const modelKey = DEFAULT_EDIT_AI_MODEL;
      const model = resolveEditAiModel(modelKey);

      if (!slug) return apiError({ code: "SLUG_REQUIRED" });
      if (!message || message.length > 2000) {
        return apiError({
          code: "INVALID_PROMPT",
          message: t("Describe the change you want.", language),
        });
      }

      const row = dbGetAppBySlug(slug);
      if (!row) return apiError({ code: "NOT_FOUND", status: 404 });
      if (row.owner_id !== user.id) {
        return apiError({
          code: "FORBIDDEN",
          message: t("You can only edit your own apps.", language),
          status: 403,
        });
      }

      const current = resolveAppConfig(row, { asOwner: true });
      if (!current) {
        return apiError({ code: "APP_NOT_READY", status: 409 });
      }

      const clientIP = getClientIP(req);
      const creating = isDraftConfig(current);
      if (!checkRateLimit(clientIP, creating ? "app_generate" : "app_edit", creating ? 20 : 40, 60)) {
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

      return ndjsonResponse(async (send) => {
        const usage: AppEditToolUsage[] = [];
        const persist: PersistCtx = { appId: row.id, userMessage: message, usage };
        try {
          await runEditTurn({
            send,
            row,
            current,
            creating,
            message,
            language,
            model,
            modelKey,
            clientIP,
            slug,
            usage,
            persist,
            userId: user.id,
          });
        } catch (err) {
          console.error("Edit turn failed:", err);
          failEditTurn(
            send,
            {
              code: "GENERATION_FAILED",
              message: t("Could not update app. Try again.", language),
              status: 500,
            },
            persist,
          );
        }
      });
    });
  },
};
