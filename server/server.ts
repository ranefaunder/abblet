import { initDb } from "./database/db";

import staticRoute from "./routes/static";
import clientJsRoute from "./routes/client-js";
import appRoute from "./routes/app";
import rootRoute from "./routes/root";
import redirectRoute from "./routes/redirect";
import robotsTxt from "./routes/robots-txt";
import sitemapXml from "./routes/sitemap-xml";
import siteWebmanifest from "./routes/site-webmanifest";
import { appPage, appRunRedirect, appModule, shortAppModule, appSubdomainModule } from "./routes/app-page";
import connectRoute from "./routes/connect";
import sdkExchange from "./api/sdk/exchange";
import sdkAi from "./api/sdk/ai";

import authLogout from "./api/auth/logout";
import authRegister from "./api/auth/register";
import authRequestLoginCode from "./api/auth/request-login-code";
import authVerifyLoginCode from "./api/auth/verify-login-code";
import userMe from "./api/user/me";
import userMarketing from "./api/user/marketing";
import appGenerate from "./api/app/generate";
import appGet from "./api/app/get";
import appEdit from "./api/app/edit";
import appUpdateCode from "./api/app/update-code";
import appEditHistory from "./api/app/edit-history";
import appList from "./api/app/list";
import appRegenerateIcon from "./api/app/regenerate-icon";
import appDelete from "./api/app/delete";
import appGallery from "./api/app/gallery";
import appGalleryGet from "./api/app/gallery-get";
import appInstall from "./api/app/install";
import appUninstall from "./api/app/uninstall";
import appPublish from "./api/app/publish";
import appUnpublish from "./api/app/unpublish";
import appRemix from "./api/app/remix";
import meta from "./api/meta";

await initDb();

const server = Bun.serve({
  port: Number(process.env.PORT) || 8090,
  development: process.env.NODE_ENV !== "production",

  routes: {
    "/robots.txt": robotsTxt,
    "/sitemap.xml": sitemapXml,
    "/:lang/site.webmanifest": siteWebmanifest,
    "/.well-known/*": () => new Response(null, { status: 404 }),
    "/api/:lang/meta": meta,
    "/api/:lang/app/generate": appGenerate,
    "/api/:lang/app/get": appGet,
    "/api/:lang/app/edit": appEdit,
    "/api/:lang/app/update-code": appUpdateCode,
    "/api/:lang/app/edit-history": appEditHistory,
    "/api/:lang/app/regenerate-icon": appRegenerateIcon,
    "/api/:lang/app/delete": appDelete,
    "/api/:lang/app/list": appList,
    "/api/:lang/app/gallery": appGallery,
    "/api/:lang/app/gallery-get": appGalleryGet,
    "/api/:lang/app/install": appInstall,
    "/api/:lang/app/uninstall": appUninstall,
    "/api/:lang/app/publish": appPublish,
    "/api/:lang/app/unpublish": appUnpublish,
    "/api/:lang/app/remix": appRemix,
    "/api/:lang/user/me": userMe,
    "/api/:lang/user/marketing": userMarketing,
    "/api/:lang/auth/logout": authLogout,
    "/api/:lang/auth/register": authRegister,
    "/api/:lang/auth/request-login-code": authRequestLoginCode,
    "/api/:lang/auth/verify-login-code": authVerifyLoginCode,
    "/api/sdk/exchange": sdkExchange,
    "/api/sdk/ai": sdkAi,

    "/static/*": staticRoute,
    "/app.js": clientJsRoute,
    "/module.js": appSubdomainModule,
    "/connect/:appId": connectRoute,
    "/:appId/module.js": shortAppModule,
    "/:lang/app/:slug/module.js": appModule,
    "/:lang/app/:slug/run.js": appModule,
    "/:lang/app/:slug/run": appRunRedirect,
    "/:lang/app/:slug": appPage,
    "/:lang": redirectRoute,
    "/:lang/": appRoute,
    "/:lang/*": appRoute,
    "/": rootRoute,
  },
});

console.log(`🚀 Abblet running at http://localhost:${server.port}`);
