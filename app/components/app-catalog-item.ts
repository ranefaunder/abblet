/** Shared item shape for AppSlider, AppGrid, and AppList. */
export type AppCatalogItem = {
  slug: string;
  title: string;
  iconId: string | null;
  href: string;
  subtitle?: string;
};
