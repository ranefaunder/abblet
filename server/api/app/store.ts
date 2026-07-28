import type { BunRequest } from "bun";
import { getAuthenticatedUser } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";
import { dbListGalleryApps, dbListGalleryCategories } from "/server/database/queries/apps";
import { isAppCategory } from "/utils/app-categories";

export default {
  async GET(req: BunRequest) {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const categoryRaw = url.searchParams.get("category")?.trim() ?? "";
    const category = isAppCategory(categoryRaw) ? categoryRaw : null;
    const user = getAuthenticatedUser(req);

    const apps = dbListGalleryApps({
      q,
      category,
      userId: user?.id ?? null,
      limit: 48,
    });
    const categories = dbListGalleryCategories({ q });

    return apiSuccess({ data: { apps, categories, category, q } });
  },
};
