import { afterEach, describe, expect, test } from "bun:test";
import { legacyAuthCookieDomain } from "/utils/auth.server";

describe("legacyAuthCookieDomain", () => {
  const prevPlatform = process.env.PLATFORM_ORIGIN;

  afterEach(() => {
    if (prevPlatform === undefined) delete process.env.PLATFORM_ORIGIN;
    else process.env.PLATFORM_ORIGIN = prevPlatform;
  });

  test("returns platform host for clearing Domain cookies", () => {
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    expect(legacyAuthCookieDomain()).toBe("remiix.app");
  });

  test("unset for localhost", () => {
    process.env.PLATFORM_ORIGIN = "http://localhost:8090";
    expect(legacyAuthCookieDomain()).toBeUndefined();
  });
});
