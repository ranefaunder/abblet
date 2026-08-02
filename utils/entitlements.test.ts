import { describe, expect, test } from "bun:test";
import { normalizeGiftCode } from "/server/database/queries/entitlements";
import {
  getCreditMarkup,
  getFreeGrantUsd,
  getPlanGrantUsd,
  getPremiumGrantUsd,
  planGrantUsdMicros,
  usdToUsdMicros,
} from "/utils/credits.server";
import { parseUserPlan, PREMIUM_PRICE_USD } from "/utils/entitlements.server";
import {
  FREE_GRANT_USD,
  PREMIUM_GRANT_USD,
  PREMIUM_PRICE_USD as DISPLAY_PREMIUM_PRICE,
} from "/utils/billing-plans";

describe("billing plan grants", () => {
  test("display constants match server Premium price", () => {
    expect(DISPLAY_PREMIUM_PRICE).toBe(PREMIUM_PRICE_USD);
    expect(PREMIUM_GRANT_USD).toBe(5.99);
    expect(FREE_GRANT_USD).toBe(0.99);
  });

  test("plan grants follow CREDIT_* env", () => {
    const prevMarkup = process.env.CREDIT_MARKUP;
    const prevFree = process.env.CREDIT_FREE_GRANT_USD;
    const prevPrem = process.env.CREDIT_PREMIUM_GRANT_USD;
    process.env.CREDIT_MARKUP = "2";
    process.env.CREDIT_FREE_GRANT_USD = "0.99";
    process.env.CREDIT_PREMIUM_GRANT_USD = "5.99";
    try {
      expect(getCreditMarkup()).toBe(2);
      expect(getFreeGrantUsd()).toBeCloseTo(0.99, 5);
      expect(getPremiumGrantUsd()).toBeCloseTo(5.99, 5);
      expect(getPlanGrantUsd("free")).toBe(getFreeGrantUsd());
      expect(getPlanGrantUsd("premium")).toBe(getPremiumGrantUsd());
      expect(planGrantUsdMicros("premium")).toBe(usdToUsdMicros(5.99));
      expect(planGrantUsdMicros("premium")).toBeGreaterThan(planGrantUsdMicros("free"));
    } finally {
      if (prevMarkup === undefined) delete process.env.CREDIT_MARKUP;
      else process.env.CREDIT_MARKUP = prevMarkup;
      if (prevFree === undefined) delete process.env.CREDIT_FREE_GRANT_USD;
      else process.env.CREDIT_FREE_GRANT_USD = prevFree;
      if (prevPrem === undefined) delete process.env.CREDIT_PREMIUM_GRANT_USD;
      else process.env.CREDIT_PREMIUM_GRANT_USD = prevPrem;
    }
  });
});

describe("parseUserPlan", () => {
  test("maps premium and falls back to free", () => {
    expect(parseUserPlan("premium")).toBe("premium");
    expect(parseUserPlan("free")).toBe("free");
    expect(parseUserPlan(null)).toBe("free");
    expect(parseUserPlan("nope")).toBe("free");
  });
});

describe("normalizeGiftCode", () => {
  test("trims, uppercases, strips spaces", () => {
    expect(normalizeGiftCode("  remiix-friends ")).toBe("REMIIX-FRIENDS");
    expect(normalizeGiftCode("abc def")).toBe("ABCDEF");
    expect(normalizeGiftCode("EARLY ACCESS")).toBe("EARLYACCESS");
    expect(normalizeGiftCode("")).toBe("");
  });
});
