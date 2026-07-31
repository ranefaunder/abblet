import type { BunRequest } from "bun";
import { getAuthenticatedUser } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";
import { dbListStoreApps, dbListStoreCategories } from "/server/database/queries/apps";
import { isAppCategory } from "/utils/app-categories";

export default {
  async GET(req: BunRequest) {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const categoryRaw = url.searchParams.get("category")?.trim() ?? "";
    const category = isAppCategory(categoryRaw) ? categoryRaw : null;
    const excludeRaw = url.searchParams.get("excludeCategory")?.trim() ?? "";
    const excludeCategory = isAppCategory(excludeRaw) ? excludeRaw : null;
    const user = getAuthenticatedUser(req);

    const apps = dbListStoreApps({
      q,
      category,
      excludeCategory: category ? null : excludeCategory,
      userId: user?.id ?? null,
      limit: 48,
    });
    const categories = dbListStoreCategories({
      q,
      excludeCategory: category ? null : excludeCategory,
    });

    return apiSuccess({ data: { apps, categories, category, excludeCategory, q } });
  },
};
