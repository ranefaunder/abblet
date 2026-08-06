/** Declared app capabilities that require a user grant at runtime. */
export const APP_PERMISSIONS = ["ai", "sync"] as const;
export type AppPermission = (typeof APP_PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(APP_PERMISSIONS);

/** Parse JSON permissions from DB; invalid entries dropped. */
export function parseAppPermissions(raw: string | null | undefined): AppPermission[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: AppPermission[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && PERMISSION_SET.has(item) && !out.includes(item as AppPermission)) {
        out.push(item as AppPermission);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeAppPermissions(perms: readonly AppPermission[]): string {
  return JSON.stringify([...new Set(perms)]);
}

export function appNeedsAi(perms: readonly AppPermission[] | string | null | undefined): boolean {
  const list = typeof perms === "string" || perms == null ? parseAppPermissions(perms) : perms;
  return list.includes("ai");
}

/** Infer permissions from generated source (safety net if the model omits them). */
export function detectPermissionsFromCode(code: string): AppPermission[] {
  const found: AppPermission[] = [];
  if (/Remiix\.ai\s*\(/.test(code)) found.push("ai");
  if (/Remiix\.sync\b/.test(code)) found.push("sync");
  return found;
}

/** Union model-declared + code-detected permissions. */
export function mergeAppPermissions(
  declared: readonly AppPermission[] | undefined,
  code: string,
): AppPermission[] {
  const fromCode = detectPermissionsFromCode(code);
  const base = declared ?? [];
  const out: AppPermission[] = [];
  for (const p of [...base, ...fromCode]) {
    if (PERMISSION_SET.has(p) && !out.includes(p)) out.push(p);
  }
  return out;
}
