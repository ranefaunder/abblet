/**
 * If the whole reply is a single markdown fenced block, return the inner text.
 * Models often wrap JSON / plain answers in ```json … ``` — apps that
 * JSON.parse(Remiix.ai(…)) then fail even though the payload is valid.
 */
export function unwrapMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:[a-zA-Z0-9_+-]*)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (!match) return trimmed;
  return match[1]!.replace(/\s+$/u, "");
}
