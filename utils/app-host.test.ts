import { describe, expect, test } from "bun:test";
import {
  appOrigin,
  appRuntimeOrigin,
  permissionUrl,
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
    expect(stripHostPort("34211.localhost:8090")).toBe("34211.localhost");
    expect(stripHostPort("localhost:8090")).toBe("localhost");
    expect(stripHostPort("abblet.com")).toBe("abblet.com");
  });

  test("parseAppSubdomain matches numeric slug", () => {
    expect(parseAppSubdomain("34211.localhost:8090")).toBe("34211");
    expect(parseAppSubdomain("foo.localhost")).toBeNull();
    expect(parseAppSubdomain("localhost")).toBeNull();
    expect(parseAppSubdomain("12.localhost")).toBeNull(); // too short
    expect(parseAppSubdomain("34211.abblet.app")).toBeNull(); // wrong runtime host in this env
  });

  test("parseAppRuntimeLabel matches slug and UUID", () => {
    expect(parseAppRuntimeLabel("34211.localhost:8090")).toEqual({
      kind: "slug",
      value: "34211",
    });
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(parseAppRuntimeLabel(`${id}.localhost`)).toEqual({
      kind: "id",
      value: id,
    });
    expect(parseAppRuntimeLabel("not-a-uuid.localhost")).toBeNull();
  });

  test("apex and runtime host detection", () => {
    expect(isAppRuntimeApex("localhost:8090")).toBe(true);
    expect(isAppRuntimeApex("34211.localhost:8090")).toBe(false);
    expect(isAppRuntimeHost("foo.localhost")).toBe(true);
    expect(isAppRuntimeHost("localhost:8090")).toBe(true);
    expect(isAppOnlyHost("localhost:8090")).toBe(false);
    expect(isAppOnlyHost("34211.localhost:8090")).toBe(true);
  });

  test("appOrigin includes port from PLATFORM_ORIGIN", () => {
    expect(appOrigin("34211")).toBe("http://34211.localhost:8090");
  });
  test("permissionUrl points at platform", () => {
    expect(permissionUrl("34211")).toBe("http://localhost:8090/permission/34211");
  });

  test("isOriginForAppSlug and isOriginForApp", () => {
    expect(isOriginForAppSlug("http://34211.localhost:8090", "34211")).toBe(true);
    expect(isOriginForAppSlug("http://99999.localhost:8090", "34211")).toBe(false);
    expect(isAppRuntimeOrigin("http://34211.localhost:8090")).toBe("34211");
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(
      isOriginForApp(`http://${id}.localhost:8090`, { id, slug: "34211" }),
    ).toBe(true);
    expect(
      isOriginForApp("http://34211.localhost:8090", { id, slug: "34211" }),
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
    ).toBe(`http://${id}.localhost:8090`);
    expect(
      appRuntimeOrigin({
        id,
        slug: "34211",
        visibility: "public",
        published_version_id: "ver-1",
      }),
    ).toBe("http://34211.localhost:8090");
  });

  test("comma-separated APP_RUNTIME_HOST accepts aliases", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "abblet.com,abblet.app";
    process.env.PLATFORM_ORIGIN = "https://abblet.com";
    try {
      expect(getAppRuntimeHosts()).toEqual(["abblet.com", "abblet.app"]);
      expect(getAppRuntimeHost()).toBe("abblet.com");
      expect(parseAppSubdomain("73850.abblet.com")).toBe("73850");
      expect(parseAppSubdomain("73850.abblet.app")).toBe("73850");
      expect(isAppRuntimeHost("73850.abblet.com")).toBe(true);
      expect(isAppRuntimeApex("abblet.com")).toBe(true);
      expect(appOrigin("73850")).toBe("https://73850.abblet.com");
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("shared platform+runtime apex does not bounce (no redirect loop)", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "abblet.com";
    process.env.PLATFORM_ORIGIN = "https://abblet.com";
    try {
      expect(isPlatformHost("abblet.com")).toBe(true);
      expect(isAppRuntimeApex("abblet.com")).toBe(true);
      expect(shouldBounceRuntimeApexToPlatform("abblet.com")).toBe(false);
      expect(isAppOnlyHost("abblet.com")).toBe(false);
      expect(isAppOnlyHost("73850.abblet.com")).toBe(true);
      expect(isAppOnlyHost("a1b2c3d4-e5f6-7890-abcd-ef1234567890.abblet.com")).toBe(true);
      expect(parseAppSubdomain("73850.abblet.com")).toBe("73850");
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("redirectLegacyHost maps old abblet.app to canonical abblet.com", () => {
    const prevHost = process.env.APP_RUNTIME_HOST;
    const prevOrigin = process.env.PLATFORM_ORIGIN;
    process.env.APP_RUNTIME_HOST = "abblet.com";
    process.env.PLATFORM_ORIGIN = "https://abblet.com";
    try {
      const platform = redirectLegacyHost({
        headers: new Headers({ host: "abblet.com" }),
        url: "https://abblet.com/en/about?x=1",
      });
      expect(platform).toBeNull();

      const sub = redirectLegacyHost({
        headers: new Headers({ host: "73850.abblet.app" }),
        url: "https://73850.abblet.app/install",
      });
      expect(sub?.headers.get("Location")).toBe("https://73850.abblet.com/install");

      const rmix = redirectLegacyHost({
        headers: new Headers({ host: "rmix.app" }),
        url: "https://rmix.app/en/",
      });
      expect(rmix?.headers.get("Location")).toBe("https://abblet.com/en/");
    } finally {
      process.env.APP_RUNTIME_HOST = prevHost;
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("appPageUrl prefers UUID host for private apps", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(appPageUrl("en", "34211", { id, slug: "34211", visibility: "private" })).toBe(
      `http://${id}.localhost:8090/`,
    );
    expect(
      appPageUrl("en", "34211", {
        id,
        slug: "34211",
        visibility: "public",
        publishedVersionId: "v1",
      }),
    ).toBe("http://34211.localhost:8090/");
    // Store cards have id but no visibility — must stay on slug (published) host
    expect(appPageUrl("en", "34211", { id, slug: "34211" })).toBe("http://34211.localhost:8090/");
    expect(appModuleUrl("en", "34211")).toContain("/module.js");
    expect(appRuntimeModulePath()).toBe("/module.js");
  });
});
