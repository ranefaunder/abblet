import { describe, expect, test } from "bun:test";
import { isRestorablePath, isSplashPathname } from "/utils/last-path.client";

describe("last-path", () => {
  test("restorable SPA routes", () => {
    expect(isRestorablePath("/en/apps")).toBe(true);
    expect(isRestorablePath("/en/apps/my-app")).toBe(true);
    expect(isRestorablePath("/fi/games")).toBe(true);
    expect(isRestorablePath("/en/me")).toBe(true);
    expect(isRestorablePath("/en/about")).toBe(true);
    expect(isRestorablePath("/en/create")).toBe(true);
    expect(isRestorablePath("/en/create/slug")).toBe(true);
  });

  test("rejects splash, login, runtime", () => {
    expect(isRestorablePath("/en")).toBe(false);
    expect(isRestorablePath("/en/")).toBe(false);
    expect(isRestorablePath("/en/login")).toBe(false);
    expect(isRestorablePath("/en/app/123")).toBe(false);
  });

  test("splash pathname", () => {
    expect(isSplashPathname("/en")).toBe(true);
    expect(isSplashPathname("/en/")).toBe(true);
    expect(isSplashPathname("/en/apps")).toBe(false);
  });
});
