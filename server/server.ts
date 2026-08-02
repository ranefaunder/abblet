import { initDb } from "./database/db";
import { isAppOnlyHost, redirectLegacyHost } from "/utils/app-host";
import { apiError } from "/utils/api.server";

import staticRoute from "./routes/static";
import clientJsRoute from "./routes/client-js";
import appRoute from "./routes/app";
import rootRoute from "./routes/root";
import redirectRoute from "./routes/redirect";
import {
  accountToMe,
  editSlugToCreate,
  editToCreate,
  storeSlugToApps,
  storeToApps,
} from "./routes/legacy-redirect";
import robotsTxt from "./routes/robots-txt";
import sitemapXml from "./routes/sitemap-xml";
import siteWebmanifest from "./routes/site-webmanifest";
import appManifest from "./routes/app-manifest";
import { appPage, appRunRedirect, appModule, shortAppModule, appSubdomainModule, appSubdomainInstallPage } from "./routes/app-page";
import connectRoute from "./routes/connect";
import sdkExchange from "./api/sdk/exchange";
import sdkAi from "./api/sdk/ai";
import sdkSession from "./api/sdk/session";
import sdkRemix from "./api/sdk/remix";
import credits from "./api/credits";
import billingStatus from "./api/billing/status";
import billingRedeemGift from "./api/billing/redeem-gift";

import authLogout from "./api/auth/logout";
import authRegister from "./api/auth/register";
import authRequestLoginCode from "./api/auth/request-login-code";
import authVerifyLoginCode from "./api/auth/verify-login-code";
import userMe from "./api/user/me";
import userMarketing from "./api/user/marketing";
import appGenerate from "./api/app/generate";
import appGet from "./api/app/get";
import appEdit from "./api/app/edit";
import appEditHistory from "./api/app/edit-history";
import appList from "./api/app/list";
import appRegenerateIcon from "./api/app/regenerate-icon";
import appDelete from "./api/app/delete";
import appStore from "./api/app/store";
import appStoreGet from "./api/app/store-get";
import appInstall from "./api/app/install";
import appInstallHistory from "./api/app/install-history";
import appOpen from "./api/app/open";
import appOpenHistory from "./api/app/open-history";
import appUninstall from "./api/app/uninstall";
import sdkOpen from "./api/sdk/open";
import sdkCredits from "./api/sdk/credits";
import appPublish from "./api/app/publish";
import appUnpublish from "./api/app/unpublish";
import appRemix from "./api/app/remix";
import appVersions from "./api/app/versions";
import appRestore from "./api/app/restore";
import meta from "./api/meta";

await initDb();

type RouteHandler = (req: Request, ...args: unknown[]) => Response | Promise<Response>;
type RouteMethods = Record<string, RouteHandler | undefined>;

function wrapHandler(
  handler: RouteHandler | RouteMethods,
  guard: (req: Request) => Response | null,
): RouteHandler | RouteMethods {
  if (typeof handler === "function") {
    return (req, ...args) => {
      const blocked = guard(req);
      if (blocked) return blocked;
      return handler(req, ...args);
    };
  }

  const wrapped: RouteMethods = {};
  for (const [method, fn] of Object.entries(handler)) {
    if (typeof fn !== "function") {
      wrapped[method] = fn;
      continue;
    }
    wrapped[method] = (req, ...args) => {
      const blocked = guard(req);
      if (blocked) return blocked;
      return fn(req, ...args);
    };
  }
  return wrapped;
}

/** Platform `/api/:lang/*` must not run on app subdomains. */
function platformApiOnly(handler: RouteHandler | RouteMethods): RouteHandler | RouteMethods {
  return wrapHandler(handler, (req) => {
    const host = req.headers.get("host") ?? "";
    if (isAppOnlyHost(host)) {
      return apiError({ code: "NOT_FOUND", status: 404 });
    }
    return null;
  });
}

function withLegacyHostRedirect(
  handler: RouteHandler | RouteMethods,
): RouteHandler | RouteMethods {
  if (typeof handler === "function") {
    return (req, ...args) => {
      const redirected = redirectLegacyHost(req);
      if (redirected) return redirected;
      return handler(req, ...args);
    };
  }

  const wrapped: RouteMethods = {};
  for (const [method, fn] of Object.entries(handler)) {
    if (typeof fn !== "function") {
      wrapped[method] = fn;
      continue;
    }
    wrapped[method] = (req, ...args) => {
      const redirected = redirectLegacyHost(req);
      if (redirected) return redirected;
      return fn(req, ...args);
    };
  }
  return wrapped;
}

