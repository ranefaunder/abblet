import type { BunRequest } from "bun";
import { getAuthenticatedUser } from "/utils/auth.server";
import { canViewApp } from "/utils/app-access.server";
import { appIconMimeType, appIconPngSrc, appIconSrc } from "/utils/app-icon";
import { isDraftConfig } from "/types/app-config-types";
import { resolveAppConfig } from "/server/database/queries/app-versions";
import { resolveAppFromRequestHost } from "/utils/app-runtime.server";
import { isAppPubliclyRunnable, appOrigin } from "/utils/app-host";

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
 * GET /manifest.webmanifest on `{label}.{APP_RUNTIME_HOST}` —
 * per-app PWA manifest (name + icons from the app).
 */
export default function appManifest(req: BunRequest): Response {
  const resolved = resolveAppFromRequestHost(req);
  if (!resolved) return new Response(null, { status: 404 });

  const { row, label, viaCapabilityIdHost } = resolved;
  if (label.kind === "slug" && !isAppPubliclyRunnable(row)) {
    return new Response(null, { status: 404 });
  }
  if (label.kind === "id" && isAppPubliclyRunnable(row)) {
    return Response.redirect(`${appOrigin(row.slug)}/manifest.webmanifest`, 302);
  }

  const user = getAuthenticatedUser(req);
  if (!canViewApp(row, user?.id ?? null, { viaCapabilityIdHost })) {
    return new Response(null, { status: 403 });
  }

  const config = resolveAppConfig(row, {
    asOwner: user?.id === row.owner_id || viaCapabilityIdHost,
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
