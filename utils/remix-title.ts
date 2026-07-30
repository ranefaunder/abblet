/** Short remix title when AI rename is unavailable. Max 12 chars. */
export function remixFallbackTitle(sourceTitle: string): string {
  const base = sourceTitle.trim().slice(0, 6).trimEnd() || "App";
  const out = `${base} Remix`.slice(0, 12).trim();
  return out || "Remix";
}
