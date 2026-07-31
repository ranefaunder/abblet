import type { BunRequest } from "bun";
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from "/i18n/languages";

export default async function (req: BunRequest): Promise<Response> {
  const origin = new URL(req.url).origin;
  const langs = Object.keys(AVAILABLE_LANGUAGES);
  const paths = ["", "apps", "games", "about", "me"];
  const urls = langs.flatMap((lang) =>
    paths.map((p) => (p ? `${origin}/${lang}/${p}` : `${origin}/${lang}/`)),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url><loc>${loc}</loc></url>`).join("\n")}
  <url><loc>${origin}/${DEFAULT_LANGUAGE}/</loc></url>
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
