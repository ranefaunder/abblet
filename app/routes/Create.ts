import { html, css } from "/utils/markup";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation, useRoute } from "preact-iso";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { AppEditMessage, AppEditToolUsage } from "/types/app-config-types";
import { isDraftConfig } from "/types/app-config-types";
import { t } from "/utils/i18n";
import { createUrl, openAppUrl, appsUrl, appOwnerPreviewUrl } from "/utils/app-url";
import { appIconSrc } from "/utils/app-icon";
import { deleteApp } from "/app/stores/appStore";
import { requireLogin } from "/app/stores/userStore";
import CodeViewDialog from "/app/components/CodeViewDialog";
import PublishDialog, { openPublishDialog } from "/app/components/PublishDialog";
import {
  editApp,
  editMessages,
  editLoading,
  editSending,
  editStatusText,
  editStatusSteps,
  editStatusIndex,
  editError,
  loadEdit,
  startNewEdit,
  createAppFromPrompt,
  sendChatMessage,
  retryLastChatMessage,
  editPublishing,
  setAppPublished,
  editCreditBalanceUsd,
  editSuggestedPrompt,
  editRetryPrompt,
  editVersions,
  editVersionsLoading,
  editRestoring,
  loadEditVersions,
  restoreAppVersion,
} from "/app/stores/editStore";
import { formatAiRequestStats, estimateEditCreditUsd, sumUsageCostUsd } from "/utils/ai-models";

function toolUsageLabel(tool: AppEditToolUsage["tool"]): string {
  switch (tool) {
    case "intent":
      return t("Intent");
    case "updateCode":
      return t("Code");
    case "patchCode":
      return t("Patch");
    case "updateMeta":
    case "rename":
      return t("Meta");
    case "regenerateIcon":
      return t("Icon");
    case "generate":
      return t("Build");
  }
}

const WELCOME_KEY =
  "Hey — I'm Remiix.\n\nI'll build an app from what you describe. For a good first version, tell me what it should do and how you'll use it — the clearer you are, the better the result.\n\nWhat should we make?";

/** New app: /:lang/create — existing: /:lang/create/:slug */
export const CreatePath = "/:lang/create" as const;
export const CreateSlugPath = "/:lang/create/:slug" as const;

type CreateRouteProps =
  | RoutePropsForPath<typeof CreatePath>
  | RoutePropsForPath<typeof CreateSlugPath>;

