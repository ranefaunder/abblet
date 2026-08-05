import type { BunRequest } from "bun";
import { withAuth } from "/utils/auth.server";
import { apiError, apiSuccess } from "/utils/api.server";
import { dbGetAppBySlug, isNumericAppSlug } from "/server/database/queries/apps";
import { dbHasConnectGrant } from "/server/database/queries/connect";
import { mintConnectNonce } from "/utils/connect-nonce.server";
import { connectUrl } from "/utils/app-host";

/**
 * POST /api/:lang/app/prepare-open — Store "Open" as connect consent.
 * Returns a same-origin `/connect/:slug` URL. If the user has not granted this app yet,
 * the URL includes a one-time confirm nonce so /connect skips the consent page
 * (Open click on the Store is the intentional grant). Direct app links still get the
 * consent page when they hit /connect without a nonce.
 */
export default {
  async POST(req: BunRequest) {
    return withAuth(req, async (user) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ code: "INVALID_JSON" });
      }

      const slug =
        typeof (body as { slug?: string }).slug === "string"
          ? (body as { slug: string }).slug.trim()
          : "";
      if (!slug || !isNumericAppSlug(slug)) {
        return apiError({ code: "SLUG_REQUIRED" });
      }

      const row = dbGetAppBySlug(slug);
      if (!row) return apiError({ code: "NOT_FOUND", status: 404 });

      const canConnect =
        row.owner_id === user.id || (row.visibility === "public" && row.is_draft === 0);
      if (!canConnect) {
        return apiError({ code: "NOT_FOUND", status: 404 });
      }

      const base = connectUrl(slug);
      if (dbHasConnectGrant(user.id, slug)) {
        return apiSuccess({ data: { url: base } });
      }

      const nonce = mintConnectNonce(user.id, slug);
      return apiSuccess({
        data: { url: `${base}?confirm=${encodeURIComponent(nonce)}` },
      });
    });
  },
};
