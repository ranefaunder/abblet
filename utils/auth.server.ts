import type { BunRequest } from "bun";
import {
  dbCreateSession,
  dbGetSession,
  dbUpdateSessionExpiresAt,
} from "/server/database/queries/sessions";
import { dbGetUser } from "/server/database/queries/users";
import type { AuthenticatedUser } from "/types/user-types";
import { apiError } from "/utils/api.server";
import { getPlatformHost, getPlatformOrigin } from "/utils/app-host";

export const SESSION_MAX_AGE_SEC = 180 * 24 * 60 * 60;
const SESSION_EXTEND_AFTER_MS = 24 * 60 * 60 * 1000;
export const AUTH_COOKIE_NAME = "appstudo-auth";

function authCookieSecure(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  try {
    return getPlatformOrigin().startsWith("https://");
  } catch {
    return false;
  }
}

export function shouldExtendSession(expiresAt: string, now = Date.now()): boolean {
  const remainingMs = new Date(expiresAt).getTime() - now;
  return remainingMs < SESSION_MAX_AGE_SEC * 1000 - SESSION_EXTEND_AFTER_MS;
}

/**
 * Legacy Domain attribute used when the session cookie was shared with
 * `*.remiix.app`. Kept only so logout can clear old Domain-scoped cookies.
 */
export function legacyAuthCookieDomain(): string | undefined {
  try {
    const platform = getPlatformHost();
    if (!platform || !platform.includes(".") || platform === "localhost") return undefined;
    return platform;
  } catch {
    return undefined;
  }
}

/** @deprecated Use legacyAuthCookieDomain — cookie is host-only now. */
export function authCookieDomain(): string | undefined {
  return legacyAuthCookieDomain();
}

function setAuthCookie(req: BunRequest, sessionId: string): void {
  // Host-only: no Domain — cookie stays on remiix.app (platform), not app subdomains.
  req.cookies?.set({
    name: AUTH_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    secure: authCookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

/** Clear host-only cookie + legacy Domain-scoped cookie (one-time migration). */
export function clearAuthCookie(req: BunRequest): void {
  req.cookies?.delete(AUTH_COOKIE_NAME);
  const domain = legacyAuthCookieDomain();
  if (domain) {
    req.cookies?.delete({ name: AUTH_COOKIE_NAME, path: "/", domain });
  }
}

function maybeExtendSession(req: BunRequest, sessionId: string, expiresAt: string): void {
  if (!shouldExtendSession(expiresAt)) return;
  const newExpiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000).toISOString();
  dbUpdateSessionExpiresAt(sessionId, newExpiresAt);
  setAuthCookie(req, sessionId);
}

function toAuthenticatedUser(fullUser: NonNullable<ReturnType<typeof dbGetUser>>): AuthenticatedUser {
  return {
    id: fullUser.id,
    email: fullUser.email ?? "",
    createdAt: fullUser.created_at,
    lastLogin: fullUser.last_login,
    nickname: fullUser.nickname ?? null,
    marketingOptIn: (fullUser.marketing_opt_in ?? 0) === 1,
  };
}

export function createAuthSession(req: BunRequest, userId: string): void {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000).toISOString();
  dbCreateSession({ id: sessionId, userId, expiresAt });
  setAuthCookie(req, sessionId);
}

export function getAuthenticatedUser(req: BunRequest): AuthenticatedUser | null {
  try {
    const sessionId = req.cookies?.get(AUTH_COOKIE_NAME);
    if (!sessionId) return null;

    const session = dbGetSession(sessionId);
    if (!session) return null;
    if (new Date(session.expires_at) <= new Date()) return null;

    const fullUser = dbGetUser(session.user_id);
    if (!fullUser) return null;
    // Legacy guest accounts are no longer valid sessions.
    if ((fullUser.is_guest ?? 0) === 1) return null;

    maybeExtendSession(req, sessionId, session.expires_at);

    return toAuthenticatedUser(fullUser);
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

export function withAuth(
  req: BunRequest,
  handler: (user: AuthenticatedUser) => Response | Promise<Response>,
): Response | Promise<Response> {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return apiError({ code: "UNAUTHORIZED", status: 401 });
  }
  return handler(user);
}
