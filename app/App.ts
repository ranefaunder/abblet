import { hydrate, LocationProvider, ErrorBoundary, Router, Route } from "preact-iso";
import "@preact/signals";
import { h } from "preact";
import { html, css } from "/utils/markup";
import { isClient } from "/utils/env";
import { getLang } from "/utils/lang";
import { ssrContext, ssrFinish } from "/utils/ssr.client";
import { registerServiceWorker } from "/utils/pwa.client";
import { withLayout } from "./Layout";
import MetaUpdater from "./components/headless/MetaUpdater";
import VisualViewportHeight from "./components/headless/VisualViewportHeight";
import { initAuthStore } from "./stores/userStore";
import { initConfigStore } from "./stores/configStore";
import { initI18nStore } from "./stores/i18nStore";
import { initAppStore } from "./stores/appStore";
import { initEditStore } from "./stores/editStore";
import DevStores from "./components/headless/DevStores";
import Apps, { AppsPath } from "./routes/Apps";
import Me, { MePath } from "./routes/Me";
import Login, { LoginPath } from "./routes/Login";
import Create, { CreatePath, CreateSlugPath } from "./routes/Create";
import AppPage, { AppPath, GamePath } from "./routes/App";
import About, { AboutPath } from "./routes/About";
import Splash, { SplashPath } from "./routes/Splash";
import Games, { GamesPath } from "./routes/Games";
import Permissions, { PermissionsPath } from "./routes/Permissions";
import NotFound from "./routes/NotFound";
import { spaRouterScope } from "/utils/app-url";
import LastPathTracker from "./components/headless/LastPathTracker";

function initStores() {
  initConfigStore();
  initAuthStore();
  initI18nStore();
  initAppStore();
  initEditStore();
}

if (isClient) {
  void import("preact/debug").then(() => {
    initStores();
    hydrate(h(App, {}), document.getElementById("app")!);
    registerServiceWorker();
    ssrFinish();
  });
}

export default function App() {
  if (!isClient) {
    initStores();
  }

  const currentLang = isClient
    ? (getLang(window.location.pathname) ?? "en")
    : ssrContext().language;
  const locationScope = spaRouterScope(currentLang ?? "en");

  const view = html`
    <${LocationProvider} scope=${locationScope}>
      <${ErrorBoundary}
        onError=${(error: unknown) => console.error("App error:", error)}
      >
        <div data-scope="App" ui-column>
          <${Router}>
            <${Route} path=${AppPath} component=${withLayout(AppPage, { atmosphere: "detail" })} />
            <${Route} path=${GamePath} component=${withLayout(AppPage, { atmosphere: "games" })} />
            <${Route} path=${AppsPath} component=${withLayout(Apps, { atmosphere: "apps" })} />
            <${Route} path=${GamesPath} component=${withLayout(Games, { atmosphere: "games" })} />
            <${Route} path=${AboutPath} component=${withLayout(About, { atmosphere: "about" })} />
            <${Route} path=${MePath} component=${withLayout(Me, { atmosphere: "me" })} />
            <${Route} path=${LoginPath} component=${withLayout(Login, { atmosphere: "splash" })} />
            <${Route} path=${PermissionsPath} component=${withLayout(Permissions, { tabBar: false, atmosphere: "splash" })} />
            <${Route} path=${CreateSlugPath} component=${withLayout(Create, { atmosphere: "create" })} />
            <${Route} path=${CreatePath} component=${withLayout(Create, { atmosphere: "create" })} />
            <${Route} path=${SplashPath} component=${withLayout(Splash, { tabBar: false, atmosphere: "splash" })} />
            <${Route} default component=${withLayout(NotFound, { atmosphere: "default" })} />
          <//>
        </div>
        <${VisualViewportHeight} />
        <${MetaUpdater} />
        <${LastPathTracker} />
        <${DevStores} />
      <//>
    <//>
  `;

  const style = css`
    @scope ([data-scope="App"]) to ([data-scope]) {
      & {
        min-height: 100dvh;
      }
    }
  `;

  return [style, view];
}
