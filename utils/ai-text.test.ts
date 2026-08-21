import { describe, expect, test } from "bun:test";
import { unwrapMarkdownCodeFence } from "/utils/ai-text";

describe("unwrapMarkdownCodeFence", () => {
  test("strips json fence like Abblet.ai models return", () => {
    const raw = "```json\n{\n  \"name\": \"Factory Salo\",\n  \"priceAdult\": 13.7\n}\n```";
    expect(unwrapMarkdownCodeFence(raw)).toBe('{\n  "name": "Factory Salo",\n  "priceAdult": 13.7\n}');
  });

  test("strips bare fence", () => {
    expect(unwrapMarkdownCodeFence("```\nhello\n```")).toBe("hello");
  });

  test("leaves plain text alone", () => {
    expect(unwrapMarkdownCodeFence("Just a sentence.")).toBe("Just a sentence.");
  });

  test("leaves prose with an embedded fence alone", () => {
    const text = "Here is code:\n```js\nconst x = 1;\n```\nDone.";
    expect(unwrapMarkdownCodeFence(text)).toBe(text);
  });

  test("trims surrounding whitespace", () => {
    expect(unwrapMarkdownCodeFence("  plain  ")).toBe("plain");
  });
});
