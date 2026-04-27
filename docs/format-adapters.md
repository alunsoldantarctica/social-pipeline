# Format Adapters

The pipeline supports multiple output formats via the `outputFormat` field on `articleWorkflows`. Each format is a draft-stage instruction block that's appended to the resolved base draft prompt before the agent runs.

## Supported formats

| `outputFormat` | What the agent writes | Publish target |
|---|---|---|
| `blog_post` (default) | Full markdown article, 1500-2500 words, GFM footnotes, `## Sources` block | Internal blog only |
| `twitter_thread` | 8-15 tweets separated by `---`, hook first, CTA last | Zernio (X / Twitter) |
| `linkedin_article` | 800-1500 words, professional + warm, short paragraphs, no H1 | Zernio (LinkedIn) |
| `newsletter_issue` | Structured: `### SUBJECT`, `### PREVIEW`, `### INTRO`, `### MAIN STORY`, `### QUICK HITS`, `### CTA` | Resend (broadcast) |

## How it works

```
draft prompt body (from agentInstructions resolver)
    +
TWITTER_THREAD_INSTRUCTIONS / LINKEDIN_ARTICLE_INSTRUCTIONS / NEWSLETTER_ISSUE_INSTRUCTIONS
    +
editorialContext.build()
=
final draft system prompt
```

`convex/agents/formatAdapters.ts` exports each format's bundled default as a named constant. The instruction resolver treats each format as its own slot in the `agentInstructions` table — you can edit the format adapter independently of the base draft prompt:

| Slot | `agentInstructions.stage` | `agentInstructions.format` |
|---|---|---|
| Base draft | `draft` | (undefined) |
| Twitter | `draft` | `twitter_thread` |
| LinkedIn | `draft` | `linkedin_article` |
| Newsletter | `draft` | `newsletter_issue` |

The resolver picks a row when one exists with `useDefault=false`; otherwise it falls back to the bundled constant. See [prompts.md](prompts.md) for the resolver details.

The `draftOutput` field on `articleWorkflows` is `v.any()` — the output schema is open so each format can return a different JSON structure (e.g. newsletter_issue returns the full structured body which `parseNewsletterDraft` then splits into `{subject, preview, body}`).

## Editing an adapter

The fastest path is the **Prompts** tab in admin: `/admin/content?tab=prompts`. Each format is a card under Draft. Inline editor; takes effect on the next agent run.

## Adding a new format

### 1. Add to the schema union

In `convex/schema/content.ts`, extend `articleWorkflows.outputFormat`:

```ts
outputFormat: v.optional(v.union(
  v.literal("blog_post"),
  v.literal("twitter_thread"),
  v.literal("linkedin_article"),
  v.literal("newsletter_issue"),
  v.literal("instagram_caption"),  // ← add here
)),
```

### 2. Add the bundled default constant

In `convex/agents/formatAdapters.ts`:

```ts
export const INSTAGRAM_CAPTION_INSTRUCTIONS = `
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
- CTA in the last line
`;

export function draftInstructionsForFormat(format: string | undefined): string {
  switch (format) {
    case "twitter_thread":   return TWITTER_THREAD_INSTRUCTIONS;
    case "linkedin_article": return LINKEDIN_ARTICLE_INSTRUCTIONS;
    case "newsletter_issue": return NEWSLETTER_ISSUE_INSTRUCTIONS;
    case "instagram_caption": return INSTAGRAM_CAPTION_INSTRUCTIONS;  // ← add
    default: return "";
  }
}
```

### 3. Extend the resolver, admin CRUD, and Zod input shape

In `convex/agents/instructionsResolver.ts`:
- Add `"instagram_caption"` to the `formatValidator` and `Format` type.
- Add a switch case in `getDefaultInstruction` returning `INSTAGRAM_CAPTION_INSTRUCTIONS`.

In `convex/admin/agentInstructions.ts`:
- Add `{ stage: "draft", format: "instagram_caption" }` to `ALL_KEYS` so the admin list includes a slot for it.
- Add `instagram_caption: v.optional(v.array(v.string()))` to `updateZernioConfig`'s `profilesByFormat` validator if you'll publish to it via Zernio.

In `convex/admin/nicheGenerator.ts`:
- Add `instagram_caption` to `PromptSetSchema`, `ALL_KEYS`, and `applyGeneratedPrompts` `only` validator so the niche generator covers it.

### 4. Wire publishing

If the format goes through Zernio, just add the format → profile-IDs mapping via the Zernio config UI. The workflow router needs an `else if` branch in `convex/workflows/contentPipeline.ts` if it's not already a Zernio target:

```ts
} else if (
  outputFormat === "twitter_thread" ||
  outputFormat === "linkedin_article" ||
  outputFormat === "instagram_caption"
) {
  // ...zernio publishWorkflow
}
```

If it's a different platform (newsletter platform, podcast tool, etc.) write a new adapter mirroring `convex/admin/zernioPublish.ts` or `convex/admin/resendNewsletter.ts` and add a case to the router.

### 5. Update the UI

The format dropdown lives on the Pipeline tab's create-workflow modal. Add the literal there.

### 6. Update tests

`tests/unit/zernioFormat.test.ts` exercises `formatForPlatform` per format — add a case if your format needs custom text shaping. `tests/unit/instructionsResolver.test.ts` tests `getDefaultInstruction` — add an assertion that the new format returns its constant.

## Notes on social formats

- The research and outline stages are format-agnostic — they produce the same structured output regardless of `outputFormat`.
- Only the draft stage changes behavior per format.
- The `estimatedReadTime` field is still useful for social (Twitter thread: 2 min, newsletter: 4 min).
- For thread formats, the `content` field uses lines containing only `---` as a separator between tweets — `formatForPlatform("twitter_thread", ...)` joins them with blank lines for the Zernio body.
- The `newsletter_issue` body is parsed by `convex/agents/parseNewsletterDraft.ts` into `{subject, preview, bodyMarkdown}` for Resend.
