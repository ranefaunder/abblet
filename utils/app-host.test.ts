import { describe, expect, test } from "bun:test";
import {
  appOrigin,
  isAppRuntimeApex,
  isAppRuntimeHost,
  parseAppSubdomain,
  stripHostPort,
} from "/utils/app-host";
import { appModuleUrl, appPageUrl, appRuntimeModulePath } from "/utils/app-url";

describe("app-host", () => {
  test("stripHostPort removes port", () => {
    expect(stripHostPort("34211.app.localhost:8090")).toBe("34211.app.localhost");
    expect(stripHostPort("localhost:8090")).toBe("localhost");
    expect(stripHostPort("abblet.app")).toBe("abblet.app");
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
});

describe("app-url", () => {
  test("canonical subdomain URLs", () => {
    expect(appPageUrl("en", "34211")).toBe("http://34211.app.localhost:8090/");
    expect(appModuleUrl("en", "34211")).toBe("http://34211.app.localhost:8090/module.js");
    expect(appRuntimeModulePath()).toBe("/module.js");
  });
});
