import type { BunRequest } from "bun";
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from "/i18n/languages";
import { t } from "/utils/i18n";
import { getLang } from "/utils/lang";

/** PWA icons from remiix-app-icon.jpg (bun run gen:favicons). */
const ICONS = [
  {
    src: "/static/favicons/android-chrome-192x192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/static/favicons/android-chrome-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/static/favicons/android-chrome-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
  {
    src: "/static/favicons/apple-touch-icon.png",
    sizes: "180x180",
    type: "image/png",
  },
] as const;

/** App icon blue (#0878f8). */
const APP_ICON_BLUE = "#0878f8";

export default async function (req: BunRequest): Promise<Response> {
  const lang = getLang(req.url) ?? DEFAULT_LANGUAGE;
  if (!(lang in AVAILABLE_LANGUAGES)) {
    return new Response(null, { status: 404 });
  }

  const manifest = {
    name: "Remiix",
    short_name: "Remiix",
    description: t("Remix any app, or make your own.", lang),
    start_url: `/${lang}/`,
    scope: "/",
    display: "standalone",
    background_color: APP_ICON_BLUE,
    theme_color: APP_ICON_BLUE,
    lang,
    icons: [...ICONS],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
