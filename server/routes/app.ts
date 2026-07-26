import type { BunRequest } from "bun";
import { resolveStaticRootFromUrl } from "/utils/static.server";
import { getMeta } from "/utils/meta.server";
import { serverSideRender } from "/utils/ssr.server";
import { createSsrContext } from "/server/ssr";
import { AVAILABLE_LANGUAGES } from "/i18n/languages";
import { escapeHtmlAttribute } from "/utils/sanitize.server";
import { getRequestHost, isAppRuntimeHost } from "/utils/app-host";
import App from "/app/App";

const LANGUAGE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export default async function (req: BunRequest<"/:lang/"> | BunRequest<"/:lang/*">): Promise<Response> {
  if (isAppRuntimeHost(getRequestHost(req))) {
    const url = new URL(req.url);
    return Response.redirect(`/${url.search}`, 302);
  }

  if (req.params.lang && !(req.params.lang in AVAILABLE_LANGUAGES)) {
    return Response.redirect("/", 302);
  }

  req.cookies?.set({
    name: "appstudo-language",
    value: req.params.lang,
    path: "/",
    maxAge: LANGUAGE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const ssrContext = createSsrContext(req);
  const staticRoot = resolveStaticRootFromUrl(req.url);
  const [ssrHtml, metaHead] = await Promise.all([serverSideRender(req, App, ssrContext), getMeta(req)]);

  const fontGeist = `${staticRoot}/styles/fonts/geist.woff2`;
  const fontNotoSerif = `${staticRoot}/styles/fonts/noto-serif.woff2`;

  const html = /*html*/ `<!DOCTYPE html>
    <html lang="${escapeHtmlAttribute(req.params.lang)}">
      <head>
        ${metaHead}
        <link rel="preload" href="${escapeHtmlAttribute(fontGeist)}" as="font" type="font/woff2" crossorigin />
        <link rel="preload" href="${escapeHtmlAttribute(fontNotoSerif)}" as="font" type="font/woff2" crossorigin />
        <style>
          @font-face {
            font-style: normal;
            font-weight: 100 900;
            src: url("${escapeHtmlAttribute(fontGeist)}") format("woff2");
            font-family: "Geist";
            font-display: swap;
          }
          @font-face {
            font-style: normal;
            font-weight: 100 900;
            src: url("${escapeHtmlAttribute(fontNotoSerif)}") format("woff2");
            font-family: "Noto Serif";
            font-display: swap;
          }

          /* App shell: feel native, not like a zoomable website. */
          html, body {
            height: 100%;
            height: 100dvh;
            overflow: hidden;
            overscroll-behavior: none;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }
          body {
            /* Disables double-tap zoom; pinch zoom still possible where supported. */
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
          }
          #app {
            height: 100%;
            height: 100dvh;
            overflow: hidden;
            overscroll-behavior: none;
          }
          a, button, [role="button"], [ui-button], summary {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
          }
          img, svg {
            -webkit-user-drag: none;
            user-select: none;
          }
        </style>
        <link rel="stylesheet" href="${escapeHtmlAttribute(`${staticRoot}/styles/faunder-ui.css`)}" />
        <link rel="stylesheet" href="${escapeHtmlAttribute(`${staticRoot}/styles/style.css`)}" />
        <link rel="stylesheet" href="${escapeHtmlAttribute(`${staticRoot}/styles/font-faces.css`)}" />
      </head>
      <body>
        <div id="app">${ssrHtml}</div>
        <script>
          window.__SSR_CONTEXT__ = ${JSON.stringify(ssrContext)};
        </script>
        <script type="module" src="/app.js"></script>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Avoid bfcache restoring a zoomed/scrolled web-document state.
      "Cache-Control": "no-store",
    },
  });
}
