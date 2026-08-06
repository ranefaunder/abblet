import type { BunRequest } from "bun";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import {
  DEFAULT_AI_MONTHLY_LIMIT_USD_MICROS,
  PERMISSION_CODE_TTL_SEC,
  dbCreatePermissionCode,
  dbCreatePermissionGrant,
  dbHasPermissionGrant,
} from "/server/database/queries/permission";
import { getAuthenticatedUser } from "/utils/auth.server";
import { appRuntimeOrigin } from "/utils/app-host";
import { consumePermissionNonce } from "/utils/permission-nonce.server";
import { appNeedsAi } from "/utils/app-permissions";

type PermissionRequest = BunRequest<"/permission/:appId">;

function canGrantPermissionToApp(
  row: { owner_id: string; visibility: string; is_draft: number },
  userId: string,
): boolean {
  if (row.owner_id === userId) return true;
  return row.visibility === "public" && row.is_draft === 0;
}

/**
 * GET /permission/:appId — after the user allows AI permission, issue a one-time code
 * and redirect to the app runtime host root.
 *
 * Query:
 * - `optional=1` — if not signed in, bounce back to the app (legacy; AI apps omit this)
 * - `confirm=<nonce>` — one-time token (from the SPA permission page or Store Open via
 *   prepare-open). Bound to monthly AI budget. Required for first-time AI grant
 *   unless already granted.
 */
export default function permissionRoute(req: PermissionRequest): Response {
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

  // Non-AI apps never need a runtime token — send straight to the app.
  if (!appNeedsAi(row.required_permissions)) {
    return Response.redirect(returnTo.toString(), 302);
  }

  const user = getAuthenticatedUser(req);
  if (!user) {
    if (optional) {
      return Response.redirect(returnTo.toString(), 302);
    }
    const lang = req.cookies?.get("appstudo-language") || "en";
    const next = `/permission/${encodeURIComponent(appId)}`;
    return Response.redirect(`/${lang}/login?next=${encodeURIComponent(next)}`, 302);
  }

  if (!canGrantPermissionToApp(row, user.id)) {
    return new Response("Not Found", { status: 404 });
  }

  const alreadyGranted = dbHasPermissionGrant(user.id, appId, "ai");
  const nonceResult = alreadyGranted
    ? null
    : consumePermissionNonce(confirmNonce, user.id, appId);
  const confirmed = alreadyGranted || nonceResult != null;
  if (!confirmed) {
    const lang = req.cookies?.get("appstudo-language") || "en";
    return Response.redirect(
      `/${encodeURIComponent(lang)}/permission/${encodeURIComponent(appId)}`,
      302,
    );
  }
  if (!alreadyGranted) {
    dbCreatePermissionGrant(
      user.id,
      appId,
      "ai",
      nonceResult?.monthlyLimitUsdMicros ?? DEFAULT_AI_MONTHLY_LIMIT_USD_MICROS,
    );
  }

  const code = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + PERMISSION_CODE_TTL_SEC * 1000).toISOString();
  dbCreatePermissionCode({
    code,
    userId: user.id,
    appSlug: appId,
    expiresAt,
  });

  returnTo.searchParams.set("code", code);
  return Response.redirect(returnTo.toString(), 302);
}
