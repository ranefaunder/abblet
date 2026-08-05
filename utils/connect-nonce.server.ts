/**
 * One-time connect confirm nonces (in-memory).
 * Shared by `/connect/:appId` and Store Open (`/api/.../prepare-open`).
 */

type ConnectNonce = { userId: string; appId: string; expiresAt: number };

const connectNonces = new Map<string, ConnectNonce>();
const CONNECT_NONCE_TTL_MS = 10 * 60 * 1000;

function pruneConnectNonces(now: number): void {
  for (const [key, value] of connectNonces) {
    if (value.expiresAt <= now) connectNonces.delete(key);
  }
}

/** Mint an unguessable nonce bound to this user + app (consumed once by /connect). */
export function mintConnectNonce(userId: string, appId: string): string {
  const now = Date.now();
  pruneConnectNonces(now);
  const nonce = crypto.randomUUID();
  connectNonces.set(nonce, { userId, appId, expiresAt: now + CONNECT_NONCE_TTL_MS });
  return nonce;
}

/** Consume a nonce; returns true only if it matches user+app and is still valid. */
export function consumeConnectNonce(
  nonce: string | null,
  userId: string,
  appId: string,
): boolean {
  if (!nonce) return false;
  const entry = connectNonces.get(nonce);
  if (!entry) return false;
  connectNonces.delete(nonce);
  if (entry.expiresAt <= Date.now()) return false;
  return entry.userId === userId && entry.appId === appId;
}
