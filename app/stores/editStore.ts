import { signal } from "@preact/signals";
import type { AppDetail, AppEditMessage } from "/types/app-config-types";
import { ssrContext } from "/utils/ssr.client";
import { apiFetch } from "/utils/api.client";
import { getLang } from "/utils/lang";
import { refreshOfflineAppCache } from "/app/stores/appStore";
import { isLoggedIn, openLoginDialog } from "/app/stores/userStore";

export const editApp = signal<AppDetail | null>(null);
export const editMessages = signal<AppEditMessage[]>([]);
export const editLoading = signal(false);
export const editSending = signal(false);
/** Live status while an edit request is streaming (intent progress + tool steps). */
export const editStatusText = signal<string | null>(null);
export const editStatusSteps = signal<string[]>([]);
export const editStatusIndex = signal(0);
export const editError = signal<string | null>(null);
export const editRegeneratingIcon = signal(false);
export const editPublishing = signal(false);
/** User AI wallet (USD), refreshed after grant/debit. */
export const editCreditBalanceUsd = signal<number | null>(null);
/** Intent AI's suggested next user message — used as composer placeholder. */
export const editSuggestedPrompt = signal<string | null>(null);
/** Last failed chat prompt — when set, the UI can offer Try again. */
export const editRetryPrompt = signal<string | null>(null);

export type AppVersionSummary = {
  id: string;
  versionNumber: number;
  status: string;
  prompt: string;
  createdAt: string;
  isLatest: boolean;
  isPublished: boolean;
};

export const editVersions = signal<AppVersionSummary[]>([]);
export const editVersionsLoading = signal(false);
export const editRestoring = signal(false);

export async function refreshEditCredits(): Promise<void> {
  if (!isLoggedIn()) {
    editCreditBalanceUsd.value = null;
    return;
  }
  try {
    const result = await apiFetch<{
      balanceUsd: number;
      balanceUsdMicros: number;
      periodYm: string;
      freeGrantUsd: number;
    }>(`/api/${lang()}/credits`);
    if (result.success && result.data) {
      editCreditBalanceUsd.value = result.data.balanceUsd;
    }
  } catch {
    // ignore — balance is non-critical UI
  }
}

function lang(): string {
  return getLang(window.location.pathname) ?? "en";
}

function resetEditRequestFlags(): void {
  editSending.value = false;
  editRegeneratingIcon.value = false;
  editPublishing.value = false;
  editStatusText.value = null;
  editStatusSteps.value = [];
  editStatusIndex.value = 0;
}

/** Seed from the SSR snapshot so a direct page load renders without a flash. */
export function initEditStore(): void {
  resetEditRequestFlags();
  editSuggestedPrompt.value = null;
  editRetryPrompt.value = null;
  const { initialApp } = ssrContext();
  if (initialApp && initialApp.canEdit) {
    editApp.value = initialApp;
    editSuggestedPrompt.value = initialApp.nextPrompt?.trim() || null;
  } else {
    editApp.value = null;
    editMessages.value = [];
  }
}

export async function loadEdit(slug: string): Promise<void> {
  editError.value = null;
  // Never leave a sticky "sending" lock from a previous SPA visit.
  resetEditRequestFlags();

  const alreadyLoaded = editApp.value?.slug === slug;
  if (!alreadyLoaded) {
    editApp.value = null;
    editMessages.value = [];
    editSuggestedPrompt.value = null;
    editRetryPrompt.value = null;
  }
  editLoading.value = !alreadyLoaded;

  const l = lang();
  try {
    const appResult = await apiFetch<{ app: AppDetail }>(
      `/api/${l}/app/get?slug=${encodeURIComponent(slug)}`,
    );
    if (!appResult.success) {
      editError.value = appResult.error.message ?? appResult.error.code;
      return;
    }
    editApp.value = appResult.data.app;
    editSuggestedPrompt.value = appResult.data.app.nextPrompt?.trim() || null;
    editRetryPrompt.value = null;

    if (appResult.data.app.canEdit) {
      const historyResult = await apiFetch<{ messages: AppEditMessage[] }>(
        `/api/${l}/app/edit-history?slug=${encodeURIComponent(slug)}`,
      );
      if (historyResult.success) {
        editMessages.value = historyResult.data.messages;
      }
    }
  } finally {
    editLoading.value = false;
  }
  void refreshEditCredits();
}

/** Clear editor state for a fresh /{lang}/create (new app) session. */
export function startNewEdit(): void {
  editError.value = null;
  resetEditRequestFlags();
  editLoading.value = false;
  editApp.value = null;
  editMessages.value = [];
  editSuggestedPrompt.value = null;
  editRetryPrompt.value = null;
  void refreshEditCredits();
}

/**
 * First-prompt create. On success fills the edit store and returns the new slug.
 * @returns slug, or null if blocked / failed (error in editError or thread).
 */
