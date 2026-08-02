import { mkdirSync, readdirSync, readFileSync } from "fs";
import { z } from "zod";
import { getIconAiModel, requestJsonFromAi } from "/utils/ai-core.server";
import { checkRateLimit } from "/utils/rate-limit.server";

const LUCIDE_DIR = "./app/lucide-icons";
const ICON_DIR = "./static/app-icons";
const CANVAS = 512;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MINUTES = 1440;

/**
 * Visual styles for composed launcher icons. Each renders the same Lucide glyph
 * on a very different background so a home screen of apps never looks uniform.
 */
const ICON_STYLES = [
  "gradient",
  "radial",
  "duotone",
  "soft",
  "vivid",
  "mesh",
  "frame",
  "solid",
  "split",
  "sunset",
  "mono",
] as const;
type IconStyle = (typeof ICON_STYLES)[number];

const GLYPH_SIZES = ["sm", "md", "lg"] as const;
type GlyphSize = (typeof GLYPH_SIZES)[number];

/** Lucide viewBox stroke widths (24×24 space), thin → thick. */
const STROKE_WEIGHTS = ["1", "1.5", "2", "2.5", "3"] as const;
type StrokeWeight = (typeof STROKE_WEIGHTS)[number];

/** Linear gradient direction (ignored for non-linear styles). */
const GRADIENT_DIRS = ["diagonal", "horizontal", "vertical", "diagonal-rev"] as const;
type GradientDir = (typeof GRADIENT_DIRS)[number];

/** #RRGGBB hex (AI returns these; server normalizes case). */
const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{6})$/, "Expected #RRGGBB hex color");

const iconSpecSchema = z.object({
  /**
   * Exactly 8 semantic tags — used to score/boost AI icon suggestions,
   * and as a high-confidence fallback if suggested names are invalid.
   */
  tags: z.array(z.string().min(1)).length(8),
  /**
   * Exactly 8 Lucide icon names in kebab-case, best fit first.
   * Primary selection pool: we almost always pick from the top few.
   */
  icons: z.array(z.string().min(1)).length(8),
  /** Visual treatment of the icon. */
  style: z.enum(ICON_STYLES),
  /**
   * 1–3 background hex colors used by the style (solid uses [0], gradients use
   * [0]+[1], sunset/mesh may use all three). Designer-quality palette.
   */
  bgColors: z.array(hexColorSchema).min(1).max(3),
  /** Exact Lucide glyph stroke color as #RRGGBB. */
  glyphColor: hexColorSchema,
  /** Relative size of the centered Lucide glyph. */
  glyphSize: z.enum(GLYPH_SIZES).optional(),
  /** Lucide stroke width: 1 | 1.5 | 2 | 2.5 | 3. */
  strokeWeight: z.enum(STROKE_WEIGHTS).optional(),
  /** Direction for linear gradients. */
  gradientDir: z.enum(GRADIENT_DIRS).optional(),
});
type IconSpec = z.infer<typeof iconSpecSchema>;

/** Spec after server-side enrichment — all variation fields resolved. */
type ResolvedIconSpec = {
  tags: string[];
  icons: string[];
  style: IconStyle;
  bgColors: [string, string, string];
  glyphColor: string;
  glyphSize: GlyphSize;
  strokeWeight: StrokeWeight;
  gradientDir: GradientDir;
};

export type AppIconGenerationResult = {
  /** Stored icon reference incl. extension, e.g. "a1b2c3d4.svg". */
  iconId: string;
  /** Text model OpenRouter id that chose the icon design. */
  model: string | null;
  /** Cost for the design decision (no image model involved). */
  costUsd: number | null;
  durationMs: number;
};

