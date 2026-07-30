import { describe, expect, test } from "bun:test";
import { platformCookieOriginForbidden } from "/utils/csrf.server";

function req(headers: Record<string, string>): Request {
  return new Request("https://remiix.app/api/en/user/me", { headers });
}

describe("platformCookieOriginForbidden", () => {
  const prevOrigin = process.env.PLATFORM_ORIGIN;

  test("allows platform Origin", () => {
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    try {
      expect(platformCookieOriginForbidden(req({ Origin: "https://remiix.app" }))).toBeNull();
    } finally {
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("rejects app subdomain Origin", () => {
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    try {
      const res = platformCookieOriginForbidden(req({ Origin: "https://73850.remiix.app" }));
      expect(res?.status).toBe(403);
    } finally {
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("rejects foreign Origin", () => {
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    try {
      const res = platformCookieOriginForbidden(req({ Origin: "https://evil.example" }));
      expect(res?.status).toBe(403);
    } finally {
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("allows missing Origin with same-origin Sec-Fetch-Site", () => {
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    try {
      expect(
        platformCookieOriginForbidden(req({ "Sec-Fetch-Site": "same-origin" })),
      ).toBeNull();
    } finally {
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });

  test("rejects missing Origin with same-site Sec-Fetch-Site", () => {
    process.env.PLATFORM_ORIGIN = "https://remiix.app";
    try {
      const res = platformCookieOriginForbidden(req({ "Sec-Fetch-Site": "same-site" }));
      expect(res?.status).toBe(403);
    } finally {
      process.env.PLATFORM_ORIGIN = prevOrigin;
    }
  });
});