export async function createAppFromPrompt(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!isLoggedIn()) {
    openLoginDialog();
    return null;
  }
  if (editSending.value) return null;

  editError.value = null;
  editSending.value = true;
  editStatusText.value = null;
  editStatusSteps.value = [];
  editStatusIndex.value = 0;

  const optimistic: AppEditMessage = {
    id: `local-${Date.now()}`,
    role: "user",
    content: trimmed,
    createdAt: new Date().toISOString(),
  };
  editMessages.value = [...editMessages.value, optimistic];

  try {
    const result = await apiFetch<{
      app: AppDetail;
      messages: AppEditMessage[];
      nextPrompt?: string | null;
    }>(
      `/api/${lang()}/app/generate`,
      {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      },
    );
    if (!result.success) {
      if (result.status === 401) openLoginDialog();
      editError.value = result.error.message ?? result.error.code;
      editMessages.value = editMessages.value.filter((m) => m.id !== optimistic.id);
      return null;
    }
    if (typeof result.data.nextPrompt === "string" && result.data.nextPrompt.trim()) {
      editSuggestedPrompt.value = result.data.nextPrompt.trim();
      editApp.value = {
        ...result.data.app,
        nextPrompt: result.data.nextPrompt.trim(),
      };
    } else {
      editApp.value = result.data.app;
    }
    editMessages.value = result.data.messages;
    refreshOfflineAppCache(result.data.app);
    void refreshEditCredits();
    return result.data.app.slug;
  } catch (err) {
    console.error("Create app request failed:", err);
    editError.value = "Network request failed. Try again.";
    editMessages.value = editMessages.value.filter((m) => m.id !== optimistic.id);
    return null;
  } finally {
    editSending.value = false;
    editStatusText.value = null;
    editStatusSteps.value = [];
    editStatusIndex.value = 0;
  }
}

/** @returns false if another send is already in flight or text is empty. */
export async function sendChatMessage(slug: string, text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!isLoggedIn()) {
    openLoginDialog();
    return false;
  }
  if (editSending.value) return false;

  editError.value = null;
  editSending.value = true;
  editRetryPrompt.value = null;
  editStatusText.value = null;
  editStatusSteps.value = [];
  editStatusIndex.value = 0;

  // Optimistic: show the user's message immediately.
  const optimistic: AppEditMessage = {
    id: `local-${Date.now()}`,
    role: "user",
    content: trimmed,
    createdAt: new Date().toISOString(),
  };
  editMessages.value = [...editMessages.value, optimistic];

  const failAsAssistant = (errorText: string, messages?: AppEditMessage[]) => {
    // Never surface chat failures in the top banner — keep them in the thread.
    editError.value = null;
    editRetryPrompt.value = trimmed;
    if (messages && messages.length > 0) {
      editMessages.value = messages;
      return;
    }
    editMessages.value = [
      ...editMessages.value,
      {
        id: `local-err-${Date.now()}`,
        role: "assistant",
        content: errorText,
        createdAt: new Date().toISOString(),
      },
    ];
  };

  try {
    const res = await fetch(`/api/${lang()}/app/edit`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, message: trimmed }),
    });

    const contentType = res.headers.get("Content-Type") ?? "";
    if (!contentType.includes("ndjson")) {
      // Validation / auth errors still return normal JSON ApiResult.
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        failAsAssistant("Server returned invalid JSON");
        return true;
      }
      const body = json as {
        success?: boolean;
        error?: { message?: string; code?: string };
        data?: { app: AppDetail; messages: AppEditMessage[] };
      };
      if (!body.success) {
        const code = body.error?.code;
        const msg =
          body.error?.message ??
          (code === "UNAUTHORIZED"
            ? "Sign in to edit this app."
            : code === "FORBIDDEN"
              ? "You can only edit your own apps."
              : code) ??
          "Request failed";
        failAsAssistant(msg);
        return true;
      }
      if (body.data) {
        editRetryPrompt.value = null;
        editApp.value = body.data.app;
        editMessages.value = body.data.messages;
        refreshOfflineAppCache(body.data.app);
      }
      return true;
    }

    if (!res.body) {
      failAsAssistant("Empty response");
      return true;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let gotDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        let event: {
          type?: string;
          text?: string;
          steps?: string[];
          index?: number;
          data?: {
            app: AppDetail;
            messages: AppEditMessage[];
            nextPrompt?: string | null;
          };
          error?: { message?: string; code?: string };
          messages?: AppEditMessage[];
        };
        try {
          event = JSON.parse(trimmedLine) as typeof event;
        } catch {
          continue;
        }
        if (event.type === "progress") {
          if (Array.isArray(event.steps) && event.steps.length > 0) {
            editStatusSteps.value = event.steps;
          }
          if (typeof event.index === "number") {
            editStatusIndex.value = event.index;
          }
          if (typeof event.text === "string" && event.text.trim()) {
            editStatusText.value = event.text.trim();
          }
        } else if (event.type === "heartbeat") {
          // Keepalive only — ignore.
        } else if (event.type === "done" && event.data) {
          gotDone = true;
          editRetryPrompt.value = null;
          editApp.value = event.data.app;
          editMessages.value = event.data.messages;
          if (typeof event.data.nextPrompt === "string" && event.data.nextPrompt.trim()) {
            const prompt = event.data.nextPrompt.trim();
            editSuggestedPrompt.value = prompt;
            editApp.value = { ...event.data.app, nextPrompt: prompt };
          }
          refreshOfflineAppCache(event.data.app);
          void refreshEditCredits();
        } else if (event.type === "error") {
          failAsAssistant(
            event.error?.message ?? event.error?.code ?? "Request failed",
            event.messages,
          );
          return true;
        }
      }
    }

    if (!gotDone) {
      failAsAssistant("Incomplete response");
    }
    return true;
  } catch (err) {
    console.error("Edit chat request failed:", err);
    const timedOut =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    failAsAssistant(
      timedOut
        ? "Request timed out. Try a smaller change or retry."
        : "Network request failed. Try again.",
    );
    return true;
  } finally {
    editSending.value = false;
    editStatusText.value = null;
    editStatusSteps.value = [];
    editStatusIndex.value = 0;
  }
}

