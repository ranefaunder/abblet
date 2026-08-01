import type { BunRequest } from "bun";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import {
  CONNECT_CODE_TTL_SEC,
  dbCreateConnectCode,
} from "/server/database/queries/connect";
import { getAuthenticatedUser } from "/utils/auth.server";
import { appRuntimeOrigin, isOriginForApp } from "/utils/app-host";

type ConnectRequest = BunRequest<"/connect/:appId">;

/** Only allow return URLs on this app's runtime host (slug or UUID). */
function resolveConnectReturn(
  row: { id: string; slug: string },
  returnParam: string | null,
): URL {
  const fallback = new URL(`${appRuntimeOrigin(row)}/`);
  if (!returnParam) return fallback;
  try {
    const u = new URL(returnParam);
    if (!isOriginForApp(u.origin, row)) return fallback;
    u.searchParams.delete("code");
    return u;
  } catch {
    return fallback;
  }
}

/**
 * GET /connect/:appId — issue a one-time code and redirect to the app runtime host.
 *
 * Query:
 * - `optional=1` — if not signed in, bounce back to the app (no login forced)
 * - `return` — app URL to return to (must be this app's runtime origin)
 */
export default function connectRoute(req: ConnectRequest): Response {
  const appId = req.params.appId?.trim() ?? "";
  if (!isNumericAppSlug(appId)) {
    return new Response("Not Found", { status: 404 });
  }

  const row = dbGetAppBySlug(appId);
  if (!row) {
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(req.url);
  const optional = url.searchParams.get("optional") === "1";
  const returnTo = resolveConnectReturn(row, url.searchParams.get("return"));

  const user = getAuthenticatedUser(req);
  if (!user) {
    if (optional) {
      return Response.redirect(returnTo.toString(), 302);
    }
    const lang = req.cookies?.get("appstudo-language") || "en";
    const next = new URL(`/connect/${encodeURIComponent(appId)}`, url.origin);
    next.searchParams.set("return", returnTo.toString());
    return Response.redirect(`/${lang}/login?next=${encodeURIComponent(next.pathname + next.search)}`, 302);
  }

  const code = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_SEC * 1000).toISOString();
  dbCreateConnectCode({
    code,
    userId: user.id,
    appSlug: appId,
    expiresAt,
  });

  returnTo.searchParams.set("code", code);
  return Response.redirect(returnTo.toString(), 302);
}
