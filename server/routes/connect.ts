import type { BunRequest } from "bun";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import {
  CONNECT_CODE_TTL_SEC,
  dbCreateConnectCode,
} from "/server/database/queries/connect";
import { ensureGuestUser } from "/utils/auth.server";
import { appOrigin } from "/utils/app-host";

type ConnectRequest = BunRequest<"/connect/:appId">;

/**
 * GET /connect/:appId — issue a one-time code and redirect to the app subdomain.
 * Uses existing session or creates a guest (no login UI).
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

  const user = ensureGuestUser(req);
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