/** Retry the last failed chat turn (removes the failed turn from the UI first). */
export async function retryLastChatMessage(slug: string): Promise<boolean> {
  const prompt = editRetryPrompt.value?.trim();
  if (!prompt || editSending.value) return false;

  const msgs = editMessages.value;
  let cutAt = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.role === "user" && m.content === prompt) {
      cutAt = i;
      break;
    }
  }
  if (cutAt >= 0) {
    editMessages.value = msgs.slice(0, cutAt);
  } else if (msgs.at(-1)?.role === "assistant") {
    editMessages.value = msgs.slice(0, -1);
  }

  editRetryPrompt.value = null;
  return sendChatMessage(slug, prompt);
}

/** Regenerate the launcher icon on explicit user request. */
export async function regenerateIcon(slug: string): Promise<boolean> {
  if (editRegeneratingIcon.value) return false;
  editError.value = null;
  editRegeneratingIcon.value = true;
  try {
    const result = await apiFetch<{ app: AppDetail; messages: AppEditMessage[] }>(
      `/api/${lang()}/app/regenerate-icon`,
      {
        method: "POST",
        body: JSON.stringify({ slug }),
      },
    );
    if (!result.success) {
      editError.value = result.error.message ?? result.error.code;
      return false;
    }
    editApp.value = result.data.app;
    editMessages.value = result.data.messages;
    refreshOfflineAppCache(result.data.app);
    void refreshEditCredits();
    return true;
  } finally {
    editRegeneratingIcon.value = false;
  }
}

/** Publish (or remove) the current app from the Store. */
export async function setAppPublished(slug: string, publish: boolean): Promise<boolean> {
  if (editPublishing.value) return false;
  editError.value = null;
  editPublishing.value = true;
  try {
    const endpoint = publish ? "publish" : "unpublish";
    const result = await apiFetch<{ app: AppDetail }>(`/api/${lang()}/app/${endpoint}`, {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    if (!result.success) {
      editError.value = result.error.message ?? result.error.code;
      return false;
    }
    editApp.value = result.data.app;
    return true;
  } finally {
    editPublishing.value = false;
  }
}

export async function loadEditVersions(slug: string): Promise<void> {
  editVersionsLoading.value = true;
  try {
    const result = await apiFetch<{ versions: AppVersionSummary[] }>(
      `/api/${lang()}/app/versions?slug=${encodeURIComponent(slug)}`,
    );
    if (!result.success) {
      editError.value = result.error.message ?? result.error.code;
      return;
    }
    editVersions.value = result.data.versions;
  } finally {
    editVersionsLoading.value = false;
  }
}

/** Restore an old version as a new latest (immutable copy). Title/icon unchanged. */
export async function restoreAppVersion(slug: string, versionId: string): Promise<boolean> {
  if (editRestoring.value) return false;
  editError.value = null;
  editRestoring.value = true;
  try {
    const result = await apiFetch<{ app: AppDetail }>(`/api/${lang()}/app/restore`, {
      method: "POST",
      body: JSON.stringify({ slug, versionId }),
    });
    if (!result.success) {
      editError.value = result.error.message ?? result.error.code;
      return false;
    }
    editApp.value = result.data.app;
    refreshOfflineAppCache(result.data.app);
    await loadEditVersions(slug);
    return true;
  } finally {
    editRestoring.value = false;
  }
}