export async function generateAppIcon(opts: {
  title: string;
  description: string;
  clientIP: string;
}): Promise<AppIconGenerationResult | null> {
  const startedAt = Date.now();
  try {
    if (!checkRateLimit(opts.clientIP, "app_icon", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MINUTES)) {
      console.warn("App icon generation rate limited");
      return null;
    }

    const design = await designIconSpec(opts.title, opts.description);
    const spec = enrichSpec(
      design?.spec ?? fallbackSpec(opts.title, opts.description),
      opts.title,
      opts.description,
    );

    const iconName = resolveIconName(spec, opts.title, opts.description);
    const inner = loadLucideInner(iconName) ?? loadLucideInner("layout-grid");
    if (!inner) {
      console.error("App icon: no Lucide glyph could be loaded");
      return null;
    }

    const svg = composeIconSvg({ inner, spec });

    const id = crypto.randomUUID().replace(/-/g, "").substring(0, 12);
    const iconId = `${id}.svg`;
    mkdirSync(ICON_DIR, { recursive: true });
    await Bun.write(`${ICON_DIR}/${iconId}`, svg);
    // PNG sibling for surfaces that don't accept SVG (iOS apple-touch-icon).
    await writePngSibling(svg, `${ICON_DIR}/${id}.png`);

    return {
      iconId,
      model: design?.model ?? null,
      costUsd: design?.costUsd ?? null,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    console.error("Error generating app icon:", error);
    return null;
  }
}

/** Rasterize the composed SVG to a PNG (best effort; SVG remains the primary). */
async function writePngSibling(svg: string, path: string): Promise<void> {
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer();
    await Bun.write(path, png);
  } catch (error) {
    console.warn("App icon PNG rasterization skipped:", error);
  }
}

// --- AI design decision ------------------------------------------------------

async function designIconSpec(
  title: string,
  description: string,
): Promise<{ spec: IconSpec; costUsd: number | null; model: string | null } | null> {
  const systemPrompt = `You design minimalist app icons built from a single Lucide line icon centered on a colored square background. You do NOT draw the icon — you propose the best on-topic Lucide glyph names (and supporting tags), plus an exact color palette in hex so a home screen of many apps never looks uniform.

Think like a product designer picking a palette: background colors and the glyph color must work together — clear contrast, intentional harmony or tasteful tension, readable at ~60–120px. Never pick colors that would make a light glyph disappear into a light background (or dark on dark).

CRITICAL variety rules (colors/style — not the glyph metaphor):
- Do NOT default every app to teal/cyan + white glyph.
- Explore the full range: vivid hues, muted pastels, warm earth tones, cool grays, near-black, cream/off-white, charcoal, blush, olive, rust, navy, sand, etc.
- Different apps should get clearly different palettes (light vs dark, saturated vs muted, warm vs cool).

GLYPH relevance is critical:
- The Lucide icon MUST clearly communicate what the app is about at a glance (todo → checklist, gym → dumbbell, budget → wallet, recipes → chef-hat, etc.).
- Never suggest decorative, abstract, or loosely related icons.

Return JSON with:
- icons: REQUIRED exactly 8 real Lucide icon names in kebab-case, ordered best → least.
    icons[0] = the single clearest metaphor for this app (most important).
    icons[1]–icons[2] = close on-topic alternatives (same idea, slightly different glyph).
    icons[3]–icons[7] = still clearly on-topic variants only — never off-topic filler.
    Real Lucide names only (e.g. "list-checks", "dumbbell", "wallet", "book-open", "chef-hat", "droplet", "calendar-check", "heart-pulse"). No invented names.
- tags: REQUIRED exactly 8 short English semantic tags for the app's purpose/imagery.
    Prefer concrete nouns Lucide metadata might use (e.g. "checklist", "fitness", "wallet", "recipe", "calendar", "water", "music", "travel").
    Used to confirm relevance of your icon picks. No vague fillers like "app", "tool", "modern". No duplicates.
- style: one of ${ICON_STYLES.join(", ")}.
    - gradient: two-color linear gradient (uses bgColors[0] → bgColors[1]).
    - radial: glowing radial gradient (center bgColors[1] or [0], edge the other).
    - duotone: deep solid bgColors[0] with a faint watermark of the glyph.
    - soft: light pastel gradient. Friendly, calm.
    - vivid: bold field bgColors[0] with accent blob bgColors[1].
    - mesh: dark field bgColors[0] with two glow blobs from bgColors[1]/[2].
    - frame: solid bgColors[0] with a rounded outline frame.
    - solid: flat single color bgColors[0].
    - split: hard two-tone split bgColors[0] | bgColors[1].
    - sunset: horizontal band gradient using up to 3 colors.
    - mono: near-black / charcoal / gray minimal field.
- bgColors: REQUIRED array of 1–3 hex colors as "#RRGGBB" (6 hex digits, with #).
    - solid/mono/duotone/frame: at least 1 color.
    - gradient/radial/split/soft/vivid: at least 2 colors that pair well.
    - sunset/mesh: preferably 3 colors.
    Colors must feel designed together (same family, complementary, or elegant neutrals) — not random neon clashes.
- glyphColor: REQUIRED exact Lucide stroke color as "#RRGGBB".
    Pick white, off-white, cream, near-black, charcoal, or a accent tint that contrasts cleanly with the background. Do NOT always use #FFFFFF — vary when the palette calls for it (e.g. dark glyph on soft cream, warm ivory on navy, soft mint on deep plum).
- glyphSize: one of ${GLYPH_SIZES.join(", ")} — sm tighter, lg larger. Vary strongly.
- strokeWeight: one of ${STROKE_WEIGHTS.join(", ")} — Lucide stroke width in px (1 hairline → 3 chunky). Vary with personality.
- gradientDir: one of ${GRADIENT_DIRS.join(", ")} (for linear gradient styles).

Always keep the glyph readable as a small home-screen icon.`;

  const userPrompt = `App name: ${title.trim() || "Personal app"}
What it does: ${description.trim() || "(no description)"}

Pick the clearest on-topic Lucide icon metaphor (icons[0] most important, then close alternatives). Also return 8 tags and a distinctive color/style recipe.`;

  try {
    const { data, costUsd, model } = await requestJsonFromAi({
      systemPrompt,
      userPrompt,
      schema: iconSpecSchema,
      model: getIconAiModel(),
    });
    if (!data) return null;
    return { spec: data, costUsd, model };
  } catch (error) {
    console.error("App icon design request failed:", error);
    return null;
  }
}

