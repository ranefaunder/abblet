import { dbGetAppById, dbGetAppBySlug, type AppRow } from "/server/database/queries/apps";
import {
  getRequestHost,
  parseAppRuntimeLabel,
  parseAppRuntimeOrigin,
  type AppRuntimeLabel,
} from "/utils/app-host";

export function resolveAppFromRuntimeLabel(label: AppRuntimeLabel | null): AppRow | null {
  if (!label) return null;
  if (label.kind === "slug") return dbGetAppBySlug(label.value);
  return dbGetAppById(label.value);
}

export function resolveAppFromHost(hostHeader: string): {
  row: AppRow;
  label: AppRuntimeLabel;
  viaCapabilityIdHost: boolean;
} | null {
  const label = parseAppRuntimeLabel(hostHeader);
  const row = resolveAppFromRuntimeLabel(label);
  if (!label || !row) return null;
  return {
    row,
    label,
    viaCapabilityIdHost: label.kind === "id" && label.value === row.id.toLowerCase(),
  };
}

export function resolveAppFromRequestHost(req: { headers: Headers; url?: string }) {
  return resolveAppFromHost(getRequestHost(req));
}

export function resolveAppFromOrigin(originHeader: string | null): {
  row: AppRow;
  label: AppRuntimeLabel;
  viaCapabilityIdHost: boolean;
} | null {
  const label = parseAppRuntimeOrigin(originHeader);
  const row = resolveAppFromRuntimeLabel(label);
  if (!label || !row) return null;
  return {
    row,
    label,
    viaCapabilityIdHost: label.kind === "id" && label.value === row.id.toLowerCase(),
  };
}
