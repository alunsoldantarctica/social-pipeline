import { describe, expect, it } from "vitest";
import { timingSafeEqual } from "../../convex/lib/timingSafeEqual";

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("secret", "secret")).toBe(true);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(timingSafeEqual("secret", "wrong0")).toBe(false);
  });

  it("returns false for strings of different length", () => {
    expect(timingSafeEqual("a", "ab")).toBe(false);
    expect(timingSafeEqual("longer", "")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(timingSafeEqual("Secret", "secret")).toBe(false);
  });
});
