import { describe, expect, test } from "bun:test";
import {
  appOrigin,
  connectUrl,
  getAppRuntimeHost,
  getAppRuntimeHosts,
  isAppOnlyHost,
  isAppRuntimeApex,
  isAppRuntimeHost,
  isAppRuntimeOrigin,
  isOriginForAppSlug,
  isPlatformHost,
  parseAppSubdomain,
  redirectLegacyHost,
  shouldBounceRuntimeApexToPlatform,
  stripHostPort,
} from "/utils/app-host";
import { appModuleUrl, appPageUrl, appRuntimeModulePath } from "/utils/app-url";

describe("app-host", () => {
  test("stripHostPort removes port", () => {
    expect(stripHostPort("34211.app.localhost:8090")).toBe("34211.app.localhost");
    expect(stripHostPort("localhost:8090")).toBe("localhost");
    expect(stripHostPort("rmix.app")).toBe("rmix.app");
  });

  test("parseAppSubdomain matches numeric slug", () => {
    expect(parseAppSubdomain("34211.app.localhost:8090")).toBe("34211");
    expect(parseAppSubdomain("foo.app.localhost")).toBeNull();
    expect(parseAppSubdomain("app.localhost")).toBeNull();
    expect(parseAppSubdomain("12.app.localhost")).toBeNull(); // too short
    expect(parseAppSubdomain("34211.abblet.app")).toBeNull(); // wrong runtime host in this env
  });

  test("apex and runtime host detection", () => {
    expect(isAppRuntimeApex("app.localhost:8090")).toBe(true);
    expect(isAppRuntimeApex("34211.app.localhost:8090")).toBe(false);
    expect(isAppRuntimeHost("foo.app.localhost")).toBe(true);
    expect(isAppRuntimeHost("localhost:8090")).toBe(false);
  });

  test("appOrigin includes port from PLATFORM_ORIGIN", () => {
    expect(appOrigin("34211")).toBe("http://34211.app.localhost:8090");
  });
  test("connectUrl points at platform", () => {
    expect(connectUrl("34211")).toBe("http://localhost:8090/connect/34211");
  });

  test("isOriginForAppSlug", () => {
    expect(isOriginForAppSlug("http://34211.app.localhost:8090", "34211")).toBe(true);
    expect(isOriginForAppSlug("http://99999.app.localhost:8090", "34211")).toBe(false);
    expect(isAppRuntimeOrigin("http://34211.app.localhost:8090")).toBe("34211");
  });

  test("comma-separated APP_RUNTIME_HOST accepts aliases", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "rmix.app,abblet.app";
    process.env.PLATFORM_ORIGIN = "https://rmix.app";
    try {
      expect(getAppRuntimeHosts()).toEqual(["rmix.app", "abblet.app"]);
      expect(getAppRuntimeHost()).toBe("rmix.app");
      expect(parseAppSubdomain("73850.rmix.app")).toBe("73850");
      expect(parseAppSubdomain("73850.abblet.app")).toBe("73850");
      expect(isAppRuntimeHost("73850.rmix.app")).toBe(true);
      expect(isAppRuntimeApex("rmix.app")).toBe(true);
      expect(appOrigin("73850")).toBe("https://73850.rmix.app");
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("shared platform+runtime apex does not bounce (no redirect loop)", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "rmix.app";
    process.env.PLATFORM_ORIGIN = "https://rmix.app";
    try {
      expect(isPlatformHost("rmix.app")).toBe(true);
      expect(isAppRuntimeApex("rmix.app")).toBe(true);
      expect(shouldBounceRuntimeApexToPlatform("rmix.app")).toBe(false);
      expect(isAppOnlyHost("rmix.app")).toBe(false);
      expect(isAppOnlyHost("73850.rmix.app")).toBe(true);
      expect(parseAppSubdomain("73850.rmix.app")).toBe("73850");
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("redirectLegacyHost maps abblet domains to rmix", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "rmix.app";
    process.env.PLATFORM_ORIGIN = "https://rmix.app";
    try {
      const platform = redirectLegacyHost({
        headers: new Headers({ host: "abblet.com" }),
        url: "https://abblet.com/en/about?x=1",
      });
      expect(platform?.status).toBe(301);
      expect(platform?.headers.get("location")).toBe("https://rmix.app/en/about?x=1");

      const app = redirectLegacyHost({
        headers: new Headers({ host: "73850.abblet.app" }),
        url: "https://73850.abblet.app/install",
      });
      expect(app?.status).toBe(301);
      expect(app?.headers.get("location")).toBe("https://73850.rmix.app/install");

      const apex = redirectLegacyHost({
        headers: new Headers({ host: "abblet.app" }),
        url: "https://abblet.app/",
      });
      expect(apex?.headers.get("location")).toBe("https://rmix.app/");

      expect(
        redirectLegacyHost({
          headers: new Headers({ host: "rmix.app" }),
          url: "https://rmix.app/en/",
        }),
      ).toBeNull();
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });
});

describe("app-url", () => {
  test("canonical subdomain URLs", () => {
    expect(appPageUrl("en", "34211")).toBe("http://34211.app.localhost:8090/");
    expect(appModuleUrl("en", "34211")).toBe("http://34211.app.localhost:8090/module.js");
    expect(appRuntimeModulePath()).toBe("/module.js");
  });
});
