import sanitizeHtml from "sanitize-html";

/** Tekstin strippaus HTML:stä (server + recipe-helpers). Ei tageja sallittu. */
export function sanitizeText(text: string): string {
  if (typeof text !== "string") return String(text ?? "");
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}

/** sanitize-html voi tuottaa &amp; jne.; puretaan ennen attribuutti-escapetusta, jotta ei tule kaksinkertaista koodausta. */
export function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Lainausmerkki- ja HTML-attribuutti -yhteensopiva (content="...", href="..."). */
export function escapeHtmlAttribute(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** `<title>` ja vastaava tekstisisältö (ei lainausmerkkieskapetusta). */
export function escapeHtmlTextContent(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Meta-/OG-tekstit (sanitizeText tai käännös) → turvallinen attribuuttiin. */
export function metaPlainForHtmlAttribute(text: string): string {
  return escapeHtmlAttribute(decodeBasicHtmlEntities(text));
}

/** Otsikko `<title>`-elementtiin. */
export function metaPlainForTitleElement(text: string): string {
  return escapeHtmlTextContent(decodeBasicHtmlEntities(text));
}

/**
 * JSON for embedding inside a HTML `<script>` block.
 * Escapes `<` (and line/paragraph separators) so `</script>` in string data
 * cannot break out of the script element.
 */
export function serializeJsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
