import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { parseJson } from "/utils/json";

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; errorMessage: string; errorCode?: string; errorDetails?: unknown };

export const OPENROUTER_CONFIG = {
  url: "https://openrouter.ai/api/v1/chat/completions",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
};

function requireEnvModel(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set — add an OpenRouter model id to .env`);
  }
  return value;
}

/** Edit / create (OpenRouter id). Required: `AI_MODEL`. */
export function getPrimaryAiModel(): string {
  return requireEnvModel("AI_MODEL");
}

/**
 * Remiix.ai() in app runtimes.
 * `RUNTIME_AI_MODEL`, or falls back to `AI_MODEL`.
 */
export function getRuntimeAiModel(): string {
  return process.env.RUNTIME_AI_MODEL?.trim() || getPrimaryAiModel();
}

/**
 * Edit-intent router (classifyEditIntent).
 * `INTENTION_AI_MODEL`, or falls back to `AI_MODEL`.
 */
export function getIntentionAiModel(): string {
  return process.env.INTENTION_AI_MODEL?.trim() || getPrimaryAiModel();
}

/**
 * Home-screen icon design.
 * `ICON_AI_MODEL`, or falls back to `AI_MODEL`.
 */
export function getIconAiModel(): string {
  return process.env.ICON_AI_MODEL?.trim() || getPrimaryAiModel();
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

/** Chat message `content`: plain text or multimodal parts (OpenAI-compatible shape). */
export type AiChatMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export type AiChatMessage = { role: string; content: AiChatMessageContent };

/** `T` = Zod-skeeman output; ilman `schema`-kenttää käytä oletusta `unknown`. */
export type RequestJsonFromAiInput<T = unknown> = {
  systemPrompt: string;
  userPrompt: string;
  imageBase64?: string | null;
  schema?: z.ZodType<T>;
  /** OpenRouter model id; defaults to AI_MODEL. */
  model?: string;
};

export type RequestTextFromAiInput = {
  systemPrompt: string;
  userPrompt: string;
  imageBase64?: string | null;
  model?: string;
};

export type OpenRouterCompletion = {
  content: string;
  /** USD charged for this request (OpenRouter `usage.cost`), if present. */
  costUsd: number | null;
  /** OpenRouter model id that actually produced the reply. */
  model: string;
};

function parseOpenRouterCost(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const cost = (usage as { cost?: unknown }).cost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : null;
}

const OPENROUTER_TIMEOUT_MS = 240_000;

/** OpenRouter chat completion; returns assistant text + usage cost. */
async function fetchOpenRouterCompletionForModel(
  messages: AiChatMessage[],
  model: string,
): Promise<OpenRouterCompletion> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_CONFIG.url, {
      method: "POST",
      headers: OPENROUTER_CONFIG.headers,
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new AiRequestError("AI_TIMEOUT", "AI_TIMEOUT");
    }
    throw err;
  }

  if (!response.ok) {
    const errorMap: Record<number, string> = {
      429: "RATE_LIMIT_EXCEEDED",
      402: "INSUFFICIENT_CREDITS",
      403: "API_KEY_INVALID",
    };
    const code = errorMap[response.status] || `API_ERROR_${response.status}`;
    throw new AiRequestError(code, code);
  }

  const data = (await response.json()) as any;

  if (data?.error) {
    const msg = data.error.message?.toLowerCase?.() || "";
    if (msg.includes("rate limit") || msg.includes("too many requests")) {
      throw new AiRequestError("RATE_LIMIT_EXCEEDED", "RATE_LIMIT_EXCEEDED");
    }
    if (msg.includes("insufficient credits") || msg.includes("payment required")) {
      throw new AiRequestError("INSUFFICIENT_CREDITS", "INSUFFICIENT_CREDITS");
    }
    if (msg.includes("invalid api key") || msg.includes("unauthorized")) {
      throw new AiRequestError("API_KEY_INVALID", "API_KEY_INVALID");
    }
    throw new AiRequestError(`OPENROUTER_ERROR: ${data.error.message}`, "OPENROUTER_ERROR");
  }

  const raw = data?.choices?.[0]?.message?.content;
  let content = "";
  if (typeof raw === "string") content = raw;
  else if (Array.isArray(raw)) {
    for (const part of raw) {
      if (typeof part === "string") content += part;
      else if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        content += (part as { text: string }).text;
      }
    }
  } else if (raw && typeof raw === "object" && typeof (raw as { text?: unknown }).text === "string") {
    content = (raw as { text: string }).text;
  }
  if (!content) throw new AiRequestError("Invalid OpenRouter response", "INVALID_RESPONSE");
  const usedModel = typeof data?.model === "string" && data.model ? data.model : model;
  return { content, costUsd: parseOpenRouterCost(data?.usage), model: usedModel };
}

async function fetchOpenRouterCompletion(
  messages: AiChatMessage[],
  model?: string,
): Promise<OpenRouterCompletion> {
  return fetchOpenRouterCompletionForModel(messages, model ?? getPrimaryAiModel());
}

export type AiTextResult = {
  text: string;
  costUsd: number | null;
  model: string;
};

/**
 * Plain-text completion (no JSON parsing). Same transport as requestJsonFromAi.
 */
export async function requestTextFromAi(input: RequestTextFromAiInput): Promise<AiTextResult> {
  const { systemPrompt, userPrompt, imageBase64, model } = input;
  let userContent: AiChatMessageContent;
  if (imageBase64 != null && imageBase64 !== "") {
    const imgUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    userContent = [
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: imgUrl } },
    ];
  } else {
    userContent = userPrompt;
  }
  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
  const { content, costUsd, model: usedModel } = await fetchOpenRouterCompletion(messages, model);
  return { text: content.trim(), costUsd, model: usedModel };
}

export type AiJsonResult<T> = {
  data: T | null;
  costUsd: number | null;
  /** OpenRouter model id that actually produced the reply. */
  model: string | null;
  /** Parsed JSON object from the model (even when schema validation fails). */
  responseJson: unknown | null;
};

function appendJsonSchemaToSystemPrompt(systemPrompt: string, schema: z.ZodType<unknown>): string {
  try {
    const jsonSchema = z.toJSONSchema(schema);
    const schemaText = JSON.stringify(jsonSchema, null, 2);
    return `${systemPrompt}

You MUST respond with a single JSON object that matches this JSON Schema (property names, nesting, and types). Do not add extra top-level keys unless the schema allows optional/additional properties.

JSON Schema:
${schemaText}`;
  } catch {
    return `${systemPrompt}

You MUST respond with a single JSON object that passes the server's schema validation (structure must match what was agreed in the user message).`;
  }
}

