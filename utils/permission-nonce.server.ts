/**
 * One-time permission confirm nonces (in-memory).
 * Shared by `/permission/:appId` and Store Open (`/api/.../prepare-open`).
 */

type PermissionNonce = {
  userId: string;
  appId: string;
  expiresAt: number;
  /** Monthly AI budget for this app (USD micros). */
  monthlyLimitUsdMicros: number;
};

const permissionNonces = new Map<string, PermissionNonce>();
const PERMISSION_NONCE_TTL_MS = 10 * 60 * 1000;

function prunePermissionNonces(now: number): void {
  for (const [key, value] of permissionNonces) {
    if (value.expiresAt <= now) permissionNonces.delete(key);
  }
}

/** Mint an unguessable nonce bound to this user + app (+ optional monthly budget). */
export function mintPermissionNonce(
  userId: string,
  appId: string,
  monthlyLimitUsdMicros: number,
): string {
  const now = Date.now();
  prunePermissionNonces(now);
  const nonce = crypto.randomUUID();
  permissionNonces.set(nonce, {
    userId,
    appId,
    expiresAt: now + PERMISSION_NONCE_TTL_MS,
    monthlyLimitUsdMicros: Math.max(0, Math.floor(monthlyLimitUsdMicros)),
  });
  return nonce;
}

/**
 * Consume a nonce; returns the bound monthly limit when valid.
 * Invalid / mismatched → null.
 */
export function consumePermissionNonce(
  nonce: string | null,
  userId: string,
  appId: string,
): { monthlyLimitUsdMicros: number } | null {
  if (!nonce) return null;
  const entry = permissionNonces.get(nonce);
  if (!entry) return null;
  permissionNonces.delete(nonce);
  if (entry.expiresAt <= Date.now()) return null;
  if (entry.userId !== userId || entry.appId !== appId) return null;
  return { monthlyLimitUsdMicros: entry.monthlyLimitUsdMicros };
}
