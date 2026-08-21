import type { AppVisibility } from "/types/app-types";
import { isDraftConfig } from "/types/app-config-types";
import { resolveAppConfig } from "/server/database/queries/app-versions";

type AppAccessRow = {
  id: string;
  owner_id: string;
  title: string;
  visibility: AppVisibility;
  latest_version_id: string | null;
  published_version_id: string | null;
};

export type AppViewAccessOpts = {
  /**
   * Request came from `{apps.id}.abblet.com` (UUID capability host).
   * Knowing the UUID grants view of unpublished/draft builds without login.
   */
  viaCapabilityIdHost?: boolean;
};

/**
 * Kuka saa avata sovelluksen (ajo-sivu, module.js).
 * Omistaja aina; julkaistut aina; UUID-capability-host unpublishedille.
 */
export function canViewApp(
  row: AppAccessRow,
  userId: string | null,
  opts?: AppViewAccessOpts,
): boolean {
  if (userId != null && userId === row.owner_id) return true;
  if (row.visibility === "public" && row.published_version_id) return true;
  if (opts?.viaCapabilityIdHost) return true;
  return false;
}

/** Ready = resolvable version is ready with code (owner→latest, else published / capability→latest). */
export function isAppReadyForViewer(
  row: AppAccessRow,
  userId: string | null,
  opts?: AppViewAccessOpts,
): boolean {
  const asOwner =
    (userId != null && userId === row.owner_id) || opts?.viaCapabilityIdHost === true;
  const config = resolveAppConfig(row, { asOwner });
  return config != null && !isDraftConfig(config);
}

/** True when the app has a public published version (numeric slug host). */
export function isAppPublished(row: AppAccessRow): boolean {
  return row.visibility === "public" && Boolean(row.published_version_id);
}
