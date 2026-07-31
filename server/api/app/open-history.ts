import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";
import { dbListOpenHistory } from "/server/database/queries/apps";
import { isAppCategory } from "/utils/app-categories";

/** GET /api/:lang/app/open-history — recently opened apps for current user. */
export default {
  async GET(req: BunRequest) {
    return withAuth(req, async (user) => {
      const url = new URL(req.url);
      const categoryRaw = url.searchParams.get("category");
      const excludeRaw = url.searchParams.get("excludeCategory");
      const category =
        categoryRaw && isAppCategory(categoryRaw) ? categoryRaw : null;
      const excludeCategory =
        !category && excludeRaw && isAppCategory(excludeRaw) ? excludeRaw : null;

      const apps = dbListOpenHistory(user.id, { category, excludeCategory });
      return apiSuccess({ data: { apps } });
    });
  },
};