/** Deterministic spec when the AI is unavailable, still varied per app. */
function fallbackSpec(title: string, description: string): IconSpec {
  const seed = hashString(`${title} ${description}`);
  const style = ICON_STYLES[seed % ICON_STYLES.length]!;
  const palette = seededPalette(seed);
  return {
    tags: fallbackTags(title, description),
    icons: fallbackIcons(title, description),
    style,
    bgColors: [palette[0]!, palette[1]!, palette[2]!],
    glyphColor: palette[3]!,
    glyphSize: GLYPH_SIZES[seed % GLYPH_SIZES.length],
    strokeWeight: STROKE_WEIGHTS[(seed >> 3) % STROKE_WEIGHTS.length],
    gradientDir: GRADIENT_DIRS[(seed >> 5) % GRADIENT_DIRS.length],
  };
}

/** Build up to 8 tags from title/description words when AI is unavailable. */
function fallbackTags(title: string, description: string): string[] {
  const words = `${title} ${description}`
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/i)
    .filter((w) => w.length >= 3);
  const tags: string[] = [];
  for (const word of words) {
    if (!tags.includes(word)) tags.push(word);
    if (tags.length >= 8) break;
  }
  const pad = ["checklist", "notes", "calendar", "home", "work", "daily", "focus", "grid"];
  for (const p of pad) {
    if (tags.length >= 8) break;
    if (!tags.includes(p)) tags.push(p);
  }
  while (tags.length < 8) tags.push("grid");
  return tags.slice(0, 8);
}

/** Build 8 Lucide name suggestions from keywords when AI is unavailable. */
function fallbackIcons(title: string, description: string): string[] {
  const available = lucideNames();
  const icons: string[] = [];
  const words = `${title} ${description}`
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/i)
    .filter((w) => w.length >= 3);

  for (const word of words) {
    const hint = KEYWORD_ICONS[word];
    if (hint && available.has(hint) && !icons.includes(hint)) icons.push(hint);
    if (icons.length >= 8) break;
  }

  const pad = [
    "layout-grid",
    "list-checks",
    "notebook-pen",
    "calendar-check",
    "sparkles",
    "layers",
    "home",
    "briefcase",
  ];
  for (const name of pad) {
    if (icons.length >= 8) break;
    if (available.has(name) && !icons.includes(name)) icons.push(name);
  }
  while (icons.length < 8) icons.push("layout-grid");
  return icons.slice(0, 8);
}

