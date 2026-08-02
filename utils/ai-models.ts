/** Edit-chat model choices (client + server). */

export type EditAiModel = {
  key: string;
  openRouterId: string;
  /** Display name for the picker (no prices — users should not see provider costs). */
  label: string;
};

export const EDIT_AI_MODELS = [
  {
    key: "deepseek-flash",
    openRouterId: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
  },
  {
    key: "mimo",
    openRouterId: "xiaomi/mimo-v2.5",
    label: "Xiaomi MiMo-V2.5",
  },
  {
    key: "gemini-lite",
    openRouterId: "google/gemini-2.5-flash-lite",
    label: "Google Gemini 2.5 Flash Lite",
  },
  {
    key: "gemini-flash",
    openRouterId: "google/gemini-3-flash-preview",
    label: "Google Gemini 3 Flash Preview",
  },
  {
    key: "gpt-mini",
    openRouterId: "openai/gpt-5.4-mini",
    label: "OpenAI GPT-5.4 Mini",
  },
  {
    key: "gemini-pro",
    openRouterId: "google/gemini-3.1-pro-preview",
    label: "Google Gemini 3.1 Pro Preview",
  },
  {
    key: "sonnet",
    openRouterId: "anthropic/claude-sonnet-5",
    label: "Anthropic Claude Sonnet 5",
  },
  {
    key: "gpt",
    openRouterId: "openai/gpt-5.5",
    label: "OpenAI GPT-5.5",
  },
  {
    key: "opus",
    openRouterId: "anthropic/claude-opus-4.8",
    label: "Anthropic Claude Opus 4.8",
  },
  {
    key: "fable",
    openRouterId: "anthropic/claude-fable-5",
    label: "Anthropic Claude Fable 5",
  },
] as const;

export type EditAiModelKey = (typeof EDIT_AI_MODELS)[number]["key"];

export const DEFAULT_EDIT_AI_MODEL: EditAiModelKey = "deepseek-flash";

const EDIT_AI_MODEL_BY_KEY = Object.fromEntries(
  EDIT_AI_MODELS.map((m) => [m.key, m]),
) as Record<EditAiModelKey, (typeof EDIT_AI_MODELS)[number]>;

export function isEditAiModelKey(value: unknown): value is EditAiModelKey {
  return typeof value === "string" && value in EDIT_AI_MODEL_BY_KEY;
}

export function getEditAiModel(key: EditAiModelKey): (typeof EDIT_AI_MODELS)[number] {
  return EDIT_AI_MODEL_BY_KEY[key];
}

/** Format request duration for subtle UI display. */
export function formatAiDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  return `${Math.round(seconds)} s`;
}

/** Resolve picker key or OpenRouter id → short display name. */
export function formatAiModelName(modelRef: string): string {
  if (isEditAiModelKey(modelRef)) {
    return getEditAiModel(modelRef).label;
  }
  const byOpenRouterId = EDIT_AI_MODELS.find((m) => m.openRouterId === modelRef);
  if (byOpenRouterId) return byOpenRouterId.label;
  // Fallback: strip provider prefix from raw id
  const slash = modelRef.lastIndexOf("/");
  return slash >= 0 ? modelRef.slice(slash + 1) : modelRef;
}

/** Prefer storing the OpenRouter id that actually answered (handles credit fallback). */
export function resolveStoredModelRef(opts: {
  requestedKey: EditAiModelKey;
  modelUsed?: string | null;
}): string {
  if (opts.modelUsed) return opts.modelUsed;
  return opts.requestedKey;
}

/** e.g. "DeepSeek V4 Flash · 116 s" — never includes provider dollar costs. */
export function formatAiRequestStats(opts: {
  modelKey?: string | null;
  durationMs?: number | null;
}): string | null {
  const parts = [
    opts.modelKey ? formatAiModelName(opts.modelKey) : null,
    typeof opts.durationMs === "number" ? formatAiDurationMs(opts.durationMs) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Approximate billed AI credit in USD for an edit turn (OpenRouter USD × markup).
 * Defaults match utils/credits.server.ts so the info popup stays in the same units as the wallet.
 */
export function estimateEditCreditUsd(costUsd: number | null | undefined): number | null {
  if (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd < 0) return null;
  const markup = 5;
  const floorUsd = 0.01;
  const openrouterUsd = costUsd > 0 ? costUsd : floorUsd;
  return openrouterUsd * markup;
}

export function sumUsageCostUsd(
  usage: Array<{ costUsd?: number | null }> | null | undefined,
): number | null {
  if (!usage || usage.length === 0) return null;
  let sum = 0;
  let any = false;
  for (const u of usage) {
    if (typeof u.costUsd === "number" && Number.isFinite(u.costUsd)) {
      sum += u.costUsd;
      any = true;
    }
  }
  return any ? sum : null;
}
