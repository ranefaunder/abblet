import type { BunRequest } from "bun";
import { AVAILABLE_LANGUAGES } from "/i18n/languages";

/** Legacy marketing URL → front page. */
export default function aboutRedirect(req: BunRequest<"/:lang/about" | "/:lang/about/">): Response {
  const lang = req.params.lang;
  if (!(lang in AVAILABLE_LANGUAGES)) {
    return new Response("Not Found", { status: 404 });
  }
  const url = new URL(req.url);
  return Response.redirect(`${url.origin}/${lang}/${url.search}`, 301);
}