/** Fill missing fields, normalize hex, and ensure glyph contrast against the primary bg. */
function enrichSpec(raw: IconSpec, title: string, description: string): ResolvedIconSpec {
  const tags = (raw.tags?.length === 8 ? raw.tags : fallbackTags(title, description)).map((t) =>
    t.trim(),
  );
  const icons = (raw.icons?.length === 8 ? raw.icons : fallbackIcons(title, description)).map((n) =>
    n.trim(),
  );
  const seed = hashString(`${title}\0${description}\0${tags.join(",")}\0${icons.join(",")}`);
  const style = ICON_STYLES.includes(raw.style) ? raw.style : ICON_STYLES[seed % ICON_STYLES.length]!;
  const gradientDir =
    raw.gradientDir && GRADIENT_DIRS.includes(raw.gradientDir)
      ? raw.gradientDir
      : GRADIENT_DIRS[(seed >> 5) % GRADIENT_DIRS.length]!;
  const glyphSize =
    raw.glyphSize && GLYPH_SIZES.includes(raw.glyphSize)
      ? raw.glyphSize
      : GLYPH_SIZES[seed % GLYPH_SIZES.length]!;
  const strokeWeight =
    raw.strokeWeight && STROKE_WEIGHTS.includes(raw.strokeWeight)
      ? raw.strokeWeight
      : STROKE_WEIGHTS[(seed >> 3) % STROKE_WEIGHTS.length]!;

  const fallback = seededPalette(seed);
  const normalizedBg = (raw.bgColors ?? [])
    .map(normalizeHex)
    .filter((c): c is string => c != null);
  while (normalizedBg.length < 3) {
    normalizedBg.push(fallback[normalizedBg.length]!);
  }
  const bgColors: [string, string, string] = [normalizedBg[0]!, normalizedBg[1]!, normalizedBg[2]!];

  let glyphColor = normalizeHex(raw.glyphColor) ?? fallback[3]!;
  glyphColor = ensureGlyphContrast(glyphColor, bgColors[0]);

  return {
    tags,
    icons,
    style,
    bgColors,
    glyphColor,
    glyphSize,
    strokeWeight,
    gradientDir,
  };
}

/** Varied fallback palettes (bg0, bg1, bg2, glyph) so offline icons still differ. */
function seededPalette(seed: number): [string, string, string, string] {
  const palettes: Array<[string, string, string, string]> = [
    ["#1B1B1F", "#3A3A42", "#5C5C66", "#F5F5F7"], // charcoal / light
    ["#F4EFE6", "#E7DCC8", "#D2C2A8", "#2C2416"], // warm cream / dark brown
    ["#0F2A44", "#1E4D6B", "#3D7CA6", "#E8F4FF"], // navy / ice
    ["#3D1F2B", "#7A3048", "#C45B74", "#FFF0F3"], // wine / blush glyph
    ["#1F2A1C", "#3E5C38", "#7FA86E", "#F2F7EE"], // olive
    ["#2A2118", "#6B4E2E", "#C4924A", "#FFF6E8"], // rust / sand
    ["#E8E8EA", "#C8C8CE", "#9A9AA3", "#1C1C1E"], // cool gray / near-black glyph
    ["#141414", "#2B2B2B", "#FF5A36", "#FFEDE8"], // near-black / coral accent field
    ["#F7F1FF", "#E0D0F5", "#A78BDB", "#2A1A4A"], // soft lavender
    ["#062A2A", "#0E4F4F", "#1FA3A3", "#E6FFFB"], // deep teal (one of many, not default)
    ["#3B1C0F", "#8B3A1C", "#E07A3D", "#FFF4EB"], // terracotta
    ["#0B1026", "#1A2458", "#5B6CFF", "#EEF0FF"], // indigo
  ];
  return palettes[seed % palettes.length]!;
}

// --- Lucide glyph resolution -------------------------------------------------

type LucideMetaIndex = {
  names: Set<string>;
  /** icon name → normalized tags + categories from Lucide JSON metadata */
  tagsByIcon: Map<string, Set<string>>;
};

let lucideMetaCache: LucideMetaIndex | null = null;

