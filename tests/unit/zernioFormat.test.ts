import { describe, expect, it } from "vitest";
import {
  formatForPlatform,
  extractPostIds,
} from "../../convex/admin/zernioPublish";

describe("formatForPlatform", () => {
  it("joins twitter_thread tweets separated by --- with blank lines", () => {
    const draft = `Tweet one with the hook.
---
Tweet two with the meat.
---
Tweet three with the CTA.`;
    const out = formatForPlatform("twitter_thread", draft);
    expect(out).toBe(
      "Tweet one with the hook.\n\nTweet two with the meat.\n\nTweet three with the CTA.",
    );
  });

  it("strips empty tweets between separators", () => {
    const draft = `One
---

---
Two`;
    const out = formatForPlatform("twitter_thread", draft);
    expect(out).toBe("One\n\nTwo");
  });

  it("strips markdown headings, bold, italics for linkedin_article", () => {
    const draft = `# Title (should be stripped)
## Section heading (should be stripped)
This is **bold** and *italic* and ***both***.
- bullet one
- bullet two
* asterisk bullet`;
    const out = formatForPlatform("linkedin_article", draft);
    expect(out).not.toContain("##");
    expect(out).not.toContain("**");
    expect(out).toContain("Title (should be stripped)");
    expect(out).toContain("This is bold and italic and both.");
    expect(out).toContain("• bullet one");
    expect(out).toContain("• bullet two");
    expect(out).toContain("• asterisk bullet");
  });

  it("returns trimmed content unchanged for blog_post and newsletter_issue", () => {
    const draft = "  Hello world  \n  ";
    expect(formatForPlatform("blog_post", draft)).toBe("Hello world");
    expect(formatForPlatform("newsletter_issue", draft)).toBe("Hello world");
  });
});

describe("extractPostIds", () => {
  it("returns ids from posts array shape", () => {
    const result = { posts: [{ id: "p1" }, { id: "p2" }, { id: "p3" }] };
    expect(extractPostIds(result)).toEqual(["p1", "p2", "p3"]);
  });

  it("returns ids from data array shape", () => {
    const result = { data: [{ id: "d1" }] };
    expect(extractPostIds(result)).toEqual(["d1"]);
  });

  it("returns single id when result has top-level id", () => {
    const result = { id: "single" };
    expect(extractPostIds(result)).toEqual(["single"]);
  });

  it("returns undefined for unrecognized shape", () => {
    expect(extractPostIds(null)).toBeUndefined();
    expect(extractPostIds(undefined)).toBeUndefined();
    expect(extractPostIds("string")).toBeUndefined();
    expect(extractPostIds({ unrelated: true })).toBeUndefined();
  });

  it("filters out non-string ids in arrays", () => {
    const result = { posts: [{ id: "ok" }, { id: 42 }, { notId: "x" }, { id: "ok2" }] };
    expect(extractPostIds(result)).toEqual(["ok", "ok2"]);
  });
});
