# Niche Setup

The fastest way to take this scaffold from "generic" to "tailored to your domain". Tell the system who you write for, and a meta-prompt LLM call generates the six agent prompts for you. You preview the output before it lands.

Lives at `/admin/content?tab=setup`.

## What it does

```
                  ┌─────────────────────────────────┐
                  │  You: niche profile + audience    │
                  │  (optionally: website URL)         │
                  └─────────────────────────────────┘
                                  │
                                  ▼
        Firecrawl scrape → brand voice / products / CTAs (if URL given)
                                  │
                                  ▼
        Meta-prompt assembled with the six bundled defaults as templates
                                  │
                                  ▼
        Configured "draft" model runs generateObject(PromptSetSchema)
                                  │
                                  ▼
                  ┌─────────────────────────────────┐
                  │  Six tailored prompts            │
                  │  • research                      │
                  │  • outline                       │
                  │  • draft                         │
                  │  • twitter_thread                │
                  │  • linkedin_article              │
                  │  • newsletter_issue              │
                  └─────────────────────────────────┘
                                  │
                                  ▼
        UI: side-by-side diff (current vs proposed) + apply
```

## Inputs

| Field | Required | Notes |
|---|---|---|
| Website URL | No | Homepage URL. Scraped via Firecrawl for brand voice, taglines, product list, common CTAs. Skipped silently if scrape fails. |
| Niche description | Yes | A few sentences. e.g. "Travel insurance for adventure travelers heading to polar regions and remote destinations." |
| Audience | Yes | A few sentences. e.g. "Affluent expedition travelers spending $5k-$50k per trip; sophisticated about insurance basics, want depth over basics." |

## Workflow

1. **Open Setup** — `/admin/content?tab=setup`. If you've used it before the form pre-populates from `siteSettings` (`key="niche"`).

2. **Save profile** (optional) — persists the inputs to the DB without running a generation. Useful if you want to fine-tune your description over a few sessions before paying for a generation.

3. **Generate prompts** — calls `generatePrompts` action:
   - Saves your inputs.
   - If website URL is set, scrapes it via `internal.admin.genericScraper.scrapeWithSchema` for brand cues. Failures are non-fatal (logged + continues).
   - Builds the meta-prompt embedding the six bundled defaults.
   - Runs through your **configured draft model** (whatever the Models tab has set for the `draft` agent). Cost goes through the AI Gateway like any other agent run.
   - Returns the six new prompts as a preview — does NOT write to `agentInstructions` yet.

4. **Review** — the preview shows six cards. Each card expands to a side-by-side diff: current body (left) vs proposed (right). Format adapters (twitter_thread / linkedin_article / newsletter_issue) appear indented under Draft.

5. **Apply** — tick the slots you want, click "Apply N prompts". Calls `applyGeneratedPrompts` which writes via `_applyOneSlot`. The default selection is everything that isn't locked.

## Lock policy

A slot is **locked** when:
- An `agentInstructions` row exists for it
- `useDefault === false`
- `body !== bundled default`

Locked rows are **skipped on apply unless `force=true`**. The UI surfaces this with a `Locked (custom)` badge and disables the checkbox by default.

To override: tick the **Override custom edits (re-enable locked rows)** checkbox before applying. The checkboxes become writable and the apply call sends `force: true`.

This means a regenerate after you've hand-tuned a prompt won't clobber the work, but a deliberate re-tailor still can.

## Regeneration

Run it again any time. Common reasons:

- You tightened the niche description.
- Your business added a new product line — re-run the website scrape so the prompts include it.
- You moved to a new audience.
- The first generation was too generic.

The "Last generated" timestamp + model fingerprint are saved on the `siteSettings` row so you can see when prompts were last machine-touched.

## Cost

A single generation is one LLM call to the configured draft model. With Claude Sonnet 4.x or similar, expect a few cents — the cost lands in `aiUsageEvents` like any other run (stage="draft" — there's no separate "niche-generator" stage, see open question below).

## What the generator preserves vs rewrites

The meta-prompt explicitly tells the model to **preserve**:

- The exact JSON output schema each base prompt requires
  - research: `{sources, summary, suggestedAngles}`
  - outline: `{title, sections, targetWordCount}`
  - draft: `{content, metaDescription, estimatedReadTime}`
- Hard rules in the draft prompt:
  - No H1 (`# `) — the page renderer owns the title
  - No placeholder tokens (`[Current Date]`, `[Author Name]`, etc.)
  - GFM footnote citations under a final `## Sources` heading
- Format adapter structural requirements:
  - Twitter: `---` separators between tweets, 280-char limit, hook-first
  - LinkedIn: no H1, short paragraphs, hook in first 2 sentences
  - Newsletter: `### SUBJECT` / `### PREVIEW` / `### INTRO` / `### MAIN STORY` / `### QUICK HITS` / `### CTA` section headers in order

It rewrites:

- Tone, voice, and audience framing
- Topic-area examples and quality standards
- "Good sources" guidance for the niche
- Format adapter specifics (LinkedIn audience details, newsletter CTA flavor, etc.)

## Behind the scenes

| Module | Role |
|---|---|
| `convex/admin/nicheGenerator.ts` | All backend logic — config CRUD, generator action, lock-aware apply |
| `convex/admin/genericScraper.ts:scrapeWithSchema` | Firecrawl extraction — reused from competitor intel |
| `convex/agents/instructionsResolver.ts:getDefaultInstruction` | Pulls the bundled defaults that go into the meta-prompt |
| `convex/agents/config.ts:createModelFromConfig` | Builds the AI SDK model handle through the gateway |
| `src/components/react/admin/NicheSetupAdmin.tsx` | The Setup tab UI |

The pure `buildMetaPrompt` function is exported and unit-tested in `tests/unit/buildMetaPrompt.test.ts`. The lock-aware apply has integration tests in `tests/convex/nicheApply.test.ts`.

## Customizing the meta-prompt

If you want to bias generations differently — for example, always emit warmer tone, or always include certain compliance language — edit `buildMetaPrompt` in `convex/admin/nicheGenerator.ts`. Add a new section to the meta-prompt below the niche profile, e.g. "House style overrides — apply across all six prompts: …".

## Troubleshooting

- **Generation returns less than 200 chars in a slot** — the Zod schema enforces minimum lengths. Likely the model is being lazy; try a stronger model on the Models tab.
- **Firecrawl scrape fails** — generation continues without the website context. Check `FIRECRAWL_API_KEY` is set in Convex env.
- **Apply skips everything** — every slot is currently locked. Either reset a slot from the Prompts tab (rolls back to default), or tick "Override custom edits" before apply.
- **"sourceModel" shows the wrong model** — the generator uses the configured `draft` agent's model. Update the Models tab if you want a different one driving generation.
