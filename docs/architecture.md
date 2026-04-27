# Architecture

## Pipeline state machine

```
                    ┌──────────────────────────────┐
                    │      articleWorkflows         │
                    └──────────────────────────────┘

  research_in_progress
         │  (agent runs runResearch action)
         ▼
  research_review            ← editor approves / revises / rejects
         │  (approve: select angle, start outline)
         ▼
  outline_in_progress
         │  (agent runs runOutline action)
         ▼
  outline_review             ← editor approves / revises / rejects
         │  (approve: start draft)
         ▼
  draft_in_progress
         │  (agent runs runDraft action with format adapter)
         ▼
  draft_review               ← editor reviews final draft
         │  (approve: blogPost created → optional auto-publish)
         ▼
  completed
         │
         ├─ outputFormat=blog_post         → done (internal blog only)
         ├─ outputFormat=twitter_thread    → Zernio (if autoPublish=true)
         ├─ outputFormat=linkedin_article  → Zernio (if autoPublish=true)
         └─ outputFormat=newsletter_issue  → Resend (if autoSend=true)

  (any stage → rejected; max 3 revisions per stage)
```

The state machine lives in `convex/workflows/contentPipeline.ts`. It's a `@convex-dev/workflow` definition — durable across retries, awaits human approval events between stages.

## Config layers

The system reads from three layers when running a workflow. The Setup tab seeds the first two; you fine-tune the third by hand if needed.

```
┌──────────────────────────────────────────────────┐
│ 1. Niche profile (siteSettings key="niche")       │
│    Inputs: websiteUrl?, description, audience     │
│    → drives niche generator                       │
└──────────────────────────────────────────────────┘
                       │ generates
                       ▼
┌──────────────────────────────────────────────────┐
│ 2. Agent prompts (agentInstructions table)        │
│    Six rows: research, outline, draft + 3 formats │
│    Resolver falls back to bundled constants       │
│    when no row exists / useDefault=true            │
└──────────────────────────────────────────────────┘
                       │ injected into
                       ▼
┌──────────────────────────────────────────────────┐
│ 3. Editorial rules (editorialRules table)         │
│    Per-category constraints prepended to every    │
│    agent prompt at runtime                        │
└──────────────────────────────────────────────────┘
                       │ + format adapter
                       ▼
                  Final agent system prompt
```

See [prompts.md](prompts.md) for the resolver, [niche-setup.md](niche-setup.md) for the generator, and `convex/agents/editorialContext.ts` for the rule injection.

## Agent runner flow

Every agent call in `convex/agents/runner.ts` follows the same pattern:

```
1. Load workflow record (model overrides, thread ID, prior outputs)
2. Resolve model: per-workflow override > agentConfigs default
3. Build instructions:
     loadInstruction(stage, format?)        ← DB row or bundled default
       + draftInstructionsForFormat (draft only, if outputFormat ≠ blog_post)
       + editorialContext.build              ← active editorial rules
4. Create / reuse conversation thread (maintains context across revisions)
5. Run agent.generateText() / generateObject()
6. Log token usage to aiUsageEvents (catalog/record.ts)
7. Reconcile estimated vs actual cost
8. Parse JSON output → store on workflow record
9. Transition status (research_review / outline_review / draft_review)
```

## Prompt resolution

`convex/agents/instructionsResolver.ts` exposes:

- `resolve(stage, format?)` (internal query) — returns the live instruction body. Reads `agentInstructions` for the (stage, format) slot; falls back to the constants in `convex/agents/instructions.ts` (research / outline / draft) and `convex/agents/formatAdapters.ts` (twitter / linkedin / newsletter) when no row exists or `useDefault=true`.
- `getDefaultInstruction(stage, format?)` (pure function) — same fallback logic without DB access. Used by the niche generator and admin list query to synthesize default rows.

Editing a prompt in the **Prompts** admin tab takes effect on the next agent run — no deploy.

## Editorial context injection

`convex/agents/editorialContext.ts:build` runs as an `internalQuery` that:

1. Loads all active `editorialRules` from the database (grouped by category).
2. Optionally queries your live data (products, competitors, etc.) — see TODO comment for the live-data hook pattern.
3. Returns a formatted string prepended to every agent's resolved instructions.

Editing rules in the admin UI takes effect on the next pipeline run — no deploy.

## Format adapters

`convex/agents/formatAdapters.ts` defines named constants for each non-blog format:

