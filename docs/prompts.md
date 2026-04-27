# Agent Prompts

Every agent prompt in the pipeline is editable from the admin UI without a deploy. Six slots cover the whole pipeline:

| Stage | Format | UI tab |
|---|---|---|
| Research | — | Prompts |
| Outline | — | Prompts |
| Draft (base) | — | Prompts |
| Draft + Twitter thread | `twitter_thread` | Prompts (nested under Draft) |
| Draft + LinkedIn article | `linkedin_article` | Prompts (nested under Draft) |
| Draft + Newsletter issue | `newsletter_issue` | Prompts (nested under Draft) |

Lives at `/admin/content?tab=prompts`.

## How resolution works

```
Agent run starts → loadInstruction(stage, format?)
                     │
                     ▼
        instructionsResolver.resolve(stage, format?)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
  agentInstructions row?    No row → return bundled
        │                    constant from
        ▼                    convex/agents/instructions.ts
  useDefault === true?       or formatAdapters.ts
        │
   yes  │   no
   ▼   ▼
   bundled  return row.body
   default
```

Two ways to "use the default" for a slot:

1. No row exists at all in `agentInstructions` for that `(stage, format)` pair — the resolver falls through to the constant.
2. A row exists but `useDefault=true` — the resolver still falls through. (Reset-to-default in the UI deletes the row entirely so you start clean.)

## Editing in the UI

`/admin/content?tab=prompts`:

- Six cards: Research, Outline, Draft (top-level), then Twitter thread / LinkedIn article / Newsletter issue indented under Draft.
- Each card shows a **Custom** or **Default** badge and the last-edited timestamp.
- Click a card to expand the inline textarea. Edit. Save.
- "Reset to default" appears on Custom rows — deletes the row, resolver falls back to the constant.
- Character counts and unsaved-changes indicator at the bottom of each open editor.

Saves take effect on the next agent run. No deploy.

## Editing programmatically

| Function | Type | Purpose |
|---|---|---|
| `admin.agentInstructions.list` | `adminQuery` | Returns all six slots as `{stage, format, body, defaultBody, useDefault, isOverridden, updatedAt}`. Synthesizes default rows for slots that don't yet exist in the DB. |
| `admin.agentInstructions.upsert` | `adminMutation` | Save a body for `(stage, format)`. Pass `useDefault=false` to take effect, or `true` to flip the slot back to the bundled default while keeping the row around. |
| `admin.agentInstructions.resetToDefault` | `adminMutation` | Delete the row entirely. Resolver falls back to the constant. |

CLI examples:

```bash
# Set a custom research prompt
pnpx convex run admin/agentInstructions:upsert '{
  "stage": "research",
  "body": "You are a research specialist for ...",
  "useDefault": false
}'

# Roll back research to the bundled default
pnpx convex run admin/agentInstructions:resetToDefault '{"stage": "research"}'

# Set a Twitter thread adapter
pnpx convex run admin/agentInstructions:upsert '{
  "stage": "draft",
  "format": "twitter_thread",
  "body": "## Output Format Override: Twitter Thread\n\n...",
  "useDefault": false
}'
```

## Where the bundled defaults live

| Constant | File |
|---|---|
| `researchInstructions` | `convex/agents/instructions.ts` |
| `outlineInstructions` | `convex/agents/instructions.ts` |
| `draftInstructions` | `convex/agents/instructions.ts` |
| `TWITTER_THREAD_INSTRUCTIONS` | `convex/agents/formatAdapters.ts` |
| `LINKEDIN_ARTICLE_INSTRUCTIONS` | `convex/agents/formatAdapters.ts` |
| `NEWSLETTER_ISSUE_INSTRUCTIONS` | `convex/agents/formatAdapters.ts` |

These are the source of truth when no DB row exists. They're the templates the niche generator uses (the meta-prompt embeds them and asks the model to rewrite each for the niche).

## Editorial rules vs prompts

Two layers, often confused:

- **Prompts** (this doc): the system prompt for each agent. One prompt per stage / format. Editable per slot.
- **Editorial rules** (`/admin/content?tab=rules`): per-category constraints (commercial / tone / legal / structure) **prepended** to every agent prompt at runtime. Examples: "no fearmongering", "always include a CTA", "don't mention competitor X". Many small rules rather than one big prompt.

The agent's final system prompt is roughly:

```
[active editorial rules, grouped by category]

---

[resolved instruction body for this (stage, format)]
```

Use prompts for the structural agent behavior; use rules for cross-cutting constraints you'd otherwise have to repeat in every prompt.

## Lock-aware regeneration

The niche generator (Setup tab, see [niche-setup.md](niche-setup.md)) also writes into `agentInstructions`. By default it **skips** any slot that's currently customized — `useDefault=false` and `body !== bundled default`. To allow it to overwrite, the operator ticks "Override custom edits" in the Setup UI; the apply call sets `force=true`.

The same `(stage, format)` indexing means the generator can target individual slots — its `applyGeneratedPrompts` action accepts an `only` array of slot keys.

## Schema

```ts
agentInstructions: defineTable({
  stage: v.union(v.literal("research"), v.literal("outline"), v.literal("draft")),
  format: v.optional(v.union(
    v.literal("twitter_thread"),
    v.literal("linkedin_article"),
    v.literal("newsletter_issue"),
  )),
  body: v.string(),
  useDefault: v.boolean(),
  workspaceId: v.optional(v.string()),  // forward-compat
  createdAt: v.optional(v.number()),
  updatedAt: v.number(),
}).index("by_stage_format", ["stage", "format"])
  .index("by_workspace_stage_format", ["workspaceId", "stage", "format"]),
```

## Testing

Pure-function tests for the resolver fallback:
- `tests/unit/instructionsResolver.test.ts` — `getDefaultInstruction(stage, format?)` returns the right constant for every combination.

convex-test integration tests for the resolver and CRUD round-trips:
- `tests/convex/agentInstructions.test.ts` — fallback to constant when no row, body returned when row exists with `useDefault=false`, fallback when `useDefault=true`, scoping by format.
