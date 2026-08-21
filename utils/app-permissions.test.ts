import { describe, expect, test } from "bun:test";
import {
  detectPermissionsFromCode,
  mergeAppPermissions,
  parseAppPermissions,
  serializeAppPermissions,
} from "/utils/app-permissions";

describe("app-permissions", () => {
  test("detects Abblet.ai and legacy Remiix.ai calls", () => {
    expect(detectPermissionsFromCode(`await Abblet.ai({ prompt: "x" })`)).toEqual(["ai"]);
    expect(detectPermissionsFromCode(`await Remiix.ai({ prompt: "x" })`)).toEqual(["ai"]);
    expect(detectPermissionsFromCode(`const x = 1`)).toEqual([]);
  });

  test("detects Abblet.sync and legacy Remiix.sync", () => {
    expect(detectPermissionsFromCode(`Abblet.sync(`)).toEqual(["sync"]);
    expect(detectPermissionsFromCode(`Remiix.sync(`)).toEqual(["sync"]);
  });

  test("merge unions declared and detected", () => {
    expect(mergeAppPermissions([], `Abblet.ai(`)).toEqual(["ai"]);
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
