import { describe, expect, test } from "bun:test";
import {
  appOrigin,
  appRuntimeOrigin,
  connectUrl,
  getAppRuntimeHost,
  getAppRuntimeHosts,
  isAppOnlyHost,
  isAppRuntimeApex,
  isAppRuntimeHost,
  isAppRuntimeOrigin,
  isOriginForApp,
  isOriginForAppSlug,
  isPlatformHost,
  parseAppRuntimeLabel,
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
    expect(stripHostPort("remiix.app")).toBe("remiix.app");
  });

  test("parseAppSubdomain matches numeric slug", () => {
    expect(parseAppSubdomain("34211.app.localhost:8090")).toBe("34211");
    expect(parseAppSubdomain("foo.app.localhost")).toBeNull();
    expect(parseAppSubdomain("app.localhost")).toBeNull();
    expect(parseAppSubdomain("12.app.localhost")).toBeNull(); // too short
    expect(parseAppSubdomain("34211.abblet.app")).toBeNull(); // wrong runtime host in this env
  });

  test("parseAppRuntimeLabel matches slug and UUID", () => {
    expect(parseAppRuntimeLabel("34211.app.localhost:8090")).toEqual({
      kind: "slug",
      value: "34211",
    });
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(parseAppRuntimeLabel(`${id}.app.localhost`)).toEqual({
      kind: "id",
      value: id,
    });
    expect(parseAppRuntimeLabel("not-a-uuid.app.localhost")).toBeNull();
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

  test("isOriginForAppSlug and isOriginForApp", () => {
    expect(isOriginForAppSlug("http://34211.app.localhost:8090", "34211")).toBe(true);
    expect(isOriginForAppSlug("http://99999.app.localhost:8090", "34211")).toBe(false);
    expect(isAppRuntimeOrigin("http://34211.app.localhost:8090")).toBe("34211");
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(
      isOriginForApp(`http://${id}.app.localhost:8090`, { id, slug: "34211" }),
    ).toBe(true);
    expect(
      isOriginForApp("http://34211.app.localhost:8090", { id, slug: "34211" }),
    ).toBe(true);
  });

  test("appRuntimeOrigin uses UUID when unpublished", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(
      appRuntimeOrigin({
        id,
        slug: "34211",
        visibility: "private",
        published_version_id: null,
      }),
    ).toBe(`http://${id}.app.localhost:8090`);
    expect(
      appRuntimeOrigin({
        id,
        slug: "34211",
        visibility: "public",
        published_version_id: "ver-1",
      }),
    ).toBe("http://34211.app.localhost:8090");
  });

  test("comma-separated APP_RUNTIME_HOST accepts aliases", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "remiix.app,abblet.app";
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    try {
      expect(getAppRuntimeHosts()).toEqual(["remiix.app", "abblet.app"]);
      expect(getAppRuntimeHost()).toBe("remiix.app");
      expect(parseAppSubdomain("73850.remiix.app")).toBe("73850");
      expect(parseAppSubdomain("73850.abblet.app")).toBe("73850");
      expect(isAppRuntimeHost("73850.remiix.app")).toBe(true);
      expect(isAppRuntimeApex("remiix.app")).toBe(true);
      expect(appOrigin("73850")).toBe("https://73850.remiix.app");
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("shared platform+runtime apex does not bounce (no redirect loop)", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "remiix.app";
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    try {
      expect(isPlatformHost("remiix.app")).toBe(true);
      expect(isAppRuntimeApex("remiix.app")).toBe(true);
      expect(shouldBounceRuntimeApexToPlatform("remiix.app")).toBe(false);
      expect(isAppOnlyHost("remiix.app")).toBe(false);
      expect(isAppOnlyHost("73850.remiix.app")).toBe(true);
      expect(isAppOnlyHost("a1b2c3d4-e5f6-7890-abcd-ef1234567890.remiix.app")).toBe(true);
      expect(parseAppSubdomain("73850.remiix.app")).toBe("73850");
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("redirectLegacyHost maps abblet domains to remiix", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "remiix.app";
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    try {
      const platform = redirectLegacyHost({
        headers: new Headers({ host: "abblet.com" }),
        url: "https://abblet.com/en/about?x=1",
      });
      expect(platform?.headers.get("Location")).toBe("https://remiix.app/en/about?x=1");

      const sub = redirectLegacyHost({
        headers: new Headers({ host: "73850.abblet.app" }),
        url: "https://73850.abblet.app/install",
      });
      expect(sub?.headers.get("Location")).toBe("https://73850.remiix.app/install");
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("appPageUrl prefers UUID host for private apps", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(appPageUrl("en", "34211", { id, slug: "34211", visibility: "private" })).toBe(
      `http://${id}.app.localhost:8090/`,
    );
    expect(
      appPageUrl("en", "34211", {
        id,
        slug: "34211",
        visibility: "public",
        publishedVersionId: "v1",
      }),
    ).toBe("http://34211.app.localhost:8090/");
    expect(appModuleUrl("en", "34211")).toContain("/module.js");
    expect(appRuntimeModulePath()).toBe("/module.js");
  });
});
