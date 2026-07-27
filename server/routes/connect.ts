import type { BunRequest } from "bun";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import {
  CONNECT_CODE_TTL_SEC,
  dbCreateConnectCode,
} from "/server/database/queries/connect";
import { getAuthenticatedUser } from "/utils/auth.server";
import { appOrigin } from "/utils/app-host";

type ConnectRequest = BunRequest<"/connect/:appId">;

/**
 * GET /connect/:appId — issue a one-time code and redirect to the app subdomain.
 * Requires a signed-in account (AI credits are charged to the user).
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

  const user = getAuthenticatedUser(req);
  if (!user) {
    const lang = req.cookies?.get("appstudo-language") || "en";
    const next = `/connect/${encodeURIComponent(appId)}`;
    return Response.redirect(`/${lang}/login?next=${encodeURIComponent(next)}`, 302);
  }

  const code = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_SEC * 1000).toISOString();
  dbCreateConnectCode({
    code,
    userId: user.id,
    appSlug: appId,
    expiresAt,
  });

  const target = new URL(`${appOrigin(appId)}/`);
  target.searchParams.set("code", code);
  return Response.redirect(target.toString(), 302);
}
