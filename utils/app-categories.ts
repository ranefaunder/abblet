/** Fixed Store categories shared by AI generation, Store, and Edit. */
export const APP_CATEGORIES = [
  "Productivity",
  "Health",
  "Finance",
  "Food",
  "Games",
  "Utilities",
  "Lifestyle",
  "Education",
] as const;

export type AppCategory = (typeof APP_CATEGORIES)[number];

export function isAppCategory(value: string | null | undefined): value is AppCategory {
  return typeof value === "string" && (APP_CATEGORIES as readonly string[]).includes(value);
}

/** Soft fallback when AI omits or invents a category. */
export function normalizeAppCategory(value: string | null | undefined): AppCategory {
  if (isAppCategory(value)) return value;
  return "Utilities";
}
