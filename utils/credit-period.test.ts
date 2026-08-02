import { describe, expect, test } from "bun:test";
import {
  addCalendarMonthsUtc,
  clampUtcDay,
  daysInUtcMonth,
  utcDayOfMonth,
} from "/utils/credit-period";

describe("credit-period calendar months", () => {
  test("daysInUtcMonth handles Feb leap/non-leap", () => {
    expect(daysInUtcMonth(2026, 1)).toBe(28);
    expect(daysInUtcMonth(2024, 1)).toBe(29);
    expect(daysInUtcMonth(2026, 0)).toBe(31);
  });

  test("clampUtcDay", () => {
    expect(clampUtcDay(2026, 1, 31)).toBe(28);
    expect(clampUtcDay(2024, 1, 31)).toBe(29);
    expect(clampUtcDay(2026, 3, 31)).toBe(30);
  });

  test("31 Jan → 28 Feb → 31 Mar (anchor preserved)", () => {
    const jan31 = new Date("2026-01-31T12:00:00.000Z");
    const feb28 = addCalendarMonthsUtc(jan31, 1, 31);
    expect(feb28.toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(utcDayOfMonth(feb28)).toBe(28);

    const mar31 = addCalendarMonthsUtc(feb28, 1, 31);
    expect(mar31.toISOString()).toBe("2026-03-31T12:00:00.000Z");
    expect(utcDayOfMonth(mar31)).toBe(31);
  });
});