/** Load Lucide SVG names + tag/category metadata once (cached). */
function lucideMeta(): LucideMetaIndex {
  if (lucideMetaCache) return lucideMetaCache;
  const names = new Set<string>();
  const tagsByIcon = new Map<string, Set<string>>();
  try {
    for (const file of readdirSync(LUCIDE_DIR)) {
      if (file.endsWith(".svg")) names.add(file.slice(0, -4));
    }
    for (const file of readdirSync(LUCIDE_DIR)) {
      if (!file.endsWith(".json")) continue;
      const name = file.slice(0, -5);
      if (!names.has(name)) continue;
      try {
        const meta = JSON.parse(readFileSync(`${LUCIDE_DIR}/${file}`, "utf8")) as {
          tags?: unknown;
          categories?: unknown;
        };
        const set = new Set<string>();
        const rawTags = [
          ...(Array.isArray(meta.tags) ? meta.tags : []),
          ...(Array.isArray(meta.categories) ? meta.categories : []),
        ];
        for (const t of rawTags) {
          if (typeof t !== "string") continue;
          const normalized = normalizeTag(t);
          if (normalized) set.add(normalized);
        }
        tagsByIcon.set(name, set);
      } catch {
        // skip broken metadata files
      }
    }
  } catch (error) {
    console.error("Failed to read Lucide icon dir:", error);
  }
  lucideMetaCache = { names, tagsByIcon };
  return lucideMetaCache;
}

function lucideNames(): Set<string> {
  return lucideMeta().names;
}

function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeIconName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.svg$/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Pick a relevant Lucide glyph with light variation.
 *
 * Primary: AI's ordered `icons` (best first). Score by rank + tag agreement,
 * then draw only among the top 3 — so the result stays on-topic but isn't
 * always identical.
 *
 * Fallback: library icons with ≥2 tag hits (top 5 by score), then none.
 */
function pickIcon(tags: string[], icons: string[]): string | null {
  const { names, tagsByIcon } = lucideMeta();
  const query = [...new Set(tags.map(normalizeTag).filter(Boolean))];

  const suggestions: string[] = [];
  for (const candidate of icons) {
    const name = normalizeIconName(candidate);
    if (!name || !names.has(name) || suggestions.includes(name)) continue;
    suggestions.push(name);
  }

  if (suggestions.length > 0) {
    /** Steep rank curve: prefer icons[0], allow light swaps with close runners-up. */
    const RANK_WEIGHT = [10, 4, 2, 1, 1, 1, 1, 1];
    const scored = new Map<string, number>();
    for (let i = 0; i < suggestions.length; i++) {
      const name = suggestions[i]!;
      let score = RANK_WEIGHT[i] ?? 1;
      const iconTags = tagsByIcon.get(name);
      if (iconTags) {
        for (const tag of query) {
          if (iconTags.has(tag)) score += 2;
        }
      }
      for (const token of name.split("-")) {
        if (token.length < 3) continue;
        if (query.some((t) => t === token || t.includes(token) || token.includes(t.split(" ")[0]!))) {
          score += 1;
        }
      }
      scored.set(name, score);
    }
    return drawTopWeighted(scored, 3);
  }

  // No valid AI names — only strong tag matches from the library
  if (!query.length || tagsByIcon.size === 0) return null;
  const tagScored = new Map<string, number>();
  for (const [name, iconTags] of tagsByIcon) {
    let hits = 0;
    for (const tag of query) {
      if (iconTags.has(tag)) hits++;
    }
    if (hits >= 2) tagScored.set(name, hits * hits);
  }
  if (tagScored.size === 0) return null;
  return drawTopWeighted(tagScored, 5);
}

/** Weighted draw among the top-N highest-scoring names. */
function drawTopWeighted(scored: Map<string, number>, topN: number): string {
  const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, Math.max(1, topN));
  const tickets: string[] = [];
  for (const [name, score] of top) {
    const n = Math.max(1, Math.round(score));
    for (let i = 0; i < n; i++) tickets.push(name);
  }
  return tickets[Math.floor(Math.random() * tickets.length)]!;
}

/** Common concept → Lucide name hints used only when lottery + AI names miss. */
const KEYWORD_ICONS: Record<string, string> = {
  todo: "list-checks",
  task: "list-checks",
  list: "list",
  note: "notebook-pen",
  notes: "notebook-pen",
  money: "wallet",
  budget: "wallet",
  expense: "wallet",
  finance: "piggy-bank",
  saving: "piggy-bank",
  workout: "dumbbell",
  gym: "dumbbell",
  fitness: "dumbbell",
  run: "footprints",
  running: "footprints",
  habit: "repeat",
  timer: "timer",
  pomodoro: "timer",
  clock: "clock",
  recipe: "chef-hat",
  cooking: "chef-hat",
  food: "utensils",
  water: "droplet",
  weather: "cloud-sun",
  book: "book-open",
  reading: "book-open",
  music: "music",
  photo: "image",
  gallery: "images",
  travel: "plane",
  map: "map",
  calendar: "calendar-check",
  event: "calendar-check",
  shopping: "shopping-cart",
  game: "gamepad-2",
  chess: "crown",
  password: "key-round",
  health: "heart-pulse",
  mood: "smile",
  journal: "book-heart",
  weight: "scale",
  sleep: "moon",
  study: "graduation-cap",
  work: "briefcase",
  code: "code",
  chat: "message-circle",
};