export default function Create(_props: CreateRouteProps) {
  const { params } = useRoute();
  const { route } = useLocation();
  const lang = params.lang ?? "en";
  const slug = ("slug" in params ? params.slug : undefined) ?? "";
  const isNew = !slug;
  const deleting = useSignal(false);

  useEffect(() => {
    if (isNew) {
      startNewEdit();
      return;
    }
    void loadEdit(slug);

    // Browser back from app runtime often restores this page from bfcache
    // without remounting — refresh so Update published matches the DB.
    const refreshIfIdle = () => {
      if (editSending.value) return;
      void loadEdit(slug);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refreshIfIdle();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfIdle();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, isNew]);

  const app = editApp.value;
  const loading = editLoading.value;
  const creating = isNew || (app != null && isDraftConfig(app.config));
  const publishing = editPublishing.value;
  const isPublished = app?.visibility === "public";
  const needsStoreUpdate =
    Boolean(isPublished) &&
    Boolean(app?.latestVersionId) &&
    Boolean(app?.publishedVersionId) &&
    app!.latestVersionId !== app!.publishedVersionId;
  const pageTitle = isNew
    ? t("Create")
    : app
      ? app.title
      : loading
        ? t("Create")
        : t("Editor");
  const pageLede = isNew
    ? t("Tell Remiix what you need — it builds a working app in minutes.")
    : creating
      ? t("Building")
      : (app?.tagline?.trim() ||
        app?.description?.trim() ||
        t("Ask the AI to tweak your app — colors, features, wording, anything."));

  async function handleDelete() {
    if (!app || !slug || deleting.value) return;
    const ok = window.confirm(t("Delete \"$title\"? This cannot be undone.", { title: app.title }));
    if (!ok) return;
    deleting.value = true;
    const success = await deleteApp(slug);
    deleting.value = false;
    if (success) route(appsUrl(lang), true);
  }

  async function handlePublishToggle() {
    if (!app || !slug || creating || publishing) return;
    await setAppPublished(slug, !isPublished);
  }

  function requestPublish() {
    if (!requireLogin()) return;
    openPublishDialog();
  }

  async function confirmPublish() {
    if (!app || !slug || creating || publishing || isPublished) return false;
    return setAppPublished(slug, true);
  }

  async function handleUpdateStore() {
    if (!app || !slug || creating || publishing || !needsStoreUpdate) return;
    if (!requireLogin()) return;
    await setAppPublished(slug, true);
  }

  function closeToolbarMenu() {
    const menu = document.getElementById("create-toolbar-menu") as HTMLElement & {
      hidePopover?: () => void;
    } | null;
    try {
      menu?.hidePopover?.();
    } catch {
      // ignore
    }
  }

  function openCodeDialog() {
    closeToolbarMenu();
    const dialog = document.getElementById("edit-code-dialog") as HTMLDialogElement | null;
    dialog?.showModal();
  }

  async function openHistoryDialog() {
    closeToolbarMenu();
    if (!slug) return;
    const dialog = document.getElementById("edit-history-dialog") as HTMLDialogElement | null;
    dialog?.showModal();
    await loadEditVersions(slug);
  }

  const showTools = Boolean(app?.canEdit && slug);
  const showReadyTools = Boolean(app?.canEdit && !creating && slug);
  /** Public Store URL when published snapshot is current; otherwise UUID latest preview. */
  const openHref =
    isPublished && !needsStoreUpdate && slug
      ? openAppUrl(lang, slug, { app })
      : app?.id
        ? appOwnerPreviewUrl(app)
        : openAppUrl(lang, slug, { app });
  const openIconSrc = appIconSrc(app?.iconId);

  const toolbar = showTools
    ? html`
      <nav class="toolbar" role="toolbar" aria-label=${t("Create")}>
        <div class="toolbar-inner">
          ${showReadyTools
            ? html`
              <div class="toolbar-cta">
                <a class="action" href=${openHref} ui-off>
                  ${openIconSrc
                    ? html`<img class="action-app-icon" src=${openIconSrc} alt="" width="22" height="22" decoding="async" />`
                    : html`<i ui-icon="arrow-square-out" aria-hidden="true"></i>`}
                  <span>${t("Open")}</span>
                </a>
                ${isPublished
                  ? needsStoreUpdate
                    ? html`
                      <button
                        type="button"
                        class="action"
                        ui-off
                        disabled=${publishing}
                        aria-busy=${publishing}
                        onClick=${() => void handleUpdateStore()}
                      >
                        <i ui-icon="arrows-clockwise" aria-hidden="true"></i>
                        <span>${t("Update published")}</span>
                      </button>`
                    : html`<span class="status-live">${t("In Store")}</span>`
                  : html`
                    <button
                      type="button"
                      class="action"
                      ui-off
                      disabled=${publishing}
                      aria-busy=${publishing}
                      onClick=${requestPublish}
                    >
                      <i ui-icon="upload-simple" aria-hidden="true"></i>
                      <span>${t("Publish")}</span>
                    </button>`}
              </div>`
            : html`<div class="toolbar-grow"></div>`}
          <button
            type="button"
            class="action-more"
            ui-off
            aria-label=${t("More")}
            popovertarget="create-toolbar-menu"
          >
            <i ui-icon="dots-three-vertical" aria-hidden="true"></i>
          </button>
          <div id="create-toolbar-menu" class="toolbar-menu" popover="auto" role="menu">
            ${showReadyTools
              ? html`
                <button type="button" role="menuitem" ui-off onClick=${openCodeDialog}>
                  ${t("Show Code")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  ui-off
                  onClick=${() => void openHistoryDialog()}
                >
                  ${t("History")}
                </button>
                ${isPublished
                  ? html`
                    <button
                      type="button"
                      role="menuitem"
                      ui-off
                      disabled=${publishing}
                      onClick=${() => {
                        if (!requireLogin()) {
                          closeToolbarMenu();
                          return;
                        }
                        closeToolbarMenu();
                        void handlePublishToggle();
                      }}
                    >
                      ${t("Unpublish")}
                    </button>`
                  : ""}
                <div class="toolbar-menu-sep" role="separator"></div>`
              : ""}
            <button
              type="button"
              role="menuitem"
              class="danger"
              ui-off
              disabled=${deleting.value}
              onClick=${() => {
                closeToolbarMenu();
                void handleDelete();
              }}
            >
              ${t("Delete")}
            </button>
          </div>
        </div>
      </nav>`
    : "";

  const view = html`
    <div data-scope="Create">
      ${toolbar}
      <div class="content" ui-column="gap-2xl" ui-padding="inline-md">
        <header class="page-head" ui-column="gap-sm">
          <h1 class="page-title">${pageTitle}</h1>
          <p class="page-lede">${pageLede}</p>
        </header>

        ${isNew
          ? html`<${CreateWorkspace} slug="" creating=${true} lang=${lang} />`
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
                    <a href=${openAppUrl(lang, slug, { app })} ui-button>${t("Open app")}</a>
                  </div>`
                : html`<${CreateWorkspace} slug=${slug} creating=${creating} lang=${lang} />`}
      </div>

      ${showReadyTools && app && !isDraftConfig(app.config)
        ? html`<${CodeViewDialog} id="edit-code-dialog" code=${app.config.code} />`
        : ""}
      ${showReadyTools
        ? html`<${PublishDialog} publishing=${publishing} onConfirm=${confirmPublish} />`
        : ""}
      ${showReadyTools ? html`<${HistoryDialog} slug=${slug} />` : ""}
    </div>
  `;

  return [view, style()];
}

function CreateWorkspace({
  slug,
  creating,
  lang,
}: {
  slug: string;
  creating: boolean;
  lang: string;
}) {
  return html`
    <div class="workspace" ui-column="gap-md">
      ${editError.value
        ? html`<div class="error-banner" role="alert">${editError.value}</div>`
        : ""}
      <${ChatPanel} slug=${slug} creating=${creating} lang=${lang} />
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
    // Document scroll — keep the latest turn in view.
    window.scrollTo({ top: document.documentElement.scrollHeight });
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
        route(createUrl(lang, newSlug), true);
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
    <div class="chat">
      <div class="chat-inner" ui-column="gap-md">
        ${displayMessages.length === 0 && !sending
          ? html`
            <div class="chat-empty" ui-column="gap-sm x-center">
              <p ui-heading="sm">${creating ? t("Describe your app") : t("Describe a change")}</p>
              <p class="chat-empty-copy">
                ${creating
                  ? t("Tell Remiix what you need — it builds a working app in minutes.")
                  : t("Ask the AI to tweak your app — colors, features, wording, anything.")}
              </p>
            </div>`
          : (() => {
              const lastAssistantIdx = displayMessages.reduce(
                (acc, msg, idx) =>
                  msg.role === "assistant" && msg.id !== "welcome" ? idx : acc,
                -1,
              );
              const canRetry = Boolean(editRetryPrompt.value) && !sending;
              return displayMessages.map((m, i) => {
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
                  const creditUsd = estimateEditCreditUsd(
                    sumUsageCostUsd(m.usage) ??
                      (typeof m.costUsd === "number" || typeof m.iconCostUsd === "number"
                        ? (m.costUsd ?? 0) + (m.iconCostUsd ?? 0)
                        : null),
                  );
                  const showInfo = usageLines.length > 0 || creditUsd != null;
                  const isLastAssistant = i === lastAssistantIdx;
                  const showRetry = canRetry && isLastAssistant && m.role === "assistant";
                  return html`
                  <div
                    class=${`msg ${m.role === "user" ? "user" : "assistant"}`}
                    style=${`--i: ${i}`}
                  >
                    ${m.id === "original-prompt"
                      ? html`<p class="msg-label">${t("Original prompt")}</p>`
                      : ""}
                    <div class=${`bubble${showInfo ? " has-info" : ""}${showRetry ? " has-open" : ""}`}>
                      <div class="bubble-body">${m.content}</div>
                      ${showRetry
                        ? html`
                          <div class="bubble-open" ui-row="gap-sm y-center wrap">
                            <button
                              type="button"
                              ui-button="sm"
                              disabled=${sending}
                              onClick=${() => {
                                if (!slug || sending) return;
                                void retryLastChatMessage(slug);
                              }}
                            >
                              ${t("Try again")}
                            </button>
                          </div>`
                        : ""}
                      ${showInfo
                        ? html`
                          <div class="msg-info" ui-menu="top-right">
                            <button
                              type="button"
                              class="msg-info-btn"
                              ui-off
                              ui-icon="info"
                              aria-label=${t("AI response")}
                              title=${t("AI response")}
                              popovertarget=${`msg-info-${m.id || i}`}
                            ></button>
                            <div
                              id=${`msg-info-${m.id || i}`}
                              class="msg-info-menu"
                              popover="auto"
                              role="menu"
                            >
                              ${usageLines.map(
                                (line) => html`
                                  <button
                                    type="button"
                                    role="menuitem"
                                    class="msg-info-item"
                                    onClick=${(e: Event) => {
                                      const menu = (e.currentTarget as HTMLElement).closest(
                                        "[popover]",
                                      ) as HTMLElement & { hidePopover?: () => void } | null;
                                      try {
                                        menu?.hidePopover?.();
                                      } catch {
                                        // ignore
                                      }
                                      openUsageJson(line.usage);
                                    }}
                                  >
                                    <span class="msg-info-tool">${line.label}</span>
                                    <span class="msg-info-stats">${line.stats}</span>
                                  </button>
                                `,
                              )}
                              ${creditUsd != null
                                ? html`
                                  <div class="msg-info-credit" role="note">
                                    <span class="msg-info-tool">${t("AI credit")}</span>
                                    <span class="msg-info-stats">
                                      ${t("This request ≈ $amount", {
                                        amount: `$${creditUsd.toFixed(2)}`,
                                      })}
                                    </span>
                                  </div>`
                                : ""}
                            </div>
                          </div>`
                        : ""}
                    </div>
                  </div>`;
                });
            })()}
          ${sending
            ? html`
              <div class="msg assistant build" aria-live="polite">
                <div class="bubble">
                  <div class="build-row">
                    <span class="build-dots" aria-hidden="true">
                      <i></i><i></i><i></i>
                    </span>
                    <span class="build-label">
                      ${statusText
                        ?? (creating ? t("Building your app…") : t("AI is updating your app…"))}
                    </span>
                    <span class="build-elapsed" aria-label=${t("Elapsed time")}>
                      ${formatElapsed(elapsedSec.value)}
                    </span>
                  </div>
                  <div class="build-bars" aria-hidden="true">
                    <span style="--w: 88%"></span>
                    <span style="--w: 64%"></span>
                    <span style="--w: 76%"></span>
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
                    : ""}
                </div>
              </div>`
            : ""}

        <form class="composer" onSubmit=${submit}>
          <div class="composer-shell">
            <textarea
              ref=${inputRef}
              class="composer-input"
              rows="2"
              placeholder=${creating
                ? t("Create an app for…")
                : (editSuggestedPrompt.value ?? t("Write what you want to change…"))}
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
            <div class="composer-bar" ui-row="x-between y-center gap-sm">
              ${typeof editCreditBalanceUsd.value === "number"
                ? html`
                  <span
                    class="composer-cost"
                    title=${t("AI credit")}
                  >
                    ${t("AI credit ≈ $amount", {
                      amount: `$${editCreditBalanceUsd.value.toFixed(2)}`,
                    })}
                  </span>`
                : html`<span class="composer-cost"></span>`}
              <button
                type="submit"
                ui-button="primary sm"
                disabled=${!canSend}
                aria-busy=${sending}
              >
                ${creating ? t("Apply It") : t("Ask Changes")}
              </button>
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

function HistoryDialog({ slug }: { slug: string }) {
  const versions = editVersions.value;
  const loading = editVersionsLoading.value;
  const restoring = editRestoring.value;

  return html`
    <dialog id="edit-history-dialog" ui-dialog="sm" closedby="any">
      <header ui-row="x-between y-center gap-md">
        <h2 ui-heading="lg">${t("History")}</h2>
        <button
          type="button"
          ui-button="inline"
          ui-icon="x"
          commandfor="edit-history-dialog"
          command="close"
          aria-label=${t("Close")}
        ></button>
      </header>
      <p>${t("Restore an earlier version of the app code. Name and icon stay the same.")}</p>
      ${loading
        ? html`<p>${t("Loading…")}</p>`
        : versions.length === 0
          ? html`<p>${t("No versions yet.")}</p>`
          : html`
            <ul ui-off ui-column="gap-sm">
              ${versions.map(
                (v) => html`
                  <li ui-row="x-between y-center gap-md" ui-padding="block-sm">
                    <div ui-column="gap-xs">
                      <strong>v${v.versionNumber}</strong>
                      <span class="history-meta">
                        ${new Date(v.createdAt).toLocaleString()}
                        ${v.isLatest ? ` · ${t("Latest")}` : ""}
                        ${v.isPublished ? ` · ${t("Published")}` : ""}
                      </span>
                      ${v.summary
                        ? html`<span class="history-prompt">${v.summary}</span>`
                        : ""}
                    </div>
                    ${v.isLatest
                      ? html`<span class="history-current">${t("Current")}</span>`
                      : html`
                        <button
                          type="button"
                          ui-button="sm"
                          disabled=${restoring}
                          aria-busy=${restoring ? "true" : undefined}
                          onClick=${() => void restoreAppVersion(slug, v.id).then((ok) => {
                            if (ok) {
                              const dialog = document.getElementById(
                                "edit-history-dialog",
                              ) as HTMLDialogElement | null;
                              dialog?.close();
                            }
                          })}
                        >
                          ${t("Restore")}
                        </button>`}
                  </li>
                `,
              )}
            </ul>`}
    </dialog>
  `;
}

function style() {
  return css`
    @scope ([data-scope="Create"]) to ([data-scope]) {
      & {
        color: var(--neutral-900);
      }

      .content {
        padding-top: 1.35rem;
        max-width: 48rem;
        margin-inline: auto;
        width: 100%;
        box-sizing: border-box;
      }

      .toolbar {
        position: sticky;
        top: env(safe-area-inset-top, 0px);
        z-index: 40;
        background: #0b0b0c;
        color: #fff;
      }

      .toolbar-inner {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        max-width: 48rem;
        margin-inline: auto;
        padding: 0.75rem 1rem;
        box-sizing: border-box;
      }

      .toolbar-grow {
        flex: 1;
      }

      .toolbar-cta {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.15rem;
        flex: 1 1 auto;
        min-width: 0;
      }

      .action {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.45rem;
        flex: none;
        min-height: 2.75rem;
        margin: 0;
        border: 0;
        border-radius: 0.75rem;
        padding: 0.5rem 0.7rem;
        background: transparent;
        color: rgba(255, 255, 255, 0.88);
        font: inherit;
        font-size: 0.9375rem;
        font-weight: 600;
        letter-spacing: -0.02em;
        line-height: 1;
        text-decoration: none;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: color 0.14s ease, background 0.14s ease;
      }

      .action:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }

      .action:active {
        background: rgba(255, 255, 255, 0.12);
      }

      .action:disabled {
        opacity: 0.4;
        pointer-events: none;
      }

      .action [ui-icon] {
        --ui-icon-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
        color: inherit;
        flex: none;
      }

      .action-app-icon {
        width: 1.35rem;
        height: 1.35rem;
        border-radius: 0.35rem;
        object-fit: cover;
        flex: none;
        background: rgba(255, 255, 255, 0.12);
      }

      .action span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .status-live {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin-inline: 0.15rem 0.25rem;
        padding: 0.35rem 0.65rem;
        border-radius: 999px;
        background: rgba(52, 199, 89, 0.14);
        color: #6ee7a0;
        font-size: 0.75rem;
        font-weight: 650;
        letter-spacing: -0.01em;
        white-space: nowrap;
      }

      .status-live::before {
        content: "";
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: #34c759;
        box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.22);
      }

      .action-more {
        appearance: none;
        anchor-name: --create-tb-more;
        flex: none;
        width: 2.75rem;
        height: 2.75rem;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.14s ease, color 0.14s ease;
      }

      .action-more:hover {
        background: rgba(255, 255, 255, 0.22);
        color: #fff;
      }

      .action-more [ui-icon] {
        --ui-icon-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
        color: inherit;
      }

      .toolbar-menu {
        margin: 0;
        min-width: 12.5rem;
        padding: 0.4rem;
        border: 0;
        border-radius: 1rem;
        background: #1c1c1e;
        color: #fff;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.08),
          0 18px 40px rgba(0, 0, 0, 0.45);
        position-anchor: --create-tb-more;
      }

      .toolbar-menu:popover-open {
        inset: auto;
        top: anchor(bottom);
        right: anchor(right);
        margin-top: 0.45rem;
      }

      .toolbar-menu [role="menuitem"] {
        appearance: none;
        display: flex;
        width: 100%;
        align-items: center;
        margin: 0;
        border: 0;
        border-radius: 0.75rem;
        background: transparent;
        color: rgba(255, 255, 255, 0.92);
        padding: 0.8rem 0.9rem;
        font: inherit;
        font-size: 0.9375rem;
        font-weight: 550;
        letter-spacing: -0.01em;
        text-align: left;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .toolbar-menu [role="menuitem"]:hover {
        background: rgba(255, 255, 255, 0.08);
      }

      .toolbar-menu [role="menuitem"]:disabled {
        opacity: 0.4;
        pointer-events: none;
      }

      .toolbar-menu [role="menuitem"].danger {
        color: #ff7b72;
      }

      .toolbar-menu [role="menuitem"].danger:hover {
        background: rgba(255, 59, 48, 0.12);
      }

      .toolbar-menu-sep {
        height: 1px;
        margin: 0.3rem 0.55rem;
        background: rgba(255, 255, 255, 0.1);
      }

      .page-head {
        align-items: flex-start;
      }

      .page-title {
        margin: 0;
        font-size: clamp(2.1rem, 6vw, 2.75rem);
        font-weight: 800;
        letter-spacing: -0.05em;
        line-height: 1;
        color: var(--neutral-950);
        overflow-wrap: anywhere;
      }

      .page-lede {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.4;
        color: var(--neutral-600);
      }

      .state {
        color: var(--neutral-600);
        text-align: center;
        padding-block: 3rem;
      }

      .workspace {
        min-width: 0;
      }

      .error-banner {
        padding: 0.625rem 0.875rem;
        border-radius: 0.75rem;
        background: oklch(from var(--danger, #ff3b30) l c h / 10%);
        color: var(--danger, #c00);
        font-size: 0.8125rem;
        line-height: 1.4;
      }

      .chat-inner {
        width: 100%;
        box-sizing: border-box;
      }

      .chat-empty {
        text-align: center;
        max-width: 22rem;
        padding: 0.25rem;
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
        gap: 0.55rem;
        max-width: min(100%, 34rem);
      }

      .msg.user {
        align-self: flex-end;
        align-items: flex-end;
        max-width: 92%;
      }

      .msg.assistant {
        align-self: flex-start;
        align-items: stretch;
        max-width: 88%;
      }

      .msg-label {
        margin: 0;
        font-size: 0.6875rem;
        font-weight: 650;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--neutral-500);
      }

      .bubble {
        padding: 0.7rem 0.9rem;
        border-radius: 1.05rem;
        font-size: 0.875rem;
        font-weight: 550;
        line-height: 1.4;
      }

      .bubble-body {
        white-space: pre-wrap;
        word-break: break-word;
      }

      .bubble.has-info {
        position: relative;
        padding-right: 1.85rem;
      }

      .bubble.has-open {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }

      .bubble-open {
        display: flex;
      }

      .msg.user .bubble {
        background: var(--neutral-950);
        color: var(--white);
        border-radius: 1.05rem 1.05rem 0.3rem 1.05rem;
        box-shadow: 0 8px 18px rgba(15, 20, 25, 0.18);
      }

      .msg.assistant .bubble {
        background: var(--white);
        color: var(--neutral-700);
        border: 1px solid var(--neutral-200);
        border-radius: 1.05rem 1.05rem 1.05rem 0.3rem;
        font-weight: 500;
      }

      .msg.build .bubble {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }

      .msg-info {
        position: absolute;
        top: 0.35rem;
        right: 0.35rem;
        z-index: 1;
      }

      .msg-info-btn {
        appearance: none;
        display: grid;
        place-items: center;
        width: 1.35rem;
        height: 1.35rem;
        min-height: 0;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: transparent;
        box-shadow: none;
        color: inherit;
        opacity: 0.45;
        cursor: pointer;
        line-height: 0;
        --ui-icon-size: 1rem;
      }

      .msg-info-btn::before {
        display: block;
        width: var(--ui-icon-size, 1rem);
        height: var(--ui-icon-size, 1rem);
        margin: 0;
        mask-image: var(--ui-icon, none);
        mask-position: center;
        mask-size: contain;
        mask-repeat: no-repeat;
        background-color: currentColor;
        content: "";
      }

      .msg-info-btn:hover,
      .msg-info-btn:focus-visible {
        opacity: 0.9;
        outline: none;
      }

      .msg-info-menu {
        min-width: 11.5rem;
        padding: 0.35rem;
        border-radius: 0.85rem;
        border: 1px solid var(--neutral-200);
        background: var(--white);
        box-shadow: 0 12px 28px rgba(15, 20, 25, 0.12);
        line-height: normal;
      }

      .msg-info-item {
        appearance: none;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.15rem;
        width: 100%;
        margin: 0;
        padding: 0.55rem 0.65rem;
        border: none;
        border-radius: 0.6rem;
        background: transparent;
        box-shadow: none;
        color: inherit;
        font: inherit;
        line-height: 1.35;
        text-align: left;
        cursor: pointer;
      }

      .msg-info-item:hover,
      .msg-info-item:focus-visible {
        background: var(--neutral-50);
        outline: none;
      }

      .msg-info-tool {
        font-size: 0.75rem;
        font-weight: 650;
        color: var(--neutral-900);
      }

      .msg-info-stats {
        font-size: 0.6875rem;
        color: var(--neutral-500);
        font-variant-numeric: tabular-nums;
      }

      .msg-info-credit {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.15rem;
        width: 100%;
        margin: 0;
        padding: 0.55rem 0.65rem;
        border-top: 1px solid var(--neutral-100);
        box-sizing: border-box;
      }

      .msg.build {
        gap: 0.55rem;
      }

      .build-row {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        font-size: 0.75rem;
        font-weight: 650;
        letter-spacing: 0.02em;
        color: var(--neutral-600);
      }

      .build-label {
        flex: 1 1 auto;
        min-width: 0;
      }

      .build-elapsed {
        flex: none;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
        color: var(--neutral-400);
      }

      .build-dots {
        display: inline-flex;
        gap: 0.22rem;
        flex: none;
      }

      .build-dots i {
        width: 0.35rem;
        height: 0.35rem;
        border-radius: 999px;
        background: var(--primary-500);
        animation: chat-build-dot 1.1s ease-in-out infinite;
      }

      .build-dots i:nth-child(2) {
        animation-delay: 0.15s;
      }

      .build-dots i:nth-child(3) {
        animation-delay: 0.3s;
      }

      .build-bars {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.15rem 0;
      }

      .build-bars span {
        display: block;
        height: 0.4rem;
        width: var(--w, 70%);
        border-radius: 999px;
        background: linear-gradient(
          90deg,
          var(--neutral-200),
          var(--primary-200),
          var(--neutral-200)
        );
        background-size: 200% 100%;
        animation: chat-build-shimmer 1.6s linear infinite;
      }

      @keyframes chat-build-dot {
        0%,
        80%,
        100% {
          opacity: 0.35;
          transform: translateY(0);
        }
        40% {
          opacity: 1;
          transform: translateY(-2px);
        }
      }

      @keyframes chat-build-shimmer {
        from {
          background-position: 100% 0;
        }
        to {
          background-position: -100% 0;
        }
      }

      .status-steps {
        list-style: none;
        margin: 0;
        padding: 0.15rem 0.15rem 0;
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

      @media (prefers-reduced-motion: reduce) {
        .build-dots i,
        .build-bars span,
        .status-steps li.active .status-dot {
          animation: none;
        }
      }

      .composer {
        width: 100%;
        margin: 0.5rem 0 0;
        padding: 0;
      }

      .composer-shell {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.85rem 0.95rem 0.8rem;
        border-radius: 1.15rem;
        background: var(--white);
        border: 1px solid var(--neutral-200);
      }

      .composer-shell:focus-within {
        border-color: color-mix(in oklab, var(--primary-400) 50%, var(--neutral-300));
      }

      .composer-input {
        width: 100%;
        resize: none;
        border: none;
        background: transparent;
        padding: 0.15rem 0.1rem;
        font: inherit;
        font-size: 1rem;
        line-height: 1.45;
        color: var(--neutral-900);
        max-height: 10rem;
        field-sizing: content;
        min-height: 2.9em;
      }

      .composer-input::placeholder {
        color: var(--neutral-400);
      }

      .composer-input:focus {
        outline: none;
      }

      .composer-input:disabled {
        opacity: 0.65;
      }

      .composer-bar {
        padding-top: 0.15rem;
        border-top: 1px solid var(--neutral-100);
      }

      .composer-cost {
        min-height: 1em;
        font-size: 0.75rem;
        color: var(--neutral-400);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.01em;
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

      .history-meta {
        font-size: 0.85rem;
        color: var(--neutral-500);
      }

      .history-prompt {
        font-size: 0.85rem;
        color: var(--neutral-600);
      }

      .history-current {
        font-size: 0.85rem;
        color: var(--neutral-500);
      }
    }
  `;
}
