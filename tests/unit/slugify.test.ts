import { describe, expect, it } from "vitest";
import { slugify } from "../../convex/lib/slugify";

describe("slugify", () => {
  it("lowercases and replaces non-alphanumerics with dashes", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("collapses runs of separators", () => {
    expect(slugify("foo --- bar___baz")).toBe("foo-bar-baz");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("   spaces around   ")).toBe("spaces-around");
    expect(slugify("---a---")).toBe("a");
  });

  it("preserves digits", () => {
    expect(slugify("Top 10 Tips for 2026")).toBe("top-10-tips-for-2026");
  });

  it("handles unicode by stripping non-ASCII letters", () => {
    expect(slugify("café — résumé")).toBe("caf-r-sum");
  });

  it("returns empty string for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("");
  });
});
