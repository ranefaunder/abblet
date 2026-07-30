import { AUTH_COOKIE_NAME, clearAuthCookie, withAuth } from "/utils/auth.server";
import { dbDeleteSession } from "/server/database/queries/sessions";
import { apiSuccess } from "/utils/api.server";
import type { BunRequest } from "bun";

export default {
  async POST(req: BunRequest) {
    return withAuth(req, async () => {
      const sid = req.cookies?.get(AUTH_COOKIE_NAME);
      if (sid) {
        dbDeleteSession(sid);
      }
      clearAuthCookie(req);
      return apiSuccess({ message: "Logged out successfully" });
    });
  },
};