function resolveIconName(spec: ResolvedIconSpec, title: string, description: string): string {
  const picked = pickIcon(spec.tags, spec.icons);
  if (picked) return picked;

  const available = lucideNames();
  return searchIconByKeywords(`${title} ${description}`, available) ?? "layout-grid";
}

function searchIconByKeywords(text: string, available: Set<string>): string | null {
  const words = text
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/i)
    .filter((w) => w.length >= 3);

  for (const word of words) {
    const hint = KEYWORD_ICONS[word];
    if (hint && available.has(hint)) return hint;
  }

  let best: { name: string; score: number } | null = null;
  for (const name of available) {
    const tokens = name.split("-");
    let score = 0;
    for (const word of words) {
      if (tokens.includes(word)) score += 3;
      else if (name.includes(word)) score += 1;
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && name.length < best.name.length))) {
      best = { name, score };
    }
  }
  return best?.name ?? null;
}

/** Inner geometry of a Lucide SVG (paths/circles), without the wrapper <svg>. */
function loadLucideInner(name: string): string | null {
  try {
    const raw = readFileSync(`${LUCIDE_DIR}/${name}.svg`, "utf8");
    const inner = raw
      .replace(/^[\s\S]*?<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "")
      .trim();
    return inner || null;
  } catch {
    return null;
  }
}

// --- SVG composition ---------------------------------------------------------

function composeIconSvg(opts: { inner: string; spec: ResolvedIconSpec }): string {
  const { inner, spec } = opts;
  const bg = buildBackground(spec);
  const fg = resolveForeground(spec);
  const glyph = iconGroup(inner, fg);
  const watermark =
    spec.style === "duotone" ? watermarkGroup(inner, spec.glyphColor, 0.12) : "";

  const defs = bg.defs ? `<defs>${bg.defs}</defs>` : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
    defs,
    bg.body,
    watermark,
    glyph,
    `</svg>`,
  ].join("");
}

type Foreground = {
  color: string;
  boxFrac: number;
  /** Stroke width in Lucide 24×24 viewBox units. */
  strokeWidth: number;
};

const GLYPH_SIZE_FRAC: Record<GlyphSize, number> = {
  sm: 0.36,
  md: 0.48,
  lg: 0.62,
};

const STROKE_WIDTH: Record<StrokeWeight, number> = {
  "1": 1,
  "1.5": 1.5,
  "2": 2,
  "2.5": 2.5,
  "3": 3,
};

function iconGroup(inner: string, fg: Foreground): string {
  const box = CANVAS * fg.boxFrac;
  const scale = box / 24;
  const offset = (CANVAS - box) / 2;
  // Stroke is in Lucide viewBox units (scales with the glyph).
  // No SVG filters: sharp/librsvg leaves a rectangular artifact around filtered groups.
  return `<g transform="translate(${round(offset)} ${round(offset)}) scale(${round(scale)})" fill="none" stroke="${fg.color}" stroke-width="${fg.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
}

function watermarkGroup(inner: string, color: string, opacity: number): string {
  const box = CANVAS * 1.28;
  const scale = box / 24;
  const offset = CANVAS - box * 0.62;
  return `<g transform="translate(${round(offset)} ${round(offset)}) scale(${round(scale)})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${inner}</g>`;
}

/** Map resolved glyph choices to draw params. */
function resolveForeground(spec: ResolvedIconSpec): Foreground {
  return {
    color: spec.glyphColor,
    boxFrac: GLYPH_SIZE_FRAC[spec.glyphSize],
    strokeWidth: STROKE_WIDTH[spec.strokeWeight],
  };
}

