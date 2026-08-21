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

function permissionList(
  perms: readonly AppPermission[] | string | null | undefined,
): AppPermission[] {
  return typeof perms === "string" || perms == null ? parseAppPermissions(perms) : [...perms];
}

export function appNeedsAi(perms: readonly AppPermission[] | string | null | undefined): boolean {
  return permissionList(perms).includes("ai");
}

export function appNeedsSync(perms: readonly AppPermission[] | string | null | undefined): boolean {
  return permissionList(perms).includes("sync");
}

export function appNeedsAnyPermission(
  perms: readonly AppPermission[] | string | null | undefined,
): boolean {
  const list = permissionList(perms);
  return list.includes("ai") || list.includes("sync");
}

/**
 * Whether `/permission/:appId` should mint a grant, show consent, or pass through
 * to the runtime (all declared scopes already granted).
 */
export type PermissionConsentAction = "pass" | "consent" | "grant";

export function permissionConsentAction(opts: {
  declared: readonly AppPermission[] | string | null | undefined;
  granted: readonly string[];
  hasConfirmNonce: boolean;
}): PermissionConsentAction {
  const declared = permissionList(opts.declared);
  if (declared.length === 0) return "pass";
  if (opts.hasConfirmNonce) return "grant";
  const granted = new Set(opts.granted);
  for (const scope of declared) {
    if (!granted.has(scope)) return "consent";
  }
  return "pass";
}

/** Infer permissions from generated source (safety net if the model omits them). */
export function detectPermissionsFromCode(code: string): AppPermission[] {
  const found: AppPermission[] = [];
  if (/(?:Abblet|Remiix)\.ai\s*\(/.test(code)) found.push("ai");
  if (/(?:Abblet|Remiix)\.sync\b/.test(code)) found.push("sync");
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
