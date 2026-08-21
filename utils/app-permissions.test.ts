import { describe, expect, test } from "bun:test";
import {
  appNeedsAi,
  appNeedsAnyPermission,
  appNeedsSync,
  detectPermissionsFromCode,
  mergeAppPermissions,
  parseAppPermissions,
  permissionConsentAction,
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
    expect(detectPermissionsFromCode(`await Abblet.sync()`)).toEqual(["sync"]);
  });

  test("merge unions declared and detected", () => {
    expect(mergeAppPermissions([], `Abblet.ai(`)).toEqual(["ai"]);
    expect(mergeAppPermissions([], `Remiix.ai(`)).toEqual(["ai"]);
    expect(mergeAppPermissions(["ai"], `no ai`)).toEqual(["ai"]);
    expect(mergeAppPermissions([], `no`)).toEqual([]);
    expect(mergeAppPermissions(["ai"], `Abblet.sync(`)).toEqual(["ai", "sync"]);
  });

  test("parse and serialize round-trip", () => {
    expect(parseAppPermissions('["ai"]')).toEqual(["ai"]);
    expect(parseAppPermissions('["ai","sync"]')).toEqual(["ai", "sync"]);
    expect(parseAppPermissions("not-json")).toEqual([]);
    expect(serializeAppPermissions(["ai", "ai"])).toBe('["ai"]');
  });

  test("need helpers", () => {
    expect(appNeedsAi(["sync"])).toBe(false);
    expect(appNeedsSync(["sync"])).toBe(true);
    expect(appNeedsSync('["ai"]')).toBe(false);
    expect(appNeedsAnyPermission(["sync"])).toBe(true);
    expect(appNeedsAnyPermission([])).toBe(false);
  });

  test("permissionConsentAction: empty declared passes through", () => {
    expect(permissionConsentAction({ declared: [], granted: [], hasConfirmNonce: false })).toBe(
      "pass",
    );
  });

  test("permissionConsentAction: nonce grants all declared scopes", () => {
    expect(
      permissionConsentAction({
        declared: ["sync"],
        granted: [],
        hasConfirmNonce: true,
      }),
    ).toBe("grant");
    expect(
      permissionConsentAction({
        declared: ["ai", "sync"],
        granted: [],
        hasConfirmNonce: true,
      }),
    ).toBe("grant");
  });

  test("permissionConsentAction: sync-only without grant needs consent (not pass)", () => {
    expect(
      permissionConsentAction({
        declared: ["sync"],
        granted: [],
        hasConfirmNonce: false,
      }),
    ).toBe("consent");
  });

  test("permissionConsentAction: any missing declared scope needs consent", () => {
    expect(
      permissionConsentAction({
        declared: ["ai"],
        granted: [],
        hasConfirmNonce: false,
      }),
    ).toBe("consent");
    expect(
      permissionConsentAction({
        declared: ["ai", "sync"],
        granted: ["ai"],
        hasConfirmNonce: false,
      }),
    ).toBe("consent");
    expect(
      permissionConsentAction({
        declared: ["ai", "sync"],
        granted: ["ai", "sync"],
        hasConfirmNonce: false,
      }),
    ).toBe("pass");
    expect(
      permissionConsentAction({
        declared: ["sync"],
        granted: ["sync"],
        hasConfirmNonce: false,
      }),
    ).toBe("pass");
  });
});
