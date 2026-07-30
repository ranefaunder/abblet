import type { BunRequest } from "bun";
import { dbGetAppBySlug } from "/server/database/queries/apps";
import { getAuthenticatedUser } from "/utils/auth.server";
import { canViewApp } from "/utils/app-access.server";
import { getRequestHost, parseAppSubdomain } from "/utils/app-host";
import { appIconMimeType, appIconPngSrc, appIconSrc } from "/utils/app-icon";
import { isDraftConfig } from "/types/app-config-types";
import { resolveAppConfig } from "/server/database/queries/app-versions";

const FALLBACK_ICONS = [
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
] as const;

function manifestIcons(iconId: string | null) {
  const png = appIconPngSrc(iconId);
  const any = appIconSrc(iconId);
  const src = png ?? any;
  if (!src) return [...FALLBACK_ICONS];

  const type =
    png != null
      ? "image/png"
      : (appIconMimeType(iconId) ?? "image/png");

  return [
    { src, sizes: "192x192", type, purpose: "any" },
    { src, sizes: "512x512", type, purpose: "any" },
  ];
}

/**
 * GET /manifest.webmanifest on `{slug}.{APP_RUNTIME_HOST}` —
 * per-app PWA manifest (name + icons from the app).
 */
export default function appManifest(req: BunRequest): Response {
  const slug = parseAppSubdomain(getRequestHost(req));
  if (!slug) return new Response(null, { status: 404 });

  const row = dbGetAppBySlug(slug);
  if (!row) return new Response(null, { status: 404 });

  const user = getAuthenticatedUser(req);
  if (!canViewApp(row, user?.id ?? null)) {
    return new Response(null, { status: 403 });
  }

  const config = resolveAppConfig(row, {
    asOwner: user?.id === row.owner_id,
  });
  if (!config || isDraftConfig(config)) {
    return new Response(null, { status: 404 });
  }

  const name = row.title?.trim() || "App";
  const shortName = name.length > 12 ? `${name.slice(0, 11)}…` : name;
  const description = (row.tagline || row.description || name).trim();

  const manifest = {
    id: "/",
    name,
    short_name: shortName,
    description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    icons: manifestIcons(row.icon_id ?? null),
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
