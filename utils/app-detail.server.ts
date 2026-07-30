import type { AppRow } from "/server/database/queries/apps";
import type { AppConfig, AppDetail } from "/types/app-config-types";
import { isDraftConfig } from "/types/app-config-types";
import { resolveAppConfig } from "/server/database/queries/app-versions";

export function buildAppDetail(
  row: AppRow,
  userId: string | null,
  configOverride?: AppConfig | null,
): AppDetail | null {
  const isOwner = userId === row.owner_id;
  const config =
    configOverride ??
    resolveAppConfig(row, { asOwner: isOwner });
  if (!config) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    ownerId: row.owner_id,
    config: { ...config, title: row.title },
    canEdit: isOwner,
    isDraft: row.is_draft === 1 || isDraftConfig(config),
    iconId: row.icon_id ?? null,
    category: row.category ?? config.category ?? null,
    tagline: row.tagline ?? config.tagline ?? null,
    nextPrompt: row.next_prompt ?? null,
  };
}
