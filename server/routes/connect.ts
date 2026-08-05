import type { BunRequest } from "bun";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import {
  CONNECT_CODE_TTL_SEC,
  dbCreateConnectCode,
  dbCreateConnectGrant,
  dbHasConnectGrant,
} from "/server/database/queries/connect";
import { getAuthenticatedUser } from "/utils/auth.server";
import { appRuntimeOrigin } from "/utils/app-host";
import { consumeConnectNonce } from "/utils/connect-nonce.server";

type ConnectRequest = BunRequest<"/connect/:appId">;

function canConnectToApp(
  row: { owner_id: string; visibility: string; is_draft: number },
  userId: string,
): boolean {
  if (row.owner_id === userId) return true;
  return row.visibility === "public" && row.is_draft === 0;
}

/**
 * GET /connect/:appId — issue a one-time code and redirect to the app runtime host root.
 *
 * Query:
 * - `optional=1` — if not signed in, bounce back to the app (no login forced)
 * - `confirm=<nonce>` — one-time token (from the SPA consent page or Store Open via
 *   prepare-open). Required for first-time connect unless already granted. Without it,
 *   the user is redirected to the SPA consent page (`/:lang/connect/:appId`), where the
 *   Connect click mints a nonce via prepare-open and returns here.
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
  const confirmNonce = url.searchParams.get("confirm");
  const returnTo = new URL(`${appRuntimeOrigin(row)}/`);

  const user = getAuthenticatedUser(req);
  if (!user) {
    if (optional) {
      return Response.redirect(returnTo.toString(), 302);
    }
    const lang = req.cookies?.get("appstudo-language") || "en";
    const next = `/connect/${encodeURIComponent(appId)}`;
    return Response.redirect(`/${lang}/login?next=${encodeURIComponent(next)}`, 302);
  }

  if (!canConnectToApp(row, user.id)) {
    return new Response("Not Found", { status: 404 });
  }

  const alreadyGranted = dbHasConnectGrant(user.id, appId);
  const confirmed = alreadyGranted || consumeConnectNonce(confirmNonce, user.id, appId);
  if (!confirmed) {
    const lang = req.cookies?.get("appstudo-language") || "en";
    return Response.redirect(
      `/${encodeURIComponent(lang)}/connect/${encodeURIComponent(appId)}`,
      302,
    );
  }
  if (!alreadyGranted) {
    dbCreateConnectGrant(user.id, appId);
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
