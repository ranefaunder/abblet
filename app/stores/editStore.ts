import { signal } from "@preact/signals";
import type { AppDetail, AppEditMessage } from "/types/app-config-types";
import { ssrContext } from "/utils/ssr.client";
import { apiFetch } from "/utils/api.client";
import { getLang } from "/utils/lang";
import { refreshOfflineAppCache } from "/app/stores/appStore";
import { isLoggedIn, openLoginDialog } from "/app/stores/userStore";

export type EditMode = "chat" | "code";

export const editApp = signal<AppDetail | null>(null);
export const editMessages = signal<AppEditMessage[]>([]);
export const editLoading = signal(false);
export const editSending = signal(false);
/** Live status while an edit request is streaming (intent progress + tool steps). */
export const editStatusText = signal<string | null>(null);
export const editStatusSteps = signal<string[]>([]);
export const editStatusIndex = signal(0);
export const editSavingCode = signal(false);
export const editError = signal<string | null>(null);
export const editMode = signal<EditMode>("chat");
export const codeDraft = signal<string>("");
export const editRegeneratingIcon = signal(false);
export const editPublishing = signal(false);
/** User AI wallet (EUR), refreshed after grant/debit. */
export const editCreditBalanceEur = signal<number | null>(null);

export async function refreshEditCredits(): Promise<void> {
  if (!isLoggedIn()) {
    editCreditBalanceEur.value = null;
    return;
  }
  try {
    const result = await apiFetch<{
      balanceEur: number;
      balanceUsdMicros: number;
      periodYm: string;
      freeGrantEur: number;
    }>(`/api/${lang()}/credits`);
    if (result.success && result.data) {
      editCreditBalanceEur.value = result.data.balanceEur;
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
  editSavingCode.value = false;
  editRegeneratingIcon.value = false;
  editPublishing.value = false;
  editStatusText.value = null;
  editStatusSteps.value = [];
  editStatusIndex.value = 0;
}

/** Seed from the SSR snapshot so a direct page load renders without a flash. */
export function initEditStore(): void {
  resetEditRequestFlags();
  const { initialApp } = ssrContext();
  if (initialApp && initialApp.canEdit) {
    editApp.value = initialApp;
    codeDraft.value = initialApp.config.code;
  } else {
    editApp.value = null;
    codeDraft.value = "";
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
    codeDraft.value = "";
    editMessages.value = [];
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
    codeDraft.value = appResult.data.app.config.code;

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

/** Clear editor state for a fresh /{lang}/edit (new app) session. */
export function startNewEdit(): void {
  editError.value = null;
  resetEditRequestFlags();
  editLoading.value = false;
  editApp.value = null;
  codeDraft.value = "";
  editMessages.value = [];
  editMode.value = "chat";
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
    editApp.value = result.data.app;
    editMessages.value = result.data.messages;
    codeDraft.value = result.data.app.config.code;
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
        editApp.value = body.data.app;
        codeDraft.value = body.data.app.config.code;
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
          data?: { app: AppDetail; messages: AppEditMessage[] };
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
          editApp.value = event.data.app;
          codeDraft.value = event.data.app.config.code;
          editMessages.value = event.data.messages;
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

export async function saveCode(slug: string): Promise<void> {
  if (editSavingCode.value) return;
  editError.value = null;
  editSavingCode.value = true;
  try {
    const result = await apiFetch<{ app: AppDetail }>(`/api/${lang()}/app/update-code`, {
      method: "POST",
      body: JSON.stringify({ slug, code: codeDraft.value }),
    });
    if (!result.success) {
      editError.value = result.error.message ?? result.error.code;
      return;
    }
    editApp.value = result.data.app;
    codeDraft.value = result.data.app.config.code;
    refreshOfflineAppCache(result.data.app);
  } finally {
    editSavingCode.value = false;
  }
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

/** Publish (or remove) the current app from Gallery. */
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