/**
 * Calls AI chat completion and returns the first `{ ... }` JSON object from the output.
 *
 * Error handling keeps the error codes (RATE_LIMIT_EXCEEDED / INSUFFICIENT_CREDITS / API_KEY_INVALID)
 * compatible with existing callers that pattern-match on `errorMessage.includes(...)`.
 *
 * Geneerinen `T`: kun annat `schema`, `T` päätellään skeemasta ja palautus on `T | null`; ilman skeemaa `T` on `unknown`.
 *
 * Optional `schema`: embedded in the system message as JSON Schema (Zod → JSON Schema) and validated with `safeParse` after; returns validated data or `null` if invalid.
 * Without `schema`, returns parsed JSON. Network/API/JSON-parse errors throw.
 */
export async function requestJsonFromAi<T = unknown>(
  input: RequestJsonFromAiInput<T>,
): Promise<AiJsonResult<T>> {
  const { systemPrompt, userPrompt, imageBase64, schema, model } = input;
  const systemContent = schema ? appendJsonSchemaToSystemPrompt(systemPrompt, schema) : systemPrompt;
  let userContent: AiChatMessageContent;
  if (imageBase64 != null && imageBase64 !== "") {
    const imgUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    userContent = [
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: imgUrl } },
    ];
  } else {
    userContent = userPrompt;
  }
  const messages: AiChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];

  const { content, costUsd, model: usedModel } = await fetchOpenRouterCompletion(messages, model);

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { data: null, costUsd, model: usedModel, responseJson: null };
  const parsed = parseJson<unknown>(jsonrepair(jsonMatch[0]));
  if (parsed == null) return { data: null, costUsd, model: usedModel, responseJson: null };
  if (schema) {
    const result = schema.safeParse(parsed);
    return {
      data: result.success ? result.data : null,
      costUsd,
      model: usedModel,
      responseJson: parsed,
    };
  }
  return { data: parsed as T, costUsd, model: usedModel, responseJson: parsed };
}
