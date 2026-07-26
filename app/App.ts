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
import Home, { HomePath } from "./routes/Home";
import Settings, { SettingsPath } from "./routes/Settings";
import Login, { LoginPath } from "./routes/Login";
import Edit, { EditPath, EditSlugPath } from "./routes/Edit";
import Gallery, { GalleryPath } from "./routes/Gallery";
import GalleryApp, { GalleryAppPath } from "./routes/GalleryApp";
import About, { AboutPath } from "./routes/About";
import NotFound from "./routes/NotFound";
import { spaRouterScope } from "/utils/app-url";

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
            <${Route} path=${HomePath} component=${withLayout(Home)} />
            <${Route} path=${GalleryAppPath} component=${withLayout(GalleryApp)} />
            <${Route} path=${GalleryPath} component=${withLayout(Gallery)} />
            <${Route} path=${AboutPath} component=${withLayout(About)} />
            <${Route} path=${SettingsPath} component=${withLayout(Settings)} />
            <${Route} path=${LoginPath} component=${withLayout(Login)} />
            <${Route} path=${EditSlugPath} component=${withLayout(Edit)} />
            <${Route} path=${EditPath} component=${withLayout(Edit)} />
            <${Route} default component=${withLayout(NotFound)} />
          <//>
        </div>
        <${VisualViewportHeight} />
        <${MetaUpdater} />
        <${DevStores} />
      <//>
    <//>
  `;

  const style = css`
    @scope ([data-scope="App"]) to ([data-scope]) {
      & {
        min-height: 100svh;
        min-height: 100dvh;
      }
    }

    [data-scope="App"] [data-scope="Layout"] {
      flex-grow: 1;
      min-height: 0;
    }
  `;

  return [style, view];
}
