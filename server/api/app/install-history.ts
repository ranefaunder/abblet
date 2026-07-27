import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";
import { dbListInstallHistory } from "/server/database/queries/apps";

/** GET /api/:lang/app/install-history — previously installed apps for current user. */
export default {
  async GET(req: BunRequest) {
    return withAuth(req, async (user) => {
      const apps = dbListInstallHistory(user.id);
      return apiSuccess({ data: { apps } });
    });
  },
};
