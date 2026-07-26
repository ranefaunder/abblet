import { z } from "zod";
import { requestJsonFromAi } from "/utils/ai-core.server";
import { applyReplacements } from "/utils/code-patch.server";
import { appConfigSchema, type AppConfig, type AppEditMessage } from "/types/app-config-types";
import type { Language } from "/types/i18n-types";
import { AVAILABLE_LANGUAGES } from "/i18n/languages";
import { APP_CATEGORIES, normalizeAppCategory } from "/utils/app-categories";

/** Home-screen label hard limit (must fit under the icon). */
export const APP_TITLE_MAX_LENGTH = 12;
/** Gallery tagline hard limit. */
export const APP_TAGLINE_MAX_LENGTH = 40;

function clampAppTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  if (!trimmed) return "App";
  return trimmed.length <= APP_TITLE_MAX_LENGTH
    ? trimmed
    : trimmed.slice(0, APP_TITLE_MAX_LENGTH).trimEnd() || "App";
}

function clampTagline(tagline: string): string {
  const trimmed = tagline.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length <= APP_TAGLINE_MAX_LENGTH
    ? trimmed
    : trimmed.slice(0, APP_TAGLINE_MAX_LENGTH).trimEnd();
}

/** Accept a slightly longer AI title, then clamp — so over-long replies don't fail generation. */
const aiTitleSchema = z.string().min(1).max(80).transform((t) => clampAppTitle(t));
const aiTaglineSchema = z.string().min(1).max(80).transform((t) => clampTagline(t));
const aiCategorySchema = z.enum(APP_CATEGORIES).or(z.string()).transform((c) => normalizeAppCategory(c));

const aiAppSchema = appConfigSchema
  .omit({ version: true, status: true, prompt: true, emoji: true, category: true, tagline: true })
  .extend({
    title: aiTitleSchema,
    tagline: aiTaglineSchema,
    category: aiCategorySchema,
  });

/** Tools the edit orchestrator can run after intent classification. */
export const EDIT_TOOLS = ["updateCode", "rename", "regenerateIcon"] as const;
export type EditTool = (typeof EDIT_TOOLS)[number];

const editIntentSchema = z.object({
  /** Which tools to run. Empty = reply only (question, thanks, unclear, etc.). */
  tools: z.array(z.enum(EDIT_TOOLS)).max(3),
  /** Chat reply in the user's language. Used when tools is empty; otherwise a short preamble is fine. */
  reply: z.string().min(1),
  /**
   * Short present-tense status lines in the user's language for the loading UI
   * while tools run (e.g. "Updating the list layout…"). 1–5 lines, concrete.
   */
  progress: z.array(z.string().min(1).max(120)).min(1).max(5),
});

const aiRenameSchema = z.object({
  summary: z.string().min(1),
  title: aiTitleSchema,
  description: z.string().min(1).max(500),
  tagline: aiTaglineSchema,
  category: aiCategorySchema,
});

const codeReplacementSchema = z.object({
  /** Exact substring to find in the current source (must be unique unless replaceAll). */
  old: z.string().min(1),
  /** Replacement text (empty string deletes the match). */
  new: z.string(),
  /** Replace every occurrence of old (default: exactly one match required). */
  replaceAll: z.boolean().optional(),
});

/** Model chooses patch (search-replace) or full file rewrite. */
const aiEditSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("patch"),
    summary: z.string().min(1),
    replacements: z.array(codeReplacementSchema).min(1).max(20),
  }),
  z.object({
    mode: z.literal("full"),
    summary: z.string().min(1),
    code: z.string().min(1),
  }),
]);

/** Full rewrite only (used for forceFull / patch fallback). */
const aiEditFullSchema = z.object({
  summary: z.string().min(1),
  code: z.string().min(1),
});

