import type { BunRequest } from "bun";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import {
  PERMISSION_CODE_TTL_SEC,
  dbCreatePermissionCode,
  dbCreatePermissionGrant,
  dbHasPermissionGrant,
} from "/server/database/queries/permission";
import { getAuthenticatedUser } from "/utils/auth.server";
import { appRuntimeOrigin } from "/utils/app-host";
import { consumePermissionNonce } from "/utils/permission-nonce.server";
import {
  parseAppPermissions,
  permissionConsentAction,
  type AppPermission,
} from "/utils/app-permissions";

type PermissionRequest = BunRequest<"/permission/:appId">;

function canGrantPermissionToApp(
  row: { owner_id: string; visibility: string; is_draft: number },
  userId: string,
): boolean {
  if (row.owner_id === userId) return true;
  return row.visibility === "public" && row.is_draft === 0;
}

function grantedScopes(userId: string, appSlug: string, declared: readonly AppPermission[]): string[] {
  const out: string[] = [];
  for (const scope of declared) {
    if (dbHasPermissionGrant(userId, appSlug, scope)) out.push(scope);
  }
  return out;
}

function grantDeclaredScopes(
  userId: string,
  appSlug: string,
  declared: readonly AppPermission[],
  monthlyLimitUsdMicros: number,
): void {
  for (const scope of declared) {
    if (scope === "ai") {
      dbCreatePermissionGrant(userId, appSlug, "ai", monthlyLimitUsdMicros);
    } else if (scope === "sync") {
      dbCreatePermissionGrant(userId, appSlug, "sync", 0);
    }
  }
}

function mintRuntimeCode(userId: string, appSlug: string, returnTo: URL): Response {
  const code = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + PERMISSION_CODE_TTL_SEC * 1000).toISOString();
  dbCreatePermissionCode({
    code,
    userId,
    appSlug,
    expiresAt,
  });
  returnTo.searchParams.set("code", code);
  return Response.redirect(returnTo.toString(), 302);
}

/**
 * GET /permission/:appId — after the user allows permission, issue a one-time code
 * and redirect to the app runtime host root.
 *
 * Query:
 * - `optional=1` — if not signed in, bounce back to the app (legacy; AI apps omit this)
 * - `confirm=<nonce>` — one-time token (from the SPA permission page or Store Open via
 *   prepare-open). Bound to monthly AI budget. Required for first-time grant
 *   (AI and/or sync) unless already granted.
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
  const declared = parseAppPermissions(row.required_permissions);

  if (declared.length === 0) {
    return Response.redirect(returnTo.toString(), 302);
  }

  const user = getAuthenticatedUser(req);
  if (!user) {
    if (optional) {
      return Response.redirect(returnTo.toString(), 302);
    }
    const lang = req.cookies?.get("abblet-language") || req.cookies?.get("appstudo-language") || "en";
    const next = `/permission/${encodeURIComponent(appId)}`;
    return Response.redirect(`/${lang}/login?next=${encodeURIComponent(next)}`, 302);
  }

  if (!canGrantPermissionToApp(row, user.id)) {
    return new Response("Not Found", { status: 404 });
  }

  const nonceResult = consumePermissionNonce(confirmNonce, user.id, appId);
  const action = permissionConsentAction({
    declared,
    granted: grantedScopes(user.id, appId, declared),
    hasConfirmNonce: nonceResult != null,
  });

  if (action === "consent") {
    const lang = req.cookies?.get("abblet-language") || req.cookies?.get("appstudo-language") || "en";
    return Response.redirect(
      `/${encodeURIComponent(lang)}/permission/${encodeURIComponent(appId)}`,
      302,
    );
  }

  if (action === "grant" && nonceResult) {
    grantDeclaredScopes(
      user.id,
      appId,
      declared,
      nonceResult.monthlyLimitUsdMicros,
    );
  }

  return mintRuntimeCode(user.id, appId, returnTo);
}
