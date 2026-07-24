import type { BunRequest } from "bun";
import {
  dbCreateSession,
  dbGetSession,
  dbUpdateSessionExpiresAt,
} from "/server/database/queries/sessions";
import {
  dbClaimGuestToUser,
  dbCreateGuestUser,
  dbExistsUserNickname,
  dbGetUser,
} from "/server/database/queries/users";
import type { AuthenticatedUser } from "/types/user-types";
import { apiError } from "/utils/api.server";
import { generateNickname } from "/utils/nickname.server";

export const SESSION_MAX_AGE_SEC = 180 * 24 * 60 * 60;
const SESSION_EXTEND_AFTER_MS = 24 * 60 * 60 * 1000;

export function shouldExtendSession(expiresAt: string, now = Date.now()): boolean {
  const remainingMs = new Date(expiresAt).getTime() - now;
  return remainingMs < SESSION_MAX_AGE_SEC * 1000 - SESSION_EXTEND_AFTER_MS;
}

function setAuthCookie(req: BunRequest, sessionId: string): void {
  req.cookies?.set({
    name: "appstudo-auth",
    value: sessionId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
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
    isGuest: (fullUser.is_guest ?? 0) === 1,
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
    const sessionId = req.cookies?.get("appstudo-auth");
    if (!sessionId) return null;

    const session = dbGetSession(sessionId);
    if (!session) return null;
    if (new Date(session.expires_at) <= new Date()) return null;

    maybeExtendSession(req, sessionId, session.expires_at);

    const fullUser = dbGetUser(session.user_id);
    if (!fullUser) return null;

    return toAuthenticatedUser(fullUser);
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

/** Existing session user, or a newly created guest with cookie. */
export function ensureGuestUser(req: BunRequest): AuthenticatedUser {
  const existing = getAuthenticatedUser(req);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const nickname = generateNickname((n) => dbExistsUserNickname(n));
  dbCreateGuestUser({ id, nickname });
  createAuthSession(req, id);
  const user = dbGetUser(id);
  if (!user) throw new Error("Failed to create guest user");
  return toAuthenticatedUser(user);
}

/**
 * If the current session is a guest, move their apps/installs onto targetUserId
 * and switch the auth cookie to the real account.
 */
export function claimGuestSession(req: BunRequest, targetUserId: string): void {
  const current = getAuthenticatedUser(req);
  if (current?.isGuest && current.id !== targetUserId) {
    dbClaimGuestToUser(current.id, targetUserId);
  }
  createAuthSession(req, targetUserId);
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

/** Like withAuth, but creates an anonymous guest session when none exists. */
export function withAuthOrGuest(
  req: BunRequest,
  handler: (user: AuthenticatedUser) => Response | Promise<Response>,
): Response | Promise<Response> {
  const user = ensureGuestUser(req);
  return handler(user);
}

/** Registered (non-guest) accounts only — e.g. Gallery publish. */
export function withRegisteredAuth(
  req: BunRequest,
  handler: (user: AuthenticatedUser) => Response | Promise<Response>,
): Response | Promise<Response> {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return apiError({ code: "UNAUTHORIZED", status: 401 });
  }
  if (user.isGuest) {
    return apiError({
      code: "REGISTER_REQUIRED",
      message: "Sign in to publish apps to the Gallery.",
      status: 403,
    });
  }
  return handler(user);
}
