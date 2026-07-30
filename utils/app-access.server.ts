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

/**
 * Kuka saa avata sovelluksen (ajo-sivu, module.js).
 * Omistaja aina; julkaistut aina.
 */
export function canViewApp(row: AppAccessRow, userId: string | null): boolean {
  if (userId != null && userId === row.owner_id) return true;
  if (row.visibility === "public" && row.published_version_id) return true;
  return false;
}

/** Ready = resolvable version is ready with code (owner→latest, else published). */
export function isAppReadyForViewer(row: AppAccessRow, userId: string | null): boolean {
  const asOwner = userId != null && userId === row.owner_id;
  const config = resolveAppConfig(row, { asOwner });
  return config != null && !isDraftConfig(config);
}
