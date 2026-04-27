import { describe, expect, it } from "vitest";
import { getDefaultInstruction } from "../../convex/agents/instructionsResolver";

describe("getDefaultInstruction", () => {
  it("returns research instructions for stage=research", () => {
    const out = getDefaultInstruction("research");
    expect(out).toContain("research specialist");
    expect(out).toContain("searchWeb");
  });

  it("returns outline instructions for stage=outline", () => {
    const out = getDefaultInstruction("outline");
    expect(out).toContain("content strategist");
    expect(out).toContain("targetWordCount");
  });

  it("returns draft instructions for stage=draft (no format)", () => {
    const out = getDefaultInstruction("draft");
    expect(out).toContain("skilled content writer");
    expect(out).toContain("metaDescription");
  });

  it("returns twitter thread block for draft + twitter_thread format", () => {
    const out = getDefaultInstruction("draft", "twitter_thread");
    expect(out).toContain("Twitter/X Thread");
    expect(out).toContain("280 characters");
  });

  it("returns linkedin block for draft + linkedin_article format", () => {
    const out = getDefaultInstruction("draft", "linkedin_article");
    expect(out).toContain("LinkedIn Article");
    expect(out).toContain("800-1500 words");
  });

  it("returns newsletter block for draft + newsletter_issue format", () => {
    const out = getDefaultInstruction("draft", "newsletter_issue");
    expect(out).toContain("Newsletter Issue");
    expect(out).toContain("### SUBJECT");
    expect(out).toContain("### PREVIEW");
  });
});
