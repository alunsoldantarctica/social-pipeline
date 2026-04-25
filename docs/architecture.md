# Architecture

## Pipeline State Machine

```
                    ┌─────────────────────────────────────────┐
                    │           articleWorkflows               │
                    └─────────────────────────────────────────┘

  research_in_progress
         │  (agent runs runResearch action)
         ▼
  research_review         ← editor approves/revises/rejects
         │  (approve: start outline)
         ▼
  outline_in_progress
         │  (agent runs runOutline action)
         ▼
  outline_review          ← editor selects angle, approves/revises
         │  (approve: start draft)
         ▼
  draft_in_progress
         │  (agent runs runDraft action with format adapter)
         ▼
  draft_review            ← editor reviews final draft
         │  (approve: publish → blogPost created, or push to Zernio)
         ▼
  completed

  (at any stage → rejected)
```

## Agent Runner Flow

Every agent call in `convex/agents/runner.ts` follows the same pattern:

```
1. Load workflow record (model overrides, thread ID, prior outputs)
2. Resolve model: per-workflow override > agentConfigs table default
3. Build instructions: base instructions + editorial context + format adapter
4. Create/reuse conversation thread (maintains context across revisions)
5. Run agent.generateText()
6. Log token usage (aiUsageEvents table)
7. Record step cost to catalog (estimated vs actual reconciliation)
8. Parse JSON output → store on workflow record
9. Transition status
```

## Editorial Context Injection

`convex/agents/editorialContext.ts` runs an `internalQuery` that:
1. Loads all active `editorialRules` from the database (grouped by category)
2. Optionally queries your live data (products, competitors, etc.) — see TODO comment
3. Returns a formatted string prepended to every agent's system instructions

This means **changing editorial rules in the admin UI takes effect on the next pipeline run** — no deploy required.

## Format Adapters

`convex/agents/formatAdapters.ts` provides per-format instruction overrides for the draft stage:

```
draftInstructions (base)
    +
draftInstructionsForFormat(outputFormat)  ← injected if outputFormat ≠ blog_post
    +
withEditorialContext(...)
    =
final agent instructions
```

Adding a new format:
1. Add a literal to `outputFormat` union in `convex/schema/content.ts`
2. Add a `case` in `formatAdapters.ts` returning the format-specific instructions
3. Wire a publish adapter (e.g., Zernio profile IDs for twitter vs linkedin)

## Cost Tracking

Two layers:

**Estimated** (before the run): `pipelineCostAssumptions` table × model pricing from `availableModels`.

**Actual** (after the run): `aiUsageEvents` table records real token counts. `catalog/record.ts` posts actual cost to `_recordStepCost`.

The analytics dashboard at `/admin/analytics` shows both — so you can see how accurate the estimates are per model.

## AI Gateway Enforcement

`convex/lib/aiGateway.ts` is the single audited builder for all LLM calls. It:
- Reads `CF_AI_GATEWAY_NAME` and `CF_ACCOUNT_ID` from env
- Builds the gateway base URL (`gateway.ai.cloudflare.com/v1/{account}/{gateway}/{provider}`)
- Strips Authorization headers and sets `cf-aig-authorization` for unified billing
- Throws if called without required env vars

**Never bypass this.** Direct provider API calls skip spend limits and logging.

## Convex Component: @convex-dev/agent

The pipeline uses `@convex-dev/agent` (from `convex-dev/agent` on GitHub) which provides:
- `Agent` class: wraps a language model with instructions and tools
- `createThread`: creates persistent conversation threads (maintains context across revisions)
- `stepCountIs`: limits tool call steps to prevent runaway loops

Threads are stored in Convex and survive across retries — revisions reuse the same thread so the agent has context from prior rounds.
