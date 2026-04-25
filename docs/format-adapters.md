# Format Adapters

The pipeline supports multiple output formats via the `outputFormat` field on `articleWorkflows`. Each format gets its own draft instruction block that overrides (or supplements) the base draft instructions.

## Supported formats

| Format | `outputFormat` value | Notes |
|---|---|---|
| Blog post | `blog_post` (default) | Full markdown article, 1500-2500 words |
| Twitter/X thread | `twitter_thread` | 8-15 tweets, 280 chars each |
| LinkedIn article | `linkedin_article` | 800-1500 words, professional tone |
| Newsletter issue | `newsletter_issue` | Subject + preview + sections + CTA |

## How it works

When the draft agent runs, `draftInstructionsForFormat(outputFormat)` returns a format-specific instruction block. This is appended to the base `draftInstructions` before editorial context injection:

```
base draftInstructions
    + formatAdapters.ts output
    + editorialContext (rules from DB)
= final system prompt
```

The `draftOutput` field on `articleWorkflows` is `v.any()` — so the output schema is open and each format can return a different JSON structure.

## Adding a new format

### 1. Add to the schema union

In `convex/schema/content.ts`, add a new literal to `outputFormat`:

```ts
outputFormat: v.optional(v.union(
  v.literal("blog_post"),
  v.literal("twitter_thread"),
  v.literal("linkedin_article"),
  v.literal("newsletter_issue"),
  v.literal("instagram_caption"),  // ← add here
)),
```

### 2. Add the instruction block

In `convex/agents/formatAdapters.ts`, add a case:

```ts
case "instagram_caption":
  return `
## Output Format Override: Instagram Caption

You are writing an Instagram caption. Output JSON:
{
  "content": "Caption text (max 2200 chars, first 125 visible before 'more')",
  "metaDescription": "One-sentence summary",
  "estimatedReadTime": 1
}

Rules:
- Hook in the first sentence (visible before truncation)
- Line breaks every 1-2 sentences for mobile readability
- 3-5 hashtags at the end (relevant, not generic)
- Optional: emoji to punctuate sections
- CTA in the last line
`;
```

### 3. Add a publish adapter

If this format targets a social platform, wire the Zernio profile ID in `convex/admin/zernioPublish.ts`:

```ts
// Map formats to Zernio profile IDs
const FORMAT_TO_PROFILES: Record<string, string[]> = {
  twitter_thread: ["profile_twitter_123"],
  linkedin_article: ["profile_linkedin_456"],
  instagram_caption: ["profile_instagram_789"],
};
```

### 4. Update the UI (optional)

Add the new option to the format dropdown in `CreateWorkflowModal.tsx`.

## Notes on social formats

- The research and outline stages are format-agnostic — they produce the same structured output regardless of format
- Only the draft stage changes behavior per format
- The `estimatedReadTime` field is still useful for social (Twitter thread: 2 min, newsletter: 4 min)
- For thread formats, the `content` field uses `---` as a separator between posts — wire your publish adapter to split on this
