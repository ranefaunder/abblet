export type AppVisibility = "private" | "public";

export interface AppRecord {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  slug: string;
  visibility: AppVisibility;
  sourceAppId: string | null;
  configJson: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface AppSummary {
  id: string;
  title: string;
  description: string;
  slug: string;
  visibility: AppVisibility;
  ownerId: string;
  ownerNickname: string | null;
  remixCount: number;
  updatedAt: string;
  isDraft: boolean;
  /** Launcher icon reference under /static/app-icons/ (e.g. "abc123.svg"; legacy ids map to .webp) */
  iconId: string | null;
  /** Store category (nullable for older apps). */
  category: string | null;
  /** Short Store marketing line (nullable for older apps). */
  tagline: string | null;
  /** How many users have this app in their library (app_installs). */
  installCount: number;
  /** True when the current user owns the app (independent of install). */
  owned: boolean;
}

/** Public Store listing card. */
export interface StoreAppCard {
  id: string;
  slug: string;
  title: string;
  description: string;
  tagline: string | null;
  category: string | null;
  iconId: string | null;
  ownerNickname: string | null;
  installCount: number;
  remixCount: number;
  /** True when the current user has this app in their library (app_installs). */
  installed: boolean;
  /** True when the current user owns the app (independent of install). */
  isOwner: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

/** Full Store detail payload for /store/:slug. */
export interface StoreAppDetail extends StoreAppCard {
  ownerId: string;
}