export function addCost(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Shared design + architecture guidelines used by both create and edit flows. */
function designGuidelines(langName: string): string {
  return `## Architecture (required)

Structure the component class with clear separation of concerns:
- constructor: attachShadow, define static shell markup (layout regions that rarely change)
- connectedCallback: load persisted state, bind event listeners ONCE, render initial UI
- disconnectedCallback: remove listeners if you attached any to document/window
- Private methods: #loadState(), #saveState(), #renderAll(), #renderList(), #renderStats(), etc.

Keep mutable app state in a plain object on the instance (this._state = { items: [], draft: "", filter: "" }).
Never store UI-only transient state in localStorage (focus, scroll, hover).

## Rendering rules (critical — follow strictly)

BAD (never do this on input/change events):
- shadowRoot.innerHTML = \`...\` for the entire UI on every keystroke
- Re-running connectedCallback logic or re-binding all listeners on each edit
- Replacing <input>/<textarea> elements while the user is typing

GOOD (required pattern):
1. Build a stable shell once: header, form area, list container, footer/stats as separate elements with ids or refs (this._els = {}).
2. Attach input listeners once. On input/change, update this._state and call ONLY the small updater for the affected region (e.g. #renderList(), #updateCounter()).
3. For text inputs: read value from event.target, update state, do NOT re-create that input. Update other parts of the UI surgically.
4. If you must re-render a section that contains inputs, first save focus:
   - const el = this.shadowRoot.activeElement; const id = el?.id; const start = el?.selectionStart; const end = el?.selectionEnd;
   - re-render the section
   - restore: getElementById(id)?.focus(); set selection range if applicable
5. Prefer updating textContent / classList / hidden on existing nodes over rebuilding DOM trees.
6. Use event delegation on stable parents (click, submit) instead of per-item listeners recreated on every render.

The app must feel instant and stable while typing — no cursor jumps, no lost focus, no flicker.

## Code rules for "code"

- Must call customElements.define("<tagName>", class extends HTMLElement { ... }) with the exact tagName you chose.
- Vanilla JavaScript only. NO imports, NO external libraries, NO CDN links.
- Network: do NOT use fetch, XMLHttpRequest, WebSocket, or any direct HTTP. The ONLY allowed network APIs are the host-injected global Abblet SDK:
  - await Abblet.ai({ prompt: "…" }) — optional system: await Abblet.ai({ prompt: "…", system: "…" })
  - Abblet.connect() — links the user session (redirect); call only when needed
  - Abblet.getToken() — optional; usually unnecessary because Abblet.ai handles connect
  Use Abblet.ai ONLY when the user's idea needs AI (summarize, rewrite, classify, generate text). Most apps need zero AI.
  Example:
  \`\`\`
  btn.addEventListener("click", async () => {
    btn.setAttribute("aria-busy", "true");
    try {
      const text = await Abblet.ai({ prompt: input.value.trim() });
      out.textContent = text;
    } catch (e) {
      if (e && (e.code === "CONNECT_REQUIRED" || e.code === "CONNECT_CANCELLED")) return;
      out.textContent = "Something went wrong. Try again.";
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });
  \`\`\`
  Never alert(). Never send entire localStorage dumps as the prompt — only the text the user needs processed.
- Use Shadow DOM (this.attachShadow({ mode: "open" })) and put ALL markup and CSS inside the shadow root so styles never leak.
- The component is fully interactive and complete: it builds its own UI, handles input, and renders results.
- Persist structured app state (lists, settings, text fields) with localStorage. Key every storage entry with a unique prefix: "appstudo:<tagName>:data". Load in connectedCallback; save after meaningful changes (debounce rapid input saves by ~300ms if needed).
- When the app stores images, photos, attachments, or other binary files, use the Origin Private File System (OPFS) — NOT localStorage (quota/size) and NOT remote uploads. Pattern:
  1. const root = await navigator.storage.getDirectory();
  2. const dir = await root.getDirectoryHandle("appstudo-<tagName>", { create: true });
  3. Write: const handle = await dir.getFileHandle(filename, { create: true }); const writable = await handle.createWritable(); await writable.write(blob); await writable.close();
  4. Read: const file = await (await dir.getFileHandle(filename)).getFile(); then URL.createObjectURL(file) for <img> / download.
  5. Keep only file names / ids in localStorage state; the binary bytes live in OPFS.
  6. Guard with try/catch; if OPFS is unavailable, show a friendly inline error (never alert()).
  7. OPFS is local-only — do not upload binaries; still no raw fetch/XHR.
- Guard JSON.parse with try/catch; fall back to sensible defaults on corrupt data.
- Do NOT rely on external CSS, fonts, or global variables except the injected Abblet SDK when using AI. Everything else self-contained.

## Visual design system — design like a native iOS app (PRIMARY GOAL)

Every app must look and feel like a beautifully crafted native iPhone app that follows Apple's Human Interface Guidelines (iOS 17 / SwiftUI aesthetic). The iPhone experience comes FIRST; desktop is a graceful scale-up. When in doubt, ask "how would Apple's Reminders / Notes / Health app do this?" and match that quality.

iOS design principles to embody:
- Clarity: crisp text, generous whitespace, one clear focus per screen.
- Deference: content is the hero; chrome is minimal and recedes.
- Depth: soft layering (background → grouped cards → sheets), never heavy shadows or borders.

Design tokens — define on :host and use everywhere (never hardcode ad-hoc values):
\`\`\`
:host {
  /* iOS system light palette */
  --bg: #f2f2f7;              /* systemGroupedBackground */
  --surface: #ffffff;        /* secondarySystemGroupedBackground (cards) */
  --surface-press: #ededf2;  /* row highlight on tap */
  --text: #000000;           /* label */
  --text-secondary: #3c3c4399;/* secondaryLabel (60% black) */
  --text-tertiary: #3c3c434d; /* tertiaryLabel */
  --separator: #3c3c4349;     /* hairline separator (~29% black) */
  --accent: #007aff;          /* iOS systemBlue */
  --accent-text: #ffffff;
  --success: #34c759;         /* systemGreen */
  --danger: #ff3b30;          /* systemRed */
  --warning: #ff9500;         /* systemOrange */
  --radius: 12px;             /* grouped card corners */
  --radius-lg: 16px;
  --radius-control: 10px;     /* buttons, fields */
  --space: 16px;              /* standard side margin */
  --gap: 10px;
  --font: -apple-system, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif;
}
\`\`\`

Layout — iOS "grouped list" pattern:
- :host { display:block; background:var(--bg); color:var(--text); font-family:var(--font); min-height:100%; box-sizing:border-box; -webkit-font-smoothing:antialiased; }
- Apply box-sizing:border-box to *, *::before, *::after. Set -webkit-tap-highlight-color: transparent.
- Center content in a phone-width column: width:100%; max-width:520px; margin-inline:auto; padding-inline:var(--space). On iPhone it fills the width; on desktop it stays a centered phone-like column (NOT stretched full-width).
- Use the iOS grouped-inset style: a large-title header, then rounded "cards" that group related rows, with the app background showing between groups. Section headers are small uppercase gray labels above a group.
- Base font 17px (iOS body size), line-height ~1.4. Never below 16px on inputs (prevents zoom-on-focus).

Navigation / header (iOS large title):
- Top area shows a bold large title (~28–34px, weight 700, letter-spacing -0.02em), optionally with a trailing round icon button (＋) using the accent color — like Apple's large-title nav bars.
- Keep the header simple; no logo, no branding chrome.

Components (match iOS look precisely):
- Grouped cards: background:var(--surface); border-radius:var(--radius); overflow:hidden. NO border and only a very soft shadow (0 1px 2px rgba(0,0,0,.04)) or none — iOS uses fills, not borders.
- List rows inside a card: min-height 44px, padding:12px 16px, separated by an inset hairline (border-bottom:0.5px solid var(--separator)) that does NOT reach the left icon/text edge; last row has no separator. Row tap highlight uses --surface-press.
- Inputs/textarea/select: font-size 17px, padding 12px 16px, background:var(--surface), border-radius:var(--radius-control), border:none or 0.5px hairline; on focus show a 2px accent ring (box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)); rounded and roomy like iOS text fields. Placeholder uses --text-tertiary.
- Buttons:
  - Filled (primary): accent bg, white text, weight 600, min-height 44px, border-radius:var(--radius-control) (or full pill for prominent CTAs), :active { opacity:.85; transform:scale(.98) }.
  - Tinted/plain: transparent bg, accent-colored text, weight 600 — iOS-style text buttons for secondary actions.
  - Destructive: --danger text or fill.
  - All buttons: no default browser chrome, cursor:pointer, transition:.12s ease.
- Toggles: prefer iOS-style switches (a pill track that turns green when on) for booleans instead of plain checkboxes; build with an accessible <button role="switch"> or styled checkbox.
- Segmented control: for 2–4 mutually exclusive filters, render an iOS segmented control (rounded gray track, white selected pill) instead of a <select>.
- Sheets/modals: present add/edit as a bottom sheet that slides up (translateY) with a rounded top (border-radius:var(--radius-lg) var(--radius-lg) 0 0), a grabber handle, and Cancel/Done in the header.
- Swipe-or-tap delete: a clear delete affordance; confirm destructive deletes.

Typography scale (iOS):
- Large title 30–34px/700; Title 22px/700; Headline 17px/600; Body 17px/400; Subhead 15px; Footnote 13px; Caption 12px. Secondary text via --text-secondary.

Motion & haptic-like feedback:
- Quick, springy transitions (150–250ms, ease-out). Rows and sheets animate in with opacity + translateY. Button press gives immediate scale/opacity feedback.
- Success states: brief green checkmark or subtle highlight. Keep motion tasteful and fast.

Responsiveness & safe areas:
- Perfect on iPhone widths (375–430px) first; scales to a centered column on desktop. Only add multi-column layouts on ≥760px if it truly helps.
- Respect the notch/home indicator: use env(safe-area-inset-*) — sticky headers add padding-top: env(safe-area-inset-top); sticky bottom bars add padding-bottom: max(var(--space), env(safe-area-inset-bottom)).
- Support Dynamic-Type feel by using rem/relative sizing where reasonable.
- Light-first (matches Abblet). Optionally add a @media (prefers-color-scheme: dark) block reusing the same token names with iOS dark values (--bg:#000; --surface:#1c1c1e; --text:#fff; --separator:#54545899; keep systemBlue accent).

Quality bar:
- Accessible: <label> tied to inputs, aria-label on icon-only buttons, role="switch" for toggles, visible focus, semantic <button>/<form>.
- Empty states: centered large emoji + one friendly line, iOS-style — never a blank screen.
- Inline validation near the field — never alert(). Confirm or allow undo for destructive actions.
- No horizontal scrolling, no tiny tap targets, content never touches screen edges.

## Feature scope

- Solve exactly the user's need — focused, polished, complete for that one job.
- Include the obvious core workflow end-to-end (add → view → edit/delete if relevant).
- Avoid feature bloat: no settings panels, themes, or export unless clearly required by the prompt.
- All user-visible text in ${langName}.

## Quality checklist before you finish

- Would look at home next to Apple's own apps on an iPhone (375–430px): grouped cards, large title, iOS blue accent, hairline separators, no heavy borders.
- Uses the design tokens (iOS palette, radii, spacing) consistently — no random hardcoded styles.
- Controls feel iOS-native: pill/filled buttons, switch toggles, segmented filters, bottom-sheet add/edit where it fits.
- Touch targets ≥ 44px, body font 17px (inputs ≥16px), no horizontal scroll, content never touches edges, safe areas respected.
- Typing in an input never rebuilds that input element (focus & caret stay put).
- List/filter changes update only the list area.
- Data survives page reload via localStorage (structured state) and OPFS (images/files when used).
- No console errors on first load with empty state; empty state is friendly.
- tagName in customElements.define matches the JSON tagName exactly.`;
}

export async function generateAppConfig(
  prompt: string,
  language: Language,
  model?: string,
): Promise<{
  config: AppConfig;
  costUsd: number | null;
  modelUsed: string | null;
  responseJson: unknown | null;
} | null> {
  const langName = AVAILABLE_LANGUAGES[language]?.name ?? "English";

  const systemPrompt = `You build small personal apps for Abblet. Each app is a single, self-contained Web Component (custom element) written in vanilla JavaScript.

Return one JSON object with:
- title: short app name, MAXIMUM 12 characters (including spaces). Must fit under a phone home-screen icon — prefer 1–2 words (e.g. "Budget", "Ostoslista", "Run Log"). Never use the raw user prompt if it is longer than 12 chars; invent a short label instead.
- description: 1-2 sentences describing what the app does
- tagline: short Gallery marketing line in ${langName}, MAXIMUM 40 characters (e.g. "Track spending in seconds")
- category: exactly one of: ${APP_CATEGORIES.join(", ")}
- tagName: valid custom element name, lowercase with at least one hyphen (e.g. "run-log", "wine-journal")
- code: complete JavaScript that registers the custom element

${designGuidelines(langName)}`;

  const { data: generated, costUsd, model: modelUsed, responseJson } = await requestJsonFromAi({
    systemPrompt,
    userPrompt: `Create an app for: ${prompt}`,
    schema: aiAppSchema,
    model,
  });

  if (!generated) return null;

  // Varmistus: koodissa on oltava annetun tagNamen rekisteröinti.
  if (!generated.code.includes(generated.tagName)) return null;

  return {
    config: {
      version: 2,
      status: "ready",
      prompt,
      ...generated,
      title: generated.title,
      tagline: generated.tagline || undefined,
      category: generated.category,
    },
    costUsd,
    modelUsed,
    responseJson,
  };
}

/**
 * Lightweight first pass: decide which edit tools to run. Does NOT receive app
 * source code — only title, description, and recent chat.
 * Caller should pass a fixed routing model (gpt-mini); not the chat picker model.
 */
export async function classifyEditIntent(opts: {
  current: AppConfig;
  history: AppEditMessage[];
  instruction: string;
  language: Language;
  model?: string;
}): Promise<{
  tools: EditTool[];
  reply: string;
  progress: string[];
  costUsd: number | null;
  modelUsed: string | null;
  responseJson: unknown | null;
} | null> {
  const { current, history, instruction, language, model } = opts;
  const langName = AVAILABLE_LANGUAGES[language]?.name ?? "English";

  const systemPrompt = `You route Abblet app-edit chat messages to tools. You do NOT edit code or icons yourself — you only choose tools, write a short chat reply, and status lines for the loading UI.

Available tools:
- updateCode: change the app's features, UI, behavior, bugfixes, layout, text inside the app, or anything that requires modifying the Web Component source.
- rename: change only the home-screen app name (title, max 12 chars) and/or the short Gallery description. Use when the user asks to rename, retitle, or rewrite the description — without needing code changes for that part.
- regenerateIcon: regenerate the home-screen / launcher icon. Use ONLY for an explicit icon request (e.g. "new icon", "vaihda kuvake", "make the icon blue"). Never invent an icon request.

Rules:
- Pick ONLY the tools the latest user message clearly needs. Prefer fewer tools.
- Do NOT select updateCode for pure rename, pure icon, questions, thanks, or vague chat.
- Do NOT select regenerateIcon unless the user explicitly asks about the launcher/home-screen icon.
- Multiple tools are OK when clearly requested together (e.g. rename + new icon).
- If nothing actionable (question, greeting, unclear): tools = [] and reply asks a clarifying question or answers briefly.
- reply: 1-3 short sentences in ${langName}. When tools is empty this is the full chat answer. When tools is non-empty, a brief acknowledgement is enough (the tools will add detail).
- progress: 1–5 short present-tense status lines in ${langName} shown while work runs.
    Make them specific to THIS request (not generic). Examples: "Updating the checklist colors…", "Renaming the app…", "Refreshing the home-screen icon…".
    If tools is empty, still return one friendly line like "Thinking about your question…".
    No markdown, no quotes around the lines, max ~80 characters each.

Return JSON: { "tools": [...], "reply": "...", "progress": ["...", "..."] }`;

  const recent = history.slice(-12);
  const historyText = recent.length
    ? recent
        .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
        .join("\n")
    : "(no previous messages)";

  const userPrompt = `App title: ${current.title}
App description: ${current.description}

Recent chat:
${historyText}

Latest user message:
${instruction}

Choose tools, write reply, and progress status lines.`;

  const { data, costUsd, model: modelUsed, responseJson } = await requestJsonFromAi({
    systemPrompt,
    userPrompt,
    schema: editIntentSchema,
    model,
  });
  if (!data) return null;

  // Dedupe while preserving order
  const tools: EditTool[] = [];
  for (const tool of data.tools) {
    if (!tools.includes(tool)) tools.push(tool);
  }

  const progress = data.progress.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  if (progress.length === 0) progress.push(data.reply.trim().slice(0, 120) || "Working…");

  return {
    tools,
    reply: data.reply.trim(),
    progress,
    costUsd,
    modelUsed,
    responseJson,
  };
}

/** Generate a short home-screen title + description (no code changes). */
export async function generateAppName(opts: {
  current: AppConfig;
  instruction: string;
  language: Language;
  model?: string;
}): Promise<{
  title: string;
  description: string;
  tagline: string;
  category: string;
  summary: string;
  costUsd: number | null;
  modelUsed: string | null;
  responseJson: unknown | null;
} | null> {
  const { current, instruction, language, model } = opts;
  const langName = AVAILABLE_LANGUAGES[language]?.name ?? "English";

  const systemPrompt = `You name Abblet apps for a phone home screen and Gallery listing.

Return JSON:
- title: short app name, MAXIMUM 12 characters (including spaces). Prefer 1–2 words. Must fit under an icon.
- description: 1-2 sentences in ${langName} describing what the app does
- tagline: short Gallery marketing line in ${langName}, MAXIMUM 40 characters
- category: exactly one of: ${APP_CATEGORIES.join(", ")}
- summary: 1 short sentence in ${langName} for the chat (what you renamed it to)

Keep the meaning of the existing app unless the user asks otherwise.`;

  const userPrompt = `Current title: ${current.title}
Current description: ${current.description}
Current tagline: ${current.tagline ?? "(none)"}
Current category: ${current.category ?? "(none)"}

User request:
${instruction}`;

  const { data, costUsd, model: modelUsed, responseJson } = await requestJsonFromAi({
    systemPrompt,
    userPrompt,
    schema: aiRenameSchema,
    model,
  });
  if (!data) return null;

  return {
    title: data.title,
    description: data.description.trim(),
    tagline: data.tagline,
    category: data.category,
    summary: data.summary.trim(),
    costUsd,
    modelUsed,
    responseJson,
  };
}

/**
 * Edit an existing app's Web Component code. The model chooses patch
 * (search-replace) or full rewrite. Failed patches automatically fall back to full.
 * Does not rename or regenerate icons — those are separate tools.
 */
export async function editAppConfig(opts: {
  current: AppConfig;
  history: AppEditMessage[];
  instruction: string;
  language: Language;
  model?: string;
  /** Skip patch mode; always request a full rewrite. */
  forceFull?: boolean;
}): Promise<{
  config: AppConfig;
  summary: string;
  costUsd: number | null;
  modelUsed: string | null;
  /** Per-attempt usage for chat (patch and/or full). */
  usageSteps: Array<{
    tool: "patchCode" | "updateCode";
    costUsd: number | null;
    modelUsed: string | null;
    durationMs: number;
    responseJson: unknown | null;
  }>;
} | null> {
  const { current, history, instruction, language, model, forceFull = false } = opts;
  const langName = AVAILABLE_LANGUAGES[language]?.name ?? "English";
  const usageSteps: Array<{
    tool: "patchCode" | "updateCode";
    costUsd: number | null;
    modelUsed: string | null;
    durationMs: number;
    responseJson: unknown | null;
  }> = [];

  const recent = history.slice(-20);
  const historyText = recent.length
    ? recent
        .map((m) => `${m.role === "user" ? "USER REQUEST" : "YOU (previous change)"}: ${m.content}`)
        .join("\n\n")
    : "(no previous messages)";

  const sharedConstraints = `## Hard constraints
- Keep the EXACT same custom element tagName: "${current.tagName}". The code must still call customElements.define("${current.tagName}", ...). Do NOT rename it.
- Preserve existing user data compatibility: keep the same localStorage keys and data shape unless the request explicitly requires changing them.
- Make the smallest change that fully satisfies the request; do not rewrite unrelated parts or regress existing features.
- Vanilla JavaScript only. NO imports, NO external libraries, NO CDN. No raw fetch/XHR/WebSocket — use Abblet.ai({ prompt }) / Abblet.connect() only when the request needs AI. Everything inside the Shadow DOM (except the host-injected Abblet global).
- Do NOT change the home-screen title, description, or launcher icon — those are handled by other tools.

${designGuidelines(langName)}`;

  const contextPrompt = `Current app title: ${current.title}
Current app description: ${current.description}
Custom element tagName: ${current.tagName}

Current full source code:
\`\`\`js
${current.code}
\`\`\`

Conversation so far:
${historyText}

New change request:
${instruction}`;

  async function requestFullRewrite(reason: string): Promise<{
    config: AppConfig;
    summary: string;
    costUsd: number | null;
    modelUsed: string | null;
  } | null> {
    const started = Date.now();
    const systemPrompt = `You are iterating on an existing Abblet app. The app is a single self-contained Web Component (custom element) written in vanilla JavaScript.

${reason}

Return one JSON object with:
- summary: 1-2 sentences in ${langName} describing exactly what you changed (shown in the chat)
- code: the COMPLETE updated JavaScript that registers the custom element (never a diff, never partial code)

${sharedConstraints}`;

    const { data, costUsd, model: modelUsed, responseJson } = await requestJsonFromAi({
      systemPrompt,
      userPrompt: `${contextPrompt}

Return the complete updated code and a short summary of what you changed.`,
      schema: aiEditFullSchema,
      model,
    });

    usageSteps.push({
      tool: "updateCode",
      costUsd,
      modelUsed,
      durationMs: Date.now() - started,
      responseJson,
    });

    if (!data) return null;
    if (!data.code.includes(current.tagName)) return null;

    return {
      config: {
        ...current,
        status: "ready",
        code: data.code,
        title: clampAppTitle(current.title),
        description: current.description,
      },
      summary: data.summary.trim(),
      costUsd,
      modelUsed,
    };
  }

  if (forceFull) {
    const full = await requestFullRewrite(
      "Apply the latest request and return the COMPLETE updated source code.",
    );
    if (!full) return null;
    return {
      ...full,
      costUsd: usageSteps.reduce((sum, s) => addCost(sum, s.costUsd), null as number | null),
      modelUsed: full.modelUsed,
      usageSteps,
    };
  }

  const patchStarted = Date.now();
  const systemPrompt = `You are iterating on an existing Abblet app. The app is a single self-contained Web Component (custom element) written in vanilla JavaScript.

You will receive the current full source code and a conversation of change requests. Choose the smallest reliable edit mode:

## mode: "patch" (preferred for small changes)
Use search/replace when the change is local (color, copy, one handler, small CSS, typo, single feature tweak).
Return:
- mode: "patch"
- summary: 1-2 sentences in ${langName}
- replacements: array of { old, new, replaceAll? }
  - old: exact substring copied from the current source (include enough context to be unique)
  - new: replacement text (use "" to delete)
  - replaceAll: optional; if true, replace every occurrence of old
  - Without replaceAll, old MUST appear exactly once in the file
  - Never use line numbers. Never invent text that is not in the source for old.

## mode: "full" (required for large changes)
Use when adding substantial features, restructuring, touching many places, or when patch would be fragile.
Return:
- mode: "full"
- summary: 1-2 sentences in ${langName}
- code: the COMPLETE updated JavaScript source

${sharedConstraints}`;

  const { data: generated, costUsd: firstCost, model: firstModel, responseJson: firstJson } =
    await requestJsonFromAi({
    systemPrompt,
    userPrompt: `${contextPrompt}

Choose patch or full and return the JSON for that mode.`,
    schema: aiEditSchema,
    model,
  });

  if (!generated) return null;

  if (generated.mode === "full") {
    usageSteps.push({
      tool: "updateCode",
      costUsd: firstCost,
      modelUsed: firstModel,
      durationMs: Date.now() - patchStarted,
      responseJson: firstJson,
    });
    if (!generated.code.includes(current.tagName)) return null;
    return {
      config: {
        ...current,
        status: "ready",
        code: generated.code,
        title: clampAppTitle(current.title),
        description: current.description,
      },
      summary: generated.summary.trim(),
      costUsd: firstCost,
      modelUsed: firstModel,
      usageSteps,
    };
  }

  // mode === "patch"
  usageSteps.push({
    tool: "patchCode",
    costUsd: firstCost,
    modelUsed: firstModel,
    durationMs: Date.now() - patchStarted,
    responseJson: firstJson,
  });

  const applied = applyReplacements(current.code, generated.replacements);
  if (applied.ok && applied.code.includes(current.tagName)) {
    return {
      config: {
        ...current,
        status: "ready",
        code: applied.code,
        title: clampAppTitle(current.title),
        description: current.description,
      },
      summary: generated.summary.trim(),
      costUsd: firstCost,
      modelUsed: firstModel,
      usageSteps,
    };
  }

  console.warn(
    "App edit patch failed, falling back to full rewrite:",
    applied.ok ? "tagName missing after patch" : applied.reason,
  );

  const full = await requestFullRewrite(
    "A previous search/replace patch failed to apply cleanly. Ignore patches and return the COMPLETE updated source code that fully satisfies the latest request.",
  );
  if (!full) return null;

  return {
    config: full.config,
    summary: full.summary,
    costUsd: usageSteps.reduce((sum, s) => addCost(sum, s.costUsd), null as number | null),
    modelUsed: full.modelUsed,
    usageSteps,
  };
}
