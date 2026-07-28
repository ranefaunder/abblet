import { signal } from "@preact/signals";
import type { StoreAppCard, StoreAppDetail } from "/types/app-types";
import type { AppDetail } from "/types/app-config-types";
import { apiFetch } from "/utils/api.client";
import { getLang } from "/utils/lang";
import { isAppCategory, type AppCategory } from "/utils/app-categories";
import { loadApps } from "/app/stores/appStore";
import { isLoggedIn, openLoginDialog } from "/app/stores/userStore";
import { appInstallUrl } from "/utils/app-url";
import { precacheInstalledApp } from "/utils/offline-apps.client";

export type InstallHistoryItem = {
  slug: string;
  title: string;
  tagline: string | null;
  iconId: string | null;
  installedAt: string;
};

export const storeApps = signal<StoreAppCard[]>([]);
export const storeCategories = signal<AppCategory[]>([]);
export const storeLoading = signal(false);
export const storeQuery = signal("");
export const storeCategory = signal<AppCategory | null>(null);
export const storeError = signal<string | null>(null);

export const storeApp = signal<StoreAppDetail | null>(null);
export const storeAppLoading = signal(false);
export const storeAppError = signal<string | null>(null);
export const storeBusy = signal(false);

export const installHistory = signal<InstallHistoryItem[]>([]);

function lang(): string {
  return getLang(window.location.pathname) ?? "en";
}

export async function loadStore(opts?: {
  q?: string;
  category?: AppCategory | null;
}): Promise<void> {
  const q = opts?.q ?? storeQuery.value;
  const category = opts?.category !== undefined ? opts.category : storeCategory.value;
  storeQuery.value = q;
  storeCategory.value = category;
  storeLoading.value = true;
  storeError.value = null;

  try {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);
    const qs = params.toString();
    const result = await apiFetch<{ apps: StoreAppCard[]; categories: AppCategory[] }>(
      `/api/${lang()}/app/store${qs ? `?${qs}` : ""}`,
    );
    if (!result.success) {
      storeError.value = result.error.message ?? result.error.code;
      storeApps.value = [];
      storeCategories.value = [];
      return;
    }
    storeApps.value = result.data.apps;
    storeCategories.value = (result.data.categories ?? []).filter(isAppCategory);
  } finally {
    storeLoading.value = false;
  }
}

export async function loadInstallHistory(): Promise<void> {
  if (!isLoggedIn()) {
    installHistory.value = [];
    return;
  }
  const result = await apiFetch<{ apps: InstallHistoryItem[] }>(
    `/api/${lang()}/app/install-history`,
  );
  if (!result.success) {
    installHistory.value = [];
    return;
  }
  installHistory.value = result.data.apps;
}

export async function loadStoreApp(slug: string): Promise<void> {
  storeAppLoading.value = true;
  storeAppError.value = null;
  storeApp.value = null;
  try {
    const result = await apiFetch<{ app: StoreAppDetail }>(
      `/api/${lang()}/app/store-get?slug=${encodeURIComponent(slug)}`,
    );
    if (!result.success) {
      storeAppError.value = result.error.message ?? result.error.code;
      return;
    }
    storeApp.value = result.data.app;
  } finally {
    storeAppLoading.value = false;
  }
}

function markInstalledInUi(slug: string): void {
  if (storeApp.value?.slug === slug) {
    storeApp.value = {
      ...storeApp.value,
      installed: true,
      installCount: storeApp.value.installCount + (storeApp.value.installed ? 0 : 1),
    };
  }
  storeApps.value = storeApps.value.map((a) =>
    a.slug === slug
      ? {
          ...a,
          installed: true,
          installCount: a.installed ? a.installCount : a.installCount + 1,
        }
      : a,
  );
}

/** Record library install for signed-in users (history). Does not open PWA install UI. */
export async function recordLibraryInstall(slug: string): Promise<boolean> {
  if (!isLoggedIn()) return false;
  const result = await apiFetch<{
    slug: string;
    installed: boolean;
    installedAt?: string;
  }>(`/api/${lang()}/app/install`, {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
  if (!result.success) return false;
  markInstalledInUi(slug);
  const iconId = storeApp.value?.slug === slug ? storeApp.value.iconId : null;
  void precacheInstalledApp({ slug, iconId }, lang());
  void loadApps();
  void loadInstallHistory();
  return true;
}

/**
 * Open the app's PWA install page (`/install`).
 * Signed-in users also get a library install recorded in the background.
 */
export function openAppInstall(slug: string): void {
  if (isLoggedIn()) {
    void recordLibraryInstall(slug);
  }
  window.location.href = appInstallUrl(lang(), slug);
}

/** Remix a public app into an editable clone. Returns the new AppDetail or null. */
export async function remixStoreApp(slug: string): Promise<AppDetail | null> {
  if (storeBusy.value) return null;
  if (!isLoggedIn()) {
    openLoginDialog();
    return null;
  }
  storeBusy.value = true;
  storeAppError.value = null;
  try {
    const result = await apiFetch<{ app: AppDetail }>(`/api/${lang()}/app/remix`, {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    if (!result.success) {
      if (result.status === 401) openLoginDialog();
      storeAppError.value = result.error.message ?? result.error.code;
      return null;
    }
    void loadApps();
    return result.data.app;
  } finally {
    storeBusy.value = false;
  }
}

export function clearStoreApp(): void {
  storeApp.value = null;
  storeAppError.value = null;
  storeAppLoading.value = false;
  storeBusy.value = false;
}
