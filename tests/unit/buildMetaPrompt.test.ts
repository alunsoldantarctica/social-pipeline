import { describe, expect, it } from "vitest";
import { buildMetaPrompt } from "../../convex/admin/nicheGenerator";

describe("buildMetaPrompt", () => {
  it("includes niche description and audience", () => {
    const out = buildMetaPrompt({
      description: "Travel insurance for polar expedition travelers",
      audience: "Affluent adventure travelers spending $5k+ per trip",
    });
    expect(out).toContain("Travel insurance for polar expedition travelers");
    expect(out).toContain("Affluent adventure travelers spending $5k+ per trip");
  });

  it("omits website line when no URL is given", () => {
    const out = buildMetaPrompt({
      description: "X",
      audience: "Y",
    });
    expect(out).not.toContain("**Website**");
  });

  it("includes website URL and summary when both are provided", () => {
    const out = buildMetaPrompt({
      description: "X",
      audience: "Y",
      websiteUrl: "https://example.com",
      websiteSummary: "Brand: Acme\nCTAs:\n- Get a quote",
    });
    expect(out).toContain("https://example.com");
    expect(out).toContain("Brand: Acme");
    expect(out).toContain("Get a quote");
    expect(out).toContain("# Website extract");
  });

  it("does NOT add the website extract section when summary is empty/undefined", () => {
    const out1 = buildMetaPrompt({
      description: "X",
      audience: "Y",
      websiteUrl: "https://example.com",
    });
    const out2 = buildMetaPrompt({
      description: "X",
      audience: "Y",
      websiteUrl: "https://example.com",
      websiteSummary: "   ",
    });
    expect(out1).not.toContain("# Website extract");
    expect(out2).not.toContain("# Website extract");
  });

  it("embeds all six default prompts as templates", () => {
    const out = buildMetaPrompt({ description: "X", audience: "Y" });
    expect(out).toContain("## research (default)");
    expect(out).toContain("## outline (default)");
    expect(out).toContain("## draft (default)");
    expect(out).toContain("## twitter_thread (default)");
    expect(out).toContain("## linkedin_article (default)");
    expect(out).toContain("## newsletter_issue (default)");
    // Sanity: defaults pull in their bundled signature phrases
    expect(out).toContain("research specialist");
    expect(out).toContain("Twitter/X Thread");
    expect(out).toContain("### SUBJECT");
  });

  it("instructs the model to preserve hard rules and JSON shape", () => {
    const out = buildMetaPrompt({ description: "X", audience: "Y" });
    expect(out).toContain("MUST keep");
    expect(out).toContain("JSON output schema");
    expect(out).toMatch(/no H1/);
  });
});
