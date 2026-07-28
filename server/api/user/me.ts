import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiSuccess } from "/utils/api.server";

export default {
  async GET(req: BunRequest) {
    return withAuth(req, async (authUser) => {
      return apiSuccess({
        data: {
          id: authUser.id,
          email: authUser.email,
          createdAt: authUser.createdAt,
          lastLogin: authUser.lastLogin,
          nickname: authUser.nickname ?? null,
          marketingOptIn: authUser.marketingOptIn === true,
        },
      });
    });
  },
};