function linearGradientAttrs(dir: GradientDir): string {
  switch (dir) {
    case "horizontal":
      return `x1="0" y1="0.5" x2="1" y2="0.5"`;
    case "vertical":
      return `x1="0.5" y1="0" x2="0.5" y2="1"`;
    case "diagonal-rev":
      return `x1="1" y1="0" x2="0" y2="1"`;
    case "diagonal":
    default:
      return `x1="0" y1="0" x2="1" y2="1"`;
  }
}

function buildBackground(spec: ResolvedIconSpec): { defs: string; body: string } {
  const [c0, c1, c2] = spec.bgColors;
  const { style, gradientDir, glyphColor } = spec;
  const full = `<rect width="${CANVAS}" height="${CANVAS}"`;
  const lin = linearGradientAttrs(gradientDir);

  switch (style) {
    case "gradient": {
      return {
        defs:
          `<linearGradient id="bg" ${lin}>` +
          `<stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>` +
          `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
        body: `${full} fill="url(#bg)"/>${full} fill="url(#sheen)"/>`,
      };
    }
    case "sunset": {
      return {
        defs:
          `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0" stop-color="${c0}"/><stop offset="0.55" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`,
        body: `${full} fill="url(#bg)"/>`,
      };
    }
    case "radial": {
      return {
        defs:
          `<radialGradient id="bg" cx="0.35" cy="0.3" r="0.95">` +
          `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c0}"/></radialGradient>`,
        body: `${full} fill="url(#bg)"/>`,
      };
    }
    case "duotone": {
      return { defs: "", body: `${full} fill="${c0}"/>` };
    }
    case "soft": {
      return {
        defs:
          `<linearGradient id="bg" ${lin}>` +
          `<stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>`,
        body: `${full} fill="url(#bg)"/>`,
      };
    }
    case "vivid": {
      return {
        defs:
          `<radialGradient id="hi" cx="0.3" cy="0.05" r="0.8">` +
          `<stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
          `<radialGradient id="ac" cx="0.85" cy="0.9" r="0.7">` +
          `<stop offset="0" stop-color="${c1}" stop-opacity="0.8"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>`,
        body: `${full} fill="${c0}"/>${full} fill="url(#ac)"/>${full} fill="url(#hi)"/>`,
      };
    }
    case "mesh": {
      return {
        defs:
          `<radialGradient id="b1" cx="0.25" cy="0.25" r="0.7">` +
          `<stop offset="0" stop-color="${c1}" stop-opacity="0.95"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>` +
          `<radialGradient id="b2" cx="0.8" cy="0.82" r="0.75">` +
          `<stop offset="0" stop-color="${c2}" stop-opacity="0.9"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>`,
        body: `${full} fill="${c0}"/>${full} fill="url(#b1)"/>${full} fill="url(#b2)"/>`,
      };
    }
    case "frame": {
      const frameStroke = relativeLuminance(c0) > 0.55 ? "#1a1a1a" : glyphColor;
      const frame = `<rect x="64" y="64" width="384" height="384" rx="104" fill="none" stroke="${frameStroke}" stroke-opacity="0.34" stroke-width="10"/>`;
      return { defs: "", body: `${full} fill="${c0}"/>${frame}` };
    }
    case "solid": {
      return { defs: "", body: `${full} fill="${c0}"/>` };
    }
    case "split": {
      return {
        defs:
          `<linearGradient id="bg" ${lin}>` +
          `<stop offset="0.48" stop-color="${c0}"/><stop offset="0.52" stop-color="${c1}"/></linearGradient>`,
        body: `${full} fill="url(#bg)"/>`,
      };
    }
    case "mono": {
      return { defs: "", body: `${full} fill="${c0}"/>` };
    }
  }
}

// --- Color / math helpers ----------------------------------------------------

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function hashString(str: string): number {
  let hash = 0;
  for (const char of str) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function normalizeHex(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return `#${m[1]!.toLowerCase()}`;
}

function relativeLuminance(hex: string): number {
  const n = normalizeHex(hex);
  if (!n) return 0.5;
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** If glyph/background contrast is too weak, flip to black or white. */
function ensureGlyphContrast(glyph: string, bg: string): string {
  const gL = relativeLuminance(glyph);
  const bL = relativeLuminance(bg);
  const lighter = Math.max(gL, bL);
  const darker = Math.min(gL, bL);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  if (ratio >= 2.2) return glyph;
  return bL > 0.55 ? "#1a1a1a" : "#ffffff";
}
