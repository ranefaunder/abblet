import { describe, expect, test } from "bun:test";
import {
  detectPermissionsFromCode,
  mergeAppPermissions,
  parseAppPermissions,
  serializeAppPermissions,
} from "/utils/app-permissions";

describe("app-permissions", () => {
  test("detects Remiix.ai calls", () => {
    expect(detectPermissionsFromCode(`await Remiix.ai({ prompt: "x" })`)).toEqual(["ai"]);
    expect(detectPermissionsFromCode(`const x = 1`)).toEqual([]);
  });

  test("merge unions declared and detected", () => {
    expect(mergeAppPermissions([], `Remiix.ai(`)).toEqual(["ai"]);
    expect(mergeAppPermissions(["ai"], `no ai`)).toEqual(["ai"]);
    expect(mergeAppPermissions([], `no`)).toEqual([]);
  });

  test("parse and serialize round-trip", () => {
    expect(parseAppPermissions('["ai"]')).toEqual(["ai"]);
    expect(parseAppPermissions("not-json")).toEqual([]);
    expect(serializeAppPermissions(["ai", "ai"])).toBe('["ai"]');
  });
});
