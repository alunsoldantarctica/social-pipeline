import { describe, expect, it } from "vitest";
import { parseNewsletterDraft } from "../../convex/agents/parseNewsletterDraft";

const FULL_DRAFT = `### SUBJECT
Why expedition travelers are rethinking trip insurance

### PREVIEW
Three changes to coverage you should know about before your next polar trip.

### INTRO
Hey reader — quick rundown of what's changed in expedition coverage this season.

### MAIN STORY
Here's the thing about CFAR. You probably don't need it for every trip, but for trips over $20k it pays for itself in peace of mind.

#### When CFAR makes sense
Long lead times. Non-refundable deposits. Cruise itineraries with weather risk.

### QUICK HITS
- Carrier X added Antarctic medical evac to standard
- Two new endorsements for adventure sports

### CTA
Get a quote in under 2 minutes — quote.example.com
`;

describe("parseNewsletterDraft", () => {
  it("extracts subject, preview, and body from a well-formed draft", () => {
    const out = parseNewsletterDraft(FULL_DRAFT);
    expect(out.subject).toBe("Why expedition travelers are rethinking trip insurance");
    expect(out.preview).toBe(
      "Three changes to coverage you should know about before your next polar trip.",
    );
    expect(out.bodyMarkdown).toContain("### INTRO");
    expect(out.bodyMarkdown).toContain("### MAIN STORY");
    expect(out.bodyMarkdown).toContain("### QUICK HITS");
    expect(out.bodyMarkdown).toContain("### CTA");
    expect(out.bodyMarkdown).not.toContain("### SUBJECT");
    expect(out.bodyMarkdown).not.toContain("### PREVIEW");
  });

  it("preserves H4 sub-headers inside MAIN STORY", () => {
    const out = parseNewsletterDraft(FULL_DRAFT);
    expect(out.bodyMarkdown).toContain("#### When CFAR makes sense");
  });

  it("falls back to the first non-blank line when SUBJECT is missing", () => {
    const draft = `Quick newsletter

### INTRO
Body here.`;
    const out = parseNewsletterDraft(draft);
    expect(out.subject).toBe("Quick newsletter");
    expect(out.preview).toBe("");
  });

  it("returns empty preview when PREVIEW is missing", () => {
    const draft = `### SUBJECT
Test subject

### INTRO
Body.`;
    const out = parseNewsletterDraft(draft);
    expect(out.preview).toBe("");
  });

  it("preserves order: INTRO, MAIN STORY, QUICK HITS, CTA", () => {
    const out = parseNewsletterDraft(FULL_DRAFT);
    const introIdx = out.bodyMarkdown.indexOf("### INTRO");
    const mainIdx = out.bodyMarkdown.indexOf("### MAIN STORY");
    const quickIdx = out.bodyMarkdown.indexOf("### QUICK HITS");
    const ctaIdx = out.bodyMarkdown.indexOf("### CTA");
    expect(introIdx).toBeLessThan(mainIdx);
    expect(mainIdx).toBeLessThan(quickIdx);
    expect(quickIdx).toBeLessThan(ctaIdx);
  });

  it("trims surrounding whitespace from subject and preview", () => {
    const draft = `### SUBJECT
   Padded subject

### PREVIEW
   Padded preview

### INTRO
Body.`;
    const out = parseNewsletterDraft(draft);
    expect(out.subject).toBe("Padded subject");
    expect(out.preview).toBe("Padded preview");
  });

  it("handles drafts with no recognized sections", () => {
    const draft = "Just a paragraph with no structure at all.";
    const out = parseNewsletterDraft(draft);
    expect(out.subject).toBe("Just a paragraph with no structure at all.");
    expect(out.bodyMarkdown).toContain("Just a paragraph");
  });
});
