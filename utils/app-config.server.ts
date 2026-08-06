import type { AppConfig } from "/types/app-config-types";
import {
  parseAppPermissions,
  serializeAppPermissions,
  type AppPermission,
} from "/utils/app-permissions";

export type AppVersionRow = {
  id: string;
  app_id: string;
  version_number: number;
  status: "ready" | "draft" | "error";
  prompt: string;
  /** Short History line: what changed in this version (not the original create prompt). */
  summary: string;
  description: string;
  tagline: string | null;
  category: string | null;
  tag_name: string;
  code: string;
  required_permissions?: string;
  created_from_version_id: string | null;
  created_at: string;
};

export type AppVersionFields = {
  status: AppConfig["status"];
  prompt: string;
  description: string;
  tagline: string | null;
  category: string | null;
  tagName: string;
  code: string;
  permissions: AppPermission[];
};

/** Build API AppConfig; title always comes from the owned app project, not the version. */
export function versionRowToAppConfig(row: AppVersionRow, title: string): AppConfig {
  const permissions = parseAppPermissions(row.required_permissions);
  return {
    version: 2,
    status: row.status,
    prompt: row.prompt,
    title,
    description: row.description,
    ...(row.tagline ? { tagline: row.tagline } : {}),
    ...(row.category
      ? { category: row.category as AppConfig["category"] }
      : {}),
    tagName: row.tag_name,
    code: row.code,
    permissions,
  };
}

export function appConfigToVersionFields(config: AppConfig): AppVersionFields {
  return {
    status: config.status,
    prompt: config.prompt,
    description: config.description,
    tagline: config.tagline ?? null,
    category: config.category ?? null,
    tagName: config.tagName,
    code: config.code,
    permissions: (config.permissions ?? []) as AppPermission[],
  };
}

export function permissionsJson(fields: AppVersionFields): string {
  return serializeAppPermissions(fields.permissions);
}
