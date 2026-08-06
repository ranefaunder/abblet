import type { BunRequest } from "bun";
import { dbGetRuntimeToken } from "/server/database/queries/permission";

export type ResolvedRuntimeToken = {
  userId: string;
  appSlug: string;
  expiresAt: string;
};

export function parseBearerToken(req: BunRequest): string | null {
  const header = req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function resolveRuntimeToken(
  tokenId: string | null,
): { ok: true; token: ResolvedRuntimeToken } | { ok: false; reason: "missing" | "not_found" | "expired" } {
  if (!tokenId) return { ok: false, reason: "missing" };
  const row = dbGetRuntimeToken(tokenId);
  if (!row) return { ok: false, reason: "not_found" };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return {
    ok: true,
    token: {
      userId: row.user_id,
      appSlug: row.app_slug,
      expiresAt: row.expires_at,
    },
  };
}
