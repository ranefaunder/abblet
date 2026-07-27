import { signal } from "@preact/signals";
import type { GalleryAppCard, GalleryAppDetail } from "/types/app-types";
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

export const galleryApps = signal<GalleryAppCard[]>([]);
export const galleryCategories = signal<AppCategory[]>([]);
export const galleryLoading = signal(false);
export const galleryQuery = signal("");
export const galleryCategory = signal<AppCategory | null>(null);
export const galleryError = signal<string | null>(null);

export const galleryApp = signal<GalleryAppDetail | null>(null);
export const galleryAppLoading = signal(false);
export const galleryAppError = signal<string | null>(null);
export const galleryBusy = signal(false);

export const installHistory = signal<InstallHistoryItem[]>([]);

function lang(): string {
  return getLang(window.location.pathname) ?? "en";
}

export async function loadGallery(opts?: {
  q?: string;
  category?: AppCategory | null;
}): Promise<void> {
  const q = opts?.q ?? galleryQuery.value;
  const category = opts?.category !== undefined ? opts.category : galleryCategory.value;
  galleryQuery.value = q;
  galleryCategory.value = category;
  galleryLoading.value = true;
  galleryError.value = null;

  try {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);
    const qs = params.toString();
    const result = await apiFetch<{ apps: GalleryAppCard[]; categories: AppCategory[] }>(
      `/api/${lang()}/app/gallery${qs ? `?${qs}` : ""}`,
    );
    if (!result.success) {
      galleryError.value = result.error.message ?? result.error.code;
      galleryApps.value = [];
      galleryCategories.value = [];
      return;
    }
    galleryApps.value = result.data.apps;
    galleryCategories.value = (result.data.categories ?? []).filter(isAppCategory);
  } finally {
    galleryLoading.value = false;
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

export async function loadGalleryApp(slug: string): Promise<void> {
  galleryAppLoading.value = true;
  galleryAppError.value = null;
  galleryApp.value = null;
  try {
    const result = await apiFetch<{ app: GalleryAppDetail }>(
      `/api/${lang()}/app/gallery-get?slug=${encodeURIComponent(slug)}`,
    );
    if (!result.success) {
      galleryAppError.value = result.error.message ?? result.error.code;
      return;
    }
    galleryApp.value = result.data.app;
  } finally {
    galleryAppLoading.value = false;
  }
}

function markInstalledInUi(slug: string): void {
  if (galleryApp.value?.slug === slug) {
    galleryApp.value = {
      ...galleryApp.value,
      installed: true,
      installCount: galleryApp.value.installCount + (galleryApp.value.installed ? 0 : 1),
    };
  }
  galleryApps.value = galleryApps.value.map((a) =>
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
  const iconId = galleryApp.value?.slug === slug ? galleryApp.value.iconId : null;
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

/** @deprecated Prefer openAppInstall — kept for call sites that await. */
export async function installGalleryApp(slug: string): Promise<boolean> {
  if (galleryBusy.value) return false;
  galleryBusy.value = true;
  galleryAppError.value = null;
  try {
    openAppInstall(slug);
    return true;
  } finally {
    galleryBusy.value = false;
  }
}

/** Remix a public app into an editable clone. Returns the new AppDetail or null. */
export async function remixGalleryApp(slug: string): Promise<AppDetail | null> {
  if (galleryBusy.value) return null;
  if (!isLoggedIn()) {
    openLoginDialog();
    return null;
  }
  galleryBusy.value = true;
  galleryAppError.value = null;
  try {
    const result = await apiFetch<{ app: AppDetail }>(`/api/${lang()}/app/remix`, {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    if (!result.success) {
      if (result.status === 401) openLoginDialog();
      galleryAppError.value = result.error.message ?? result.error.code;
      return null;
    }
    void loadApps();
    return result.data.app;
  } finally {
    galleryBusy.value = false;
  }
}

export function clearGalleryApp(): void {
  galleryApp.value = null;
  galleryAppError.value = null;
  galleryAppLoading.value = false;
  galleryBusy.value = false;
}
