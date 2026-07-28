import { html, css } from "/utils/markup";
import { h } from "preact";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation, useRoute } from "preact-iso";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { AppEditMessage, AppEditToolUsage } from "/types/app-config-types";
import { isDraftConfig } from "/types/app-config-types";
import { t } from "/utils/i18n";
import { highlightJavaScript } from "/utils/highlight-js";
import { appEditUrl, appPageUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { draftLetter, previewGradient } from "/utils/app-preview";
import { deleteApp } from "/app/stores/appStore";
import { isLoggedIn, openLoginDialog, requireLogin } from "/app/stores/userStore";
import {
  editApp,
  editMessages,
  editLoading,
  editSending,
  editStatusText,
  editStatusSteps,
  editStatusIndex,
  editSavingCode,
  editError,
  editMode,
  editRegeneratingIcon,
  codeDraft,
  loadEdit,
  startNewEdit,
  createAppFromPrompt,
  sendChatMessage,
  saveCode,
  regenerateIcon,
  editPublishing,
  setAppPublished,
  editCreditBalanceEur,
} from "/app/stores/editStore";
import { formatAiRequestStats } from "/utils/ai-models";

function toolUsageLabel(tool: AppEditToolUsage["tool"]): string {
  switch (tool) {
    case "intent":
      return t("Intent");
    case "updateCode":
      return t("Code");
    case "patchCode":
      return t("Patch");
    case "rename":
      return t("Name");
    case "regenerateIcon":
      return t("Icon");
    case "generate":
      return t("Build");
  }
}

const WELCOME_KEY =
  "Hey — I'm Rmix.\n\nI'll build an app from what you describe. For a good first version, tell me what it should do and how you'll use it — the clearer you are, the better the result.\n\nWhat should we make?";

/** New app: /:lang/edit — existing: /:lang/edit/:slug */
export const EditPath = "/:lang/edit" as const;
export const EditSlugPath = "/:lang/edit/:slug" as const;

type EditRouteProps =
  | RoutePropsForPath<typeof EditPath>
  | RoutePropsForPath<typeof EditSlugPath>;

export default function Edit(_props: EditRouteProps) {
  const { params } = useRoute();
  const { route } = useLocation();
  const lang = params.lang ?? "en";
  const slug = ("slug" in params ? params.slug : undefined) ?? "";
  const isNew = !slug;
  const deleting = useSignal(false);

  useEffect(() => {
    if (isNew) {
      if (!isLoggedIn()) {
        openLoginDialog();
      }
      startNewEdit();
      return;
    }
    void loadEdit(slug);
  }, [slug, isNew]);

  const app = editApp.value;
  const loading = editLoading.value;
  const creating = isNew || (app != null && isDraftConfig(app.config));
  const regeneratingIcon = editRegeneratingIcon.value;
  const publishing = editPublishing.value;
  const iconSrc = appIconSrc(app?.iconId);
  const isPublished = app?.visibility === "public";

  async function handleDelete() {
    if (!app || !slug || deleting.value) return;
    const ok = window.confirm(t("Delete \"$title\"? This cannot be undone.", { title: app.title }));
    if (!ok) return;
    deleting.value = true;
    const success = await deleteApp(slug);
    deleting.value = false;
    if (success) route(`/${lang}/`, true);
  }

  async function handlePublishToggle() {
    if (!app || !slug || creating || publishing) return;
    closeTopbarMenu();
    await setAppPublished(slug, !isPublished);
  }

  function closeTopbarMenu() {
    const menu = document.getElementById("edit-topbar-menu") as HTMLElement & {
      hidePopover?: () => void;
    } | null;
    try {
      menu?.hidePopover?.();
    } catch {
      // ignore
    }
  }

  const showTools = Boolean(app?.canEdit && slug);
  const showReadyTools = Boolean(app?.canEdit && !creating && slug);

  const view = html`
    <div data-scope="Edit" ui-column>
      <header class="top" ui-padding="inline-md block-md">
        <div class="top-row">
          <div class="top-start">
            <a
              href=${`/${lang}/`}
              ui-button="tertiary square sm"
              ui-icon="arrow-left"
              aria-label=${t("Back")}
            ></a>
          </div>

          <div class="top-center">
            <div class="top-title" ui-row="y-center gap-sm x-center">
              ${isNew
                ? html`
                  <h1 ui-heading="sm">${t("New App")}</h1>
                  <span class="badge">${t("Building")}</span>`
                : app
                  ? html`
                    ${iconSrc
                      ? html`<img class="app-chip-icon" src=${iconSrc} alt="" width="28" height="28" />`
                      : html`
                        <span
                          class="app-chip-fallback"
                          style=${`background: ${previewGradient(slug)}`}
                          aria-hidden="true"
                        >${draftLetter(app.title)}</span>`}
                    <div class="top-copy" ui-column>
                      <h1 ui-heading="sm">${app.title}</h1>
                      ${creating
                        ? html`<span class="top-meta">${t("Building")}</span>`
                        : isPublished
                        ? html`<span class="top-meta published">${t("In Store")}</span>`
                        : ""}
                    </div>`
                  : html`<h1 ui-heading="sm" class="muted">${t("Editor")}</h1>`}
            </div>
          </div>

          <div class="top-end">
            <div class="top-actions" ui-row="y-center gap-xs">
              ${app && !creating && slug
                ? html`
                  <a ui-button="sm" href=${appPageUrl(lang, slug)}>
                    ${t("Open")}
                  </a>`
                : ""}
              ${showTools
                ? html`
                  <div class="top-menu" ui-menu="bottom-left">
                    <button
                      type="button"
                      ui-button="tertiary square sm"
                      ui-icon="dots-three-vertical"
                      aria-label=${t("More")}
                      popovertarget="edit-topbar-menu"
                    ></button>
                    <div id="edit-topbar-menu" popover="auto" role="menu">
                      ${showReadyTools
                        ? html`
                          <button
                            type="button"
                            role="menuitem"
                            disabled=${publishing}
                            onClick=${() => {
                              if (!requireLogin()) {
                                closeTopbarMenu();
                                return;
                              }
                              void handlePublishToggle();
                            }}
                          >
                            <i ui-icon=${isPublished ? "prohibit" : "share"} aria-hidden="true"></i>
                            ${isPublished ? t("Remove from Store") : t("Publish to Store")}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick=${() => {
                              closeTopbarMenu();
                              editMode.value = editMode.value === "chat" ? "code" : "chat";
                            }}
                          >
                            <i
                              ui-icon=${editMode.value === "chat" ? "code" : "message-circle"}
                              aria-hidden="true"
                            ></i>
                            ${editMode.value === "chat" ? t("Show Code") : t("Show Chat")}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled=${regeneratingIcon}
                            onClick=${() => {
                              closeTopbarMenu();
                              void regenerateIcon(slug);
                            }}
                          >
                            <i ui-icon="image" aria-hidden="true"></i>
                            ${t("Generate new icon")}
                          </button>
                          <hr />`
                        : ""}
                      <button
                        type="button"
                        role="menuitem"
                        class="danger"
                        disabled=${deleting.value}
                        onClick=${() => {
                          closeTopbarMenu();
                          void handleDelete();
                        }}
                      >
                        <i ui-icon="trash" aria-hidden="true"></i>
                        ${t("Delete")}
                      </button>
                    </div>
                  </div>`
                : ""}
            </div>
          </div>
        </div>
      </header>

      ${isNew
        ? html`<${EditWorkspace} slug="" creating=${true} lang=${lang} />`
        : loading && !app
          ? html`
            <div class="state" ui-column="gap-md x-center y-center" ui-padding="xl">
              <i ui-icon="spinner lg"></i>
              <p>${t("Loading…")}</p>
            </div>`
          : !app
            ? html`
              <div class="state" ui-column="gap-md x-center y-center" ui-padding="xl">
                <p>${editError.value ?? t("App not found")}</p>
              </div>`
            : !app.canEdit
              ? html`
                <div class="state" ui-column="gap-md x-center y-center" ui-padding="xl">
                  <p ui-heading="sm">${t("You can only edit your own apps.")}</p>
                  <a href=${appPageUrl(lang, slug)} ui-button="primary">${t("Open app")}</a>
                </div>`
              : html`<${EditWorkspace} slug=${slug} creating=${creating} lang=${lang} />`}
    </div>
  `;

  return [view, style()];
}

function EditWorkspace({
  slug,
  creating,
  lang,
}: {
  slug: string;
  creating: boolean;
  lang: string;
}) {
  return html`
    <div class="workspace" ui-column>
      ${editError.value
        ? html`<div class="error-banner" role="alert" ui-margin="inline-md top-sm">${editError.value}</div>`
        : ""}
      ${creating || editMode.value === "chat"
        ? html`<${ChatPanel} slug=${slug} creating=${creating} lang=${lang} />`
        : html`<${CodePanel} slug=${slug} />`}
    </div>
  `;
}

function ChatPanel({
  slug,
  creating,
  lang,
}: {
  slug: string;
  creating: boolean;
  lang: string;
}) {
  const { route } = useLocation();
  // useSignal (not useState) so store signal updates still re-render this panel.
  const draft = useSignal("");
  const elapsedSec = useSignal(0);
  const inspectUsage = useSignal<AppEditToolUsage | null>(null);
  const copied = useSignal(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const jsonDialogRef = useRef<HTMLDialogElement>(null);
  const app = editApp.value;
  const isNew = !slug;
  const originalPrompt = app?.config.prompt?.trim() ?? "";
  const messages = editMessages.value;
  const sending = editSending.value;
  const statusText = editStatusText.value;
  const statusSteps = editStatusSteps.value;
  const statusIndex = editStatusIndex.value;
  const canSend = Boolean(draft.value.trim()) && !sending;

  const welcome: AppEditMessage = {
    id: "welcome",
    role: "assistant",
    content: t(WELCOME_KEY),
    createdAt: "",
  };

  const displayMessages: AppEditMessage[] =
    isNew && messages.length === 0
      ? [welcome]
      : messages.length > 0
        ? messages
        : originalPrompt
          ? [
              {
                id: "original-prompt",
                role: "user",
                content: originalPrompt,
                createdAt: "",
              },
            ]
          : [];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayMessages.length, sending, statusText, statusIndex]);

  useEffect(() => {
    if (!sending) inputRef.current?.focus();
  }, [sending]);

  // Running elapsed clock while the edit stream is in flight.
  useEffect(() => {
    if (!sending) {
      elapsedSec.value = 0;
      return;
    }
    const startedAt = Date.now();
    elapsedSec.value = 0;
    const id = window.setInterval(() => {
      elapsedSec.value = Math.floor((Date.now() - startedAt) / 1000);
    }, 250);
    return () => window.clearInterval(id);
  }, [sending]);

  useEffect(() => {
    const dialog = jsonDialogRef.current;
    if (!dialog) return;
    if (inspectUsage.value) {
      copied.value = false;
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [inspectUsage.value]);

  function formatElapsed(totalSec: number): string {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit(e: Event) {
    e.preventDefault();
    // Read from the DOM so a stale controlled value can't block the request.
    const text = (inputRef.current?.value ?? draft.value).trim();
    if (!text || editSending.value) return;
    draft.value = "";
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }

    if (isNew) {
      void createAppFromPrompt(text).then((newSlug) => {
        if (!newSlug) {
          draft.value = text;
          if (inputRef.current) inputRef.current.value = text;
          return;
        }
        route(appEditUrl(lang, newSlug), true);
      });
      return;
    }

    void sendChatMessage(slug, text).then((started) => {
      if (!started && text) {
        draft.value = text;
        if (inputRef.current) inputRef.current.value = text;
      }
    });
  }

  function openUsageJson(usage: AppEditToolUsage) {
    inspectUsage.value = usage;
  }

  function closeUsageJson() {
    inspectUsage.value = null;
  }

  async function copyUsageJson() {
    const json = inspectUsage.value?.responseJson;
    if (json === undefined || json === null) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      copied.value = true;
    } catch {
      /* ignore */
    }
  }

  const inspectLabel = inspectUsage.value ? toolUsageLabel(inspectUsage.value.tool) : "";
  const inspectJsonText =
    inspectUsage.value?.responseJson !== undefined && inspectUsage.value?.responseJson !== null
      ? JSON.stringify(inspectUsage.value.responseJson, null, 2)
      : null;

  return html`
    <div class="chat" ref=${listRef}>
      <div class="chat-inner" ui-column="gap-md">
        ${displayMessages.length === 0 && !sending
          ? html`
            <div class="chat-empty" ui-column="gap-sm x-center">
              <p ui-heading="sm">${creating ? t("Describe your app") : t("Describe a change")}</p>
              <p class="chat-empty-copy">
                ${creating
                  ? t("Tell Rmix what you need — it builds a working app in minutes.")
                  : t("Ask the AI to tweak your app — colors, features, wording, anything.")}
              </p>
            </div>`
          : displayMessages.map(
                (m, i) => {
                  const usageLines =
                    m.role === "assistant" && m.usage && m.usage.length > 0
                      ? m.usage
                          .map((u) => {
                            const stats = formatAiRequestStats({
                              modelKey: u.modelKey,
                              durationMs: u.durationMs,
                            });
                            return stats
                              ? { usage: u, label: toolUsageLabel(u.tool), stats }
                              : null;
                          })
                          .filter(
                            (line): line is { usage: AppEditToolUsage; label: string; stats: string } =>
                              line != null,
                          )
                      : [];
                  return html`
                  <div
                    class=${`msg ${m.role === "user" ? "user" : "assistant"}`}
                    style=${`--i: ${i}`}
                  >
                    ${m.id === "original-prompt"
                      ? html`<p class="msg-label">${t("Original prompt")}</p>`
                      : ""}
                    <div class="bubble">${m.content}</div>
                    ${usageLines.map(
                      (line) => html`
                        <button
                          type="button"
                          class="msg-stats"
                          title=${t("AI response")}
                          onClick=${() => openUsageJson(line.usage)}
                        >
                          ${line.label} · ${line.stats}
                        </button>
                      `,
                    )}
                  </div>`;
                },
              )}
          ${sending
            ? html`
              <div class="msg assistant">
                <div class="bubble status-bubble" aria-live="polite">
                  <div class="status-bar" aria-hidden="true">
                    <span class="status-bar-fill"></span>
                  </div>
                  <div class="status-headline-row">
                    <p class="status-headline" key=${statusText ?? "default"}>
                      ${statusText
                        ?? (creating ? t("AI is building your app.") : t("AI is updating your app…"))}
                    </p>
                    <span class="status-elapsed" aria-label=${t("Elapsed time")}>
                      ${formatElapsed(elapsedSec.value)}
                    </span>
                  </div>
                  ${statusSteps.length > 0
                    ? html`
                      <ul class="status-steps">
                        ${statusSteps.map(
                          (step, i) => html`
                            <li
                              class=${i < statusIndex
                                ? "done"
                                : i === statusIndex
                                  ? "active"
                                  : "pending"}
                            >
                              <span class="status-dot" aria-hidden="true"></span>
                              <span>${step}</span>
                            </li>
                          `,
                        )}
                      </ul>`
                    : html`
                      <div class="status-pulse" aria-hidden="true">
                        <span></span><span></span><span></span>
                      </div>`}
                </div>
              </div>`
            : ""}

        <form class="composer" ui-column="gap-xs" ui-padding="top-sm" onSubmit=${submit}>
          <div class="composer-shell" ui-column="gap-sm" ui-padding="sm">
            <textarea
              ref=${inputRef}
              class="composer-input"
              rows="1"
              placeholder=${creating ? t("Create an app for…") : t("e.g. add a dark mode toggle")}
              value=${draft.value}
              disabled=${sending}
              onInput=${(e: Event) => {
                draft.value = (e.target as HTMLTextAreaElement).value;
                resizeInput();
              }}
              onKeyDown=${(e: KeyboardEvent) => {
                if (e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
                  e.preventDefault();
                  if (canSend) (e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
                }
              }}
            ></textarea>
            <div ui-row="x-end y-center gap-sm">
              ${typeof editCreditBalanceEur.value === "number"
                ? html`
                  <span
                    class="composer-cost"
                    title=${t("AI credit")}
                  >
                    ${t("AI credit ≈ $amount", {
                      amount: `€${editCreditBalanceEur.value.toFixed(2)}`,
                    })}
                  </span>`
                : ""}
              <button
                type="submit"
                ui-button="primary square sm"
                ui-icon="arrow-up"
                disabled=${!canSend}
                aria-label=${creating ? t("Apply It") : t("Send")}
              ></button>
            </div>
          </div>
        </form>
      </div>

      <dialog
        class="json-dialog"
        ref=${jsonDialogRef}
        ui-dialog="md"
        closedby="any"
        onClose=${() => {
          inspectUsage.value = null;
        }}
      >
        <div ui-column="gap-md">
          <div ui-row="x-between y-center gap-sm">
            <h2 ui-heading="sm">${t("AI response")}${inspectLabel ? ` · ${inspectLabel}` : ""}</h2>
            <button
              type="button"
              ui-button="tertiary square sm"
              ui-icon="x"
              aria-label=${t("Close")}
              onClick=${closeUsageJson}
            ></button>
          </div>
          ${inspectJsonText
            ? html`<pre class="json-pre">${inspectJsonText}</pre>`
            : html`<p class="json-empty">${t("No response saved")}</p>`}
          <div ui-row="x-end gap-sm">
            ${inspectJsonText
              ? html`
                <button type="button" ui-button="sm" onClick=${() => void copyUsageJson()}>
                  ${copied.value ? t("Copied") : t("Copy")}
                </button>`
              : ""}
            <button type="button" ui-button="primary sm" onClick=${closeUsageJson}>
              ${t("Close")}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  `;
}

function CodePanel({ slug }: { slug: string }) {
  const saving = editSavingCode.value;
  const app = editApp.value;
  const dirty = app != null && codeDraft.value !== app.config.code;
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  function syncScroll() {
    const editor = editorRef.current;
    const highlight = highlightRef.current;
    if (!editor || !highlight) return;
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  }

  const highlighted = highlightJavaScript(codeDraft.value);

  return html`
    <div class="code" ui-column>
      <div class="code-bar" ui-row="x-between y-center gap-md" ui-padding="inline-md block-sm">
        <div ui-row="y-center gap-sm">
          <span class="code-label">${t("Code")}</span>
          ${dirty
            ? html`<span class="code-dirty">${t("Unsaved changes")}</span>`
            : html`<span class="code-clean">${t("Saved")}</span>`}
        </div>
        <div ui-row="gap-xs">
          <button
            type="button"
            ui-button="tertiary sm"
            disabled=${!dirty || saving}
            onClick=${() => app && (codeDraft.value = app.config.code)}
          >
            ${t("Revert")}
          </button>
          <button
            type="button"
            ui-button="primary sm"
            disabled=${!dirty || saving}
            aria-busy=${saving}
            onClick=${() => void saveCode(slug)}
          >
            ${saving ? t("Saving…") : t("Save")}
          </button>
        </div>
      </div>
      <div class="code-editor">
        <pre class="code-highlight" ref=${highlightRef} aria-hidden="true">
          ${h("code", { dangerouslySetInnerHTML: { __html: `${highlighted}\n` } })}
        </pre>
        <textarea
          ref=${editorRef}
          class="code-area"
          spellcheck="false"
          autocapitalize="off"
          autocorrect="off"
          value=${codeDraft.value}
          onInput=${(e: Event) => (codeDraft.value = (e.target as HTMLTextAreaElement).value)}
          onScroll=${syncScroll}
        ></textarea>
      </div>
    </div>
  `;
}

function style() {
  return css`
    @scope ([data-scope="Edit"]) to ([data-scope]) {
      & {
        height: 100dvh;
        max-height: 100dvh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--neutral-50);
        color: var(--neutral-900);
      }

      .top {
        flex: none;
        padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
        border-bottom: 1px solid var(--neutral-200);
        background: color-mix(in oklab, var(--neutral-50) 88%, var(--white));
        backdrop-filter: blur(12px);
        z-index: 2;
      }

      .top-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
      }

      .top-start {
        justify-self: start;
      }

      .top-center {
        justify-self: center;
        min-width: 0;
        text-align: center;
      }

      .top-title {
        min-width: 0;
        justify-content: center;
      }

      .top-copy {
        min-width: 0;
        gap: 0.05rem;
        align-items: center;
        text-align: center;
      }

      .top-copy h1,
      .top-title h1,
      .top-center h1 {
        margin: 0;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .top-title h1.muted {
        color: var(--neutral-500);
      }

      .top-end {
        justify-self: stretch;
        min-width: 0;
        display: flex;
        justify-content: flex-end;
      }

      .top-actions {
        flex: none;
        justify-content: flex-end;
      }

      .top-menu {
        flex: none;
      }

      .app-chip-icon,
      .app-chip-fallback {
        flex: none;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 0.45rem;
        object-fit: cover;
      }

      .app-chip-fallback {
        display: grid;
        place-items: center;
        color: white;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .top-meta {
        font-size: 0.625rem;
        font-weight: 650;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--neutral-500);
        line-height: 1.2;
      }

      .top-meta.published {
        color: #007aff;
      }

      .badge {
        flex: none;
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        background: var(--neutral-100);
        border: 1px solid var(--neutral-200);
        color: var(--neutral-600);
        font-size: 0.625rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      #edit-topbar-menu [role="menuitem"].danger {
        color: var(--danger, #c00);
      }

      .state {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        color: var(--neutral-600);
        text-align: center;
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }

      .workspace {
        flex: 1;
        min-height: 0;
        background: var(--neutral-50);
        overflow: hidden;
      }

      .error-banner {
        flex: none;
        width: min(100%, 36rem);
        margin: 0.75rem auto 0;
        padding: 0.625rem 0.875rem;
        border-radius: 0.75rem;
        background: oklch(from var(--danger, #ff3b30) l c h / 10%);
        color: var(--danger, #c00);
        font-size: 0.8125rem;
        line-height: 1.4;
      }

      .chat {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        background: var(--neutral-50);
      }

      .chat-inner {
        width: min(100%, 36rem);
        margin: 0 auto;
        padding: 1rem 1rem 0;
        box-sizing: border-box;
      }

      .chat-empty {
        text-align: center;
        max-width: 22rem;
        padding: 1.25rem 0.25rem 0.25rem;
        align-self: center;
      }

      .chat-empty-copy {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.5;
        color: var(--neutral-500);
      }

      .msg {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        max-width: min(100%, 34rem);
      }

      .msg.user { align-self: flex-end; align-items: flex-end; }
      .msg.assistant { align-self: flex-start; align-items: flex-start; }

      .msg-label {
        margin: 0;
        font-size: 0.6875rem;
        font-weight: 650;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .bubble {
        padding: 0.7rem 0.95rem;
        border-radius: 1.1rem;
        font-size: 0.9375rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .msg.user .bubble {
        background: var(--neutral-900);
        color: var(--white);
        border-bottom-right-radius: 0.3rem;
      }

      .msg-stats {
        margin: 0.35rem 0 0;
        padding: 0 0.15rem;
        border: 0;
        background: transparent;
        font: inherit;
        font-size: 0.6875rem;
        line-height: 1.3;
        color: var(--neutral-400);
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        text-align: left;
      }

      .msg-stats:hover,
      .msg-stats:focus-visible {
        color: var(--neutral-700);
        text-decoration: underline;
        outline: none;
      }

      .msg-stats-total {
        cursor: default;
        font-weight: 600;
        color: var(--neutral-500);
        text-decoration: none;
      }

      .msg-stats-total:hover,
      .msg-stats-total:focus-visible {
        color: var(--neutral-500);
        text-decoration: none;
      }

      .msg.assistant .msg-stats {
        text-align: left;
      }

      .msg.assistant .bubble {
        background: var(--white);
        color: var(--neutral-800);
        border: 1px solid var(--neutral-200);
        border-bottom-left-radius: 0.3rem;
      }

      .status-bubble {
        min-width: min(100%, 18rem);
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }

      .status-bar {
        height: 3px;
        border-radius: 999px;
        background: var(--neutral-100);
        overflow: hidden;
      }

      .status-bar-fill {
        display: block;
        height: 100%;
        width: 40%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          color-mix(in oklab, var(--primary-400) 70%, white),
          var(--primary-500, #3b82f6),
          color-mix(in oklab, var(--primary-400) 70%, white)
        );
        animation: status-bar-slide 1.35s ease-in-out infinite;
      }

      @keyframes status-bar-slide {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(320%); }
      }

      .status-headline {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 600;
        line-height: 1.35;
        color: var(--neutral-800);
        animation: status-fade 0.35s ease;
        flex: 1 1 auto;
        min-width: 0;
      }

      .status-headline-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .status-elapsed {
        flex: none;
        font-size: 0.8125rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
        color: var(--neutral-400);
      }

      @keyframes status-fade {
        from { opacity: 0.35; transform: translateY(2px); }
        to { opacity: 1; transform: none; }
      }

      .status-steps {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .status-steps li {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        font-size: 0.8125rem;
        line-height: 1.35;
        color: var(--neutral-400);
        transition: color 0.25s ease, opacity 0.25s ease;
      }

      .status-steps li.done {
        color: var(--neutral-500);
        opacity: 0.85;
      }

      .status-steps li.active {
        color: var(--neutral-800);
        font-weight: 600;
      }

      .status-steps li.pending {
        opacity: 0.55;
      }

      .status-dot {
        width: 0.45rem;
        height: 0.45rem;
        margin-top: 0.35rem;
        border-radius: 50%;
        flex: none;
        background: var(--neutral-300);
      }

      .status-steps li.done .status-dot {
        background: var(--success, #34c759);
      }

      .status-steps li.active .status-dot {
        background: var(--primary-500, #3b82f6);
        box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary-500, #3b82f6) 45%, transparent);
        animation: status-dot-pulse 1.1s ease-out infinite;
      }

      @keyframes status-dot-pulse {
        0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary-500, #3b82f6) 40%, transparent); }
        70% { box-shadow: 0 0 0 6px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
      }

      .status-pulse {
        display: flex;
        gap: 0.35rem;
        padding-top: 0.1rem;
      }

      .status-pulse span {
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: var(--neutral-300);
        animation: status-bounce 1s ease-in-out infinite;
      }

      .status-pulse span:nth-child(2) { animation-delay: 0.15s; }
      .status-pulse span:nth-child(3) { animation-delay: 0.3s; }

      @keyframes status-bounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
        40% { transform: translateY(-3px); opacity: 1; }
      }

      .composer {
        position: sticky;
        bottom: 0;
        z-index: 2;
        width: 100%;
        margin: 0;
        padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
        background: linear-gradient(
          to bottom,
          color-mix(in oklab, var(--neutral-50) 0%, transparent),
          var(--neutral-50) 28%
        );
      }

      .composer-shell {
        border-radius: 1rem;
        background: var(--white);
        border: 1px solid var(--neutral-200);
      }

      .composer-shell:focus-within {
        border-color: color-mix(in oklab, var(--primary-400) 55%, var(--neutral-300));
      }

      .composer-input {
        width: 100%;
        resize: none;
        border: none;
        background: transparent;
        padding: 0.2rem 0.15rem;
        font: inherit;
        font-size: 16px;
        line-height: 1.45;
        max-height: 10rem;
        field-sizing: content;
        min-height: 1.45em;
      }

      .composer-input:focus {
        outline: none;
      }

      .composer-input:disabled {
        opacity: 0.65;
      }

      .composer-cost {
        font-size: 0.6875rem;
        color: var(--neutral-400);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.01em;
        opacity: 0.85;
        white-space: nowrap;
      }

      .json-dialog {
        max-width: min(40rem, calc(100vw - 2rem));
        width: 100%;
      }

      .json-pre {
        margin: 0;
        max-height: min(50vh, 28rem);
        overflow: auto;
        padding: 0.75rem 0.875rem;
        border-radius: 0.625rem;
        background: #141414;
        color: #e8e8e8;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.75rem;
        line-height: 1.45;
        white-space: pre;
        tab-size: 2;
      }

      .json-empty {
        margin: 0;
        font-size: 0.875rem;
        color: var(--neutral-500);
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .code {
        flex: 1;
        min-height: 0;
        background: #141414;
      }

      .code-bar {
        flex: none;
        background: var(--white);
        border-bottom: 1px solid var(--neutral-200);
      }

      .code-label {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .code-dirty,
      .code-clean {
        font-size: 0.75rem;
        font-weight: 500;
      }

      .code-dirty { color: var(--warning, #b45309); }
      .code-clean { color: var(--neutral-400); }

      .code-editor {
        position: relative;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      .code-highlight,
      .code-area {
        position: absolute;
        inset: 0;
        margin: 0;
        padding: 1rem 1.1rem;
        font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace;
        font-size: 14px;
        line-height: 1.65;
        tab-size: 2;
        white-space: pre;
        overflow: auto;
        border: none;
      }

      .code-highlight {
        pointer-events: none;
        color: #d4d4d4;
        background: #141414;
      }

      .code-highlight > code {
        display: block;
        font: inherit;
        white-space: pre;
      }

      .code-area {
        resize: none;
        color: transparent;
        caret-color: #e8e8e8;
        background: transparent;
      }

      .code-area::selection {
        background: oklch(from var(--primary-400) l c h / 35%);
        color: transparent;
      }

      .code-area:focus {
        outline: none;
      }

      .code-highlight .hl-keyword { color: #c586c0; }
      .code-highlight .hl-string { color: #ce9178; }
      .code-highlight .hl-comment { color: #6a9955; font-style: italic; }
      .code-highlight .hl-number { color: #b5cea8; }
      .code-highlight .hl-function { color: #dcdcaa; }
      .code-highlight .hl-class { color: #4ec9b0; }
      .code-highlight .hl-builtin { color: #569cd6; }

      @media (min-width: 720px) {
        .top {
          width: min(100%, 36rem);
          margin-inline: auto;
        }
      }
    }
  `;
}