```
draft (resolved)
    +
TWITTER_THREAD_INSTRUCTIONS / LINKEDIN_ARTICLE_INSTRUCTIONS / NEWSLETTER_ISSUE_INSTRUCTIONS
    +
withEditorialContext(...)
    =
final agent system prompt
```

The instruction resolver treats each format as its own slot — you can edit the format adapter independently of the base draft prompt. Adding a new format is a 4-step process documented in [format-adapters.md](format-adapters.md).

## Niche generator

`convex/admin/nicheGenerator.ts` produces tailored prompts in one shot:

```
1. Save inputs to siteSettings (key="niche")
2. (optional) Scrape websiteUrl via Firecrawl → brand voice / products / CTAs
3. buildMetaPrompt({description, audience, websiteUrl, websiteSummary})
   embeds the six bundled defaults as templates + niche context
4. generateObject(model, PromptSetSchema, prompt) — Zod-validated 6-key output
5. Return preview: per-slot {newBody, currentBody, isLocked}
6. UI shows side-by-side diff; operator picks slots; applyGeneratedPrompts
   writes via _applyOneSlot — lock-aware (skips custom-edited rows by default)
```

Lock policy: a slot is "locked" if `agentInstructions.useDefault=false` and `body !== bundled default`. Locked rows aren't overwritten unless the operator explicitly ticks "Override custom edits" (sends `force=true`).

Full guide: [niche-setup.md](niche-setup.md).

## Cost tracking

Two layers:

**Estimated** (before the run): `pipelineCostAssumptions` table × model pricing from `availableModels`.

**Actual** (after the run): `aiUsageEvents` table records real token counts. `convex/catalog/record.ts:_recordStepCost` posts the actual cost.

The analytics dashboard at `/admin/analytics` shows both — so you can see how accurate the estimates are per model.

## Publishing routing

After `createBlogPost` and `updateStatus("completed")`, `convex/workflows/contentPipeline.ts` routes by `outputFormat`:

```
outputFormat=blog_post         → no external publish
outputFormat=twitter_thread    → internal.admin.zernioPublish.publishWorkflow
outputFormat=linkedin_article  → internal.admin.zernioPublish.publishWorkflow
outputFormat=newsletter_issue  → internal.admin.resendNewsletter.sendNewsletterWorkflow
```

Each adapter writes status to `articleWorkflows.socialPublish`:

```ts
{
  status: "pending" | "published" | "failed" | "skipped",
  provider: "zernio" | "resend",
  profileIds?: string[],   // Zernio: profile IDs / Resend: audience IDs
  postIds?: string[],      // Zernio: post IDs / Resend: broadcast ID
  scheduledAt?: number,
  publishedAt?: number,
  attemptedAt?: number,
  error?: string,
}
```

Failures are non-fatal — the workflow stays `completed`. Manual retries available via `manualPublishWorkflow` (Zernio) and `manualSendNewsletter` (Resend).

Full guide: [social-publishing.md](social-publishing.md).

## AI Gateway enforcement

`convex/lib/aiGateway.ts` is the single audited builder for all LLM calls. It:

- Reads `CF_AI_GATEWAY_NAME` and `CF_ACCOUNT_ID` from env
- Builds the gateway base URL (`gateway.ai.cloudflare.com/v1/{account}/{gateway}/{provider}`)
- Strips the provider's `Authorization` header and sets `cf-aig-authorization` for unified billing
- Throws if called without required env vars

**Never bypass this.** Direct provider API calls skip spend caps, logging, and per-model accounting.

## Convex components

The pipeline uses three first-party Convex components:

- `@convex-dev/agent` — `Agent` class wrapping a language model with instructions and tools, plus `createThread` for persistent conversation history across revisions.
- `@convex-dev/workflow` — durable workflow orchestration; survives restarts, awaits human approval events.
- `@convex-dev/auth` — Google OAuth + Resend email OTP, with `~/.well-known/openid-configuration` and JWKS endpoints exposed via `convex/http.ts`.

## Multi-tenant readiness

Schema has forward-compatible optional `workspaceId` columns + `by_workspace*` indexes on the high-traffic tables (`articleWorkflows`, `blogPosts`, `agentConfigs`, `editorialRules`, `agentInstructions`, `contentPods`, `contentBriefs`). Code reads aren't scoped yet — undefined `workspaceId` means "default workspace". See [multi-tenant.md](multi-tenant.md) for the roadmap.