function wrapRoutes<T extends Record<string, RouteHandler | RouteMethods>>(
  routes: T,
  opts?: { platformApi?: boolean },
): T {
  const out = {} as T;
  for (const [path, handler] of Object.entries(routes)) {
    let next: RouteHandler | RouteMethods = handler;
    if (opts?.platformApi) next = platformApiOnly(next);
    (out as Record<string, RouteHandler | RouteMethods>)[path] = withLegacyHostRedirect(next);
  }
  return out;
}

const platformApiRoutes = wrapRoutes(
  {
    "/api/:lang/meta": meta,
    "/api/:lang/app/generate": appGenerate,
    "/api/:lang/app/edit": appEdit,
    "/api/:lang/app/edit-history": appEditHistory,
    "/api/:lang/app/regenerate-icon": appRegenerateIcon,
    "/api/:lang/app/delete": appDelete,
    "/api/:lang/app/list": appList,
    "/api/:lang/app/store": appStore,
    "/api/:lang/app/store-get": appStoreGet,
    "/api/:lang/app/install": appInstall,
    "/api/:lang/app/install-history": appInstallHistory,
    "/api/:lang/app/open": appOpen,
    "/api/:lang/app/open-history": appOpenHistory,
    "/api/:lang/app/uninstall": appUninstall,
    "/api/:lang/app/publish": appPublish,
    "/api/:lang/app/unpublish": appUnpublish,
    "/api/:lang/app/remix": appRemix,
    "/api/:lang/app/versions": appVersions,
    "/api/:lang/app/restore": appRestore,
    "/api/:lang/user/me": userMe,
    "/api/:lang/user/marketing": userMarketing,
    "/api/:lang/credits": credits,
    "/api/:lang/billing/status": billingStatus,
    "/api/:lang/billing/redeem-gift": billingRedeemGift,
    "/api/:lang/auth/logout": authLogout,
    "/api/:lang/auth/register": authRegister,
    "/api/:lang/auth/request-login-code": authRequestLoginCode,
    "/api/:lang/auth/verify-login-code": authVerifyLoginCode,
  },
  { platformApi: true },
);

const server = Bun.serve({
  port: Number(process.env.PORT) || 8090,
  development: process.env.NODE_ENV !== "production",

  routes: {
    ...wrapRoutes({
      "/robots.txt": robotsTxt,
      "/sitemap.xml": sitemapXml,
      "/:lang/site.webmanifest": siteWebmanifest,
      "/manifest.webmanifest": appManifest,
      "/install": appSubdomainInstallPage,
      "/.well-known/*": () => new Response(null, { status: 404 }),
      // Building poll + UUID capability preview (no platform cookie on app hosts).
      "/api/:lang/app/get": appGet,
      "/api/sdk/exchange": sdkExchange,
      "/api/sdk/ai": sdkAi,
      "/api/sdk/session": sdkSession,
      "/api/sdk/open": sdkOpen,
      "/api/sdk/credits": sdkCredits,
      "/api/sdk/remix": sdkRemix,

      "/static/*": staticRoute,
      "/app.js": clientJsRoute,
      "/module.js": appSubdomainModule,
      "/connect/:appId": connectRoute,
      "/:appId/module.js": shortAppModule,
      "/:lang/app/:slug/module.js": appModule,
      "/:lang/app/:slug/run.js": appModule,
      "/:lang/app/:slug/run": appRunRedirect,
      "/:lang/app/:slug": appPage,
      "/:lang/store": storeToApps,
      "/:lang/store/": storeToApps,
      "/:lang/store/:slug": storeSlugToApps,
      "/:lang/edit": editToCreate,
      "/:lang/edit/": editToCreate,
      "/:lang/edit/:slug": editSlugToCreate,
      "/:lang/account": accountToMe,
      "/:lang/account/": accountToMe,
      "/:lang": redirectRoute,
      "/:lang/": appRoute,
      "/:lang/*": appRoute,
      "/": rootRoute,
    }),
    ...platformApiRoutes,
  },
});

console.log(`🚀 Remiix running at http://localhost:${server.port}`);
