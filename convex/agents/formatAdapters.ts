/**
 * Format Adapters
 *
 * Format-specific draft instruction blocks injected at the draft stage.
 * The base draftInstructions handle "blog_post". Every other format gets
 * an additional instruction block appended before the agent runs.
 *
 * Each constant below is the *default* block for that format. The runtime
 * resolver (convex/agents/instructionsResolver.ts) reads the DB-stored
 * version first and falls back to these constants when no override exists.
 *
 * To add a new output format:
 * 1. Add a literal to the outputFormat union in convex/schema/content.ts
 * 2. Add a new exported constant + case in `draftInstructionsForFormat`
 * 3. Add the format literal to convex/schema/admin.ts:agentInstructions.format
 *    and to the resolver's union (instructionsResolver.ts)
 * 4. Wire to Zernio or your publish adapter in convex/admin/zernioPublish.ts
 */

export const TWITTER_THREAD_INSTRUCTIONS = `
## Output Format Override: Twitter/X Thread

You are writing a Twitter/X thread, NOT a blog post. Override the JSON output format:

{
  "content": "Full thread here — tweets separated by ---",
  "metaDescription": "One-sentence summary of the thread",
  "estimatedReadTime": 2
}

Rules for threads:
- Each tweet is separated by a line containing only ---
- Maximum 280 characters per tweet (count carefully)
- First tweet is the hook — make it impossible to scroll past
- Use numbered markers sparingly (e.g. "1/") — only on first tweet
- No markdown headers or bullet lists — plain prose only
- Final tweet: clear call to action or key takeaway
- Aim for 8-15 tweets total
- Write conversationally; avoid corporate language
`;

export const LINKEDIN_ARTICLE_INSTRUCTIONS = `
## Output Format Override: LinkedIn Article

You are writing a LinkedIn article, NOT a blog post. Adjust your JSON output:

{
  "content": "Full LinkedIn article in markdown",
  "metaDescription": "Article summary for the LinkedIn post that links to this",
  "estimatedReadTime": 5
}

Rules for LinkedIn articles:
- Professional but warm tone — avoid jargon
- Lead with a personal hook or bold claim in the first 2 sentences (visible before "see more")
- Use short paragraphs (1-2 sentences max)
- Use line breaks liberally — white space reads well on LinkedIn
- Bullet lists are fine but keep them short (3-5 items)
- End with a question to drive comments
- Target 800-1500 words
- No H1; use H2/H3 sparingly
`;

export const NEWSLETTER_ISSUE_INSTRUCTIONS = `
## Output Format Override: Newsletter Issue

You are writing a newsletter issue. Adjust your JSON output:

{
  "content": "Full newsletter body in markdown",
  "metaDescription": "Preview text shown in email clients (90-110 chars)",
  "estimatedReadTime": 4
}

Structure your newsletter with these clearly delimited sections:

### SUBJECT
One compelling subject line (max 60 chars)

### PREVIEW
Preview/pre-header text (90-110 chars, shown in inbox before opening)

### INTRO
2-3 sentences. Personal, warm. What's in this issue and why it matters.

### MAIN STORY
The core content — use H2/H3 headers, bullets, and short paragraphs.

### QUICK HITS
2-3 short items (1-2 sentences each) of related news or tips.

### CTA
One clear call to action. One link. One ask.

Rules:
- Write as a human, not a brand
- No more than 700 words total (email fatigue is real)
- Plain markdown only — no complex tables
`;

export type DraftFormat =
  | "blog_post"
  | "twitter_thread"
  | "linkedin_article"
  | "newsletter_issue";

export function draftInstructionsForFormat(format: string | undefined): string {
  switch (format) {
    case "twitter_thread":
      return TWITTER_THREAD_INSTRUCTIONS;
    case "linkedin_article":
      return LINKEDIN_ARTICLE_INSTRUCTIONS;
    case "newsletter_issue":
      return NEWSLETTER_ISSUE_INSTRUCTIONS;
    default: // blog_post — base draftInstructions handle this format
      return "";
  }
}
