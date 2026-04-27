# Multi-tenant readiness

The repo is **single-tenant by default**. The schema is forward-compatible — every high-traffic table has an optional `workspaceId` column with a `by_workspace*` index — so when you do go multi-tenant the migration won't be destructive. Code reads aren't scoped yet; `workspaceId === undefined` means "default workspace".

## What's already in the schema

Optional `workspaceId: v.string()` plus a `by_workspace*` index on:

| Table | Index added |
|---|---|
| `articleWorkflows` | `by_workspace` (`workspaceId, status`) |
| `blogPosts` | `by_workspace` (`workspaceId, isPublished, publishedAt`) |
| `agentConfigs` | `by_workspace_key` (`workspaceId, key`) |
| `editorialRules` | `by_workspace_active` (`workspaceId, isActive, order`) |
| `agentInstructions` | `by_workspace_stage_format` (`workspaceId, stage, format`) |
| `contentPods` | `by_workspace_active` (`workspaceId, isActive`) |
| `contentBriefs` | `by_workspace_status` (`workspaceId, status`) |

`siteSettings` rows already key by `key` — multi-tenant equivalent will be `(workspaceId, key)`. Easy enough to add later as a composite key when the time comes.

## What's NOT done

- No `workspaces` table.
- No `workspaceMembers` (user × workspace × role) table.
- Auth wrappers (`adminQuery` / `adminMutation` / `adminAction`) don't yet resolve a "current workspace" from the session.
- No routing — admin lives at `/admin/*`, not `/admin/[workspaceSlug]/*`.
- Per-tenant secrets: API keys (Zernio, Resend, Firecrawl, OpenRouter, AI Gateway) all live in `process.env`, single value per deployment.
- Per-tenant cost caps: `siteSettings.contentMaxWorkflowCostCents` is global.

## Roadmap when you actually need it

This is multi-week work. Don't start until you have at least one concrete second tenant lined up — premature multi-tenancy doubles the surface area of every feature change in the meantime.

### Phase A — Tables and identity

1. Add `workspaces` table: `name, slug, ownerUserId, createdAt`.
2. Add `workspaceMembers`: `workspaceId, userId, role` (`owner | admin | editor | viewer`).
3. Migration: insert a single "default" workspace row. Backfill `workspaceId` on every existing row to point at it. Then flip the columns from optional → required.

### Phase B — Auth scoping

4. Extend `requireAdmin` (and the `adminQuery`/`adminMutation`/`adminAction` wrappers in `convex/lib/adminAuth.ts`) to resolve an active workspace from the session. Two common shapes:
   - URL-based: `/admin/[workspaceSlug]/*`, middleware sets a header, wrapper reads it.
   - Subdomain-based: `tenant.your-domain.com/admin`, middleware reads the host.
5. Every read that touches a tenant-scoped table uses the `by_workspace*` index instead of the existing one.
6. Every write attaches the active `workspaceId`.

### Phase C — Per-tenant config

7. Move provider keys out of `process.env` for the tenant-customizable ones (Zernio, Resend audience IDs, content budget caps, AI Gateway slug if you want per-tenant spend caps). Two options:
   - Encrypted in the DB on `workspaceSettings`.
   - In a dedicated secrets store (Cloudflare Workers secrets per tenant; Convex deploy keys per workspace).
8. Update Zernio + Resend adapters to read config from the active workspace's settings, not global `siteSettings`.
9. Update the AI gateway builder (`convex/lib/aiGateway.ts`) to optionally read tenant-specific gateway slugs.

### Phase D — Routing and UI

10. Add a workspace switcher to the admin shell.
11. Workspace creation flow on signup.
12. Invite flow for `workspaceMembers`.
13. Per-tenant onboarding gate: route to `/admin/[ws]/setup` when a workspace has no niche profile.

### Phase E — Operational

14. Per-tenant analytics: scope `aiUsageEvents` queries by workspace.
15. Per-tenant push subscriptions: `pushSubscriptions` already has `userId`; add `workspaceId` and key the VAPID notifications by workspace context.
16. Per-tenant cron behavior — the existing `crons.ts` runs globally; extend to iterate workspaces.

## Why we deferred

The audit recommended deferring the big work because:

- **Cost of premature abstraction**: every feature change has to think about workspace boundaries even when there's only one workspace. Concretely, every adminQuery becomes `if (currentWorkspace) ...`, every test sets up a workspace fixture, every UI knows about workspace switching.
- **Real requirements drive the right shape**: the choice of routing (URL vs subdomain), the role taxonomy, the per-tenant secret model, all depend on the actual second tenant. Building blind is likely to be wrong.
- **Forward-compat is cheap; full implementation isn't**: an optional column + a paired index per table is a one-hour change. The full lift is weeks. Leave the door open, walk through it later.

## What it costs in single-tenant mode

Carrying `workspaceId: optional` everywhere has a tiny cost: a few unused indexes (low storage, no query overhead since they're never queried), and a column that's always `undefined`. Worth it for the option to add multi-tenancy without a migration that risks data.

## Pre-existing schema strict-mode mismatches

While we're talking schema, there are a few pre-existing fields the code writes but the schema didn't declare (`siteSettings.autoQuoteEnabled / autoQuoteBufferPercent / minPlanPremium`, `articleWorkflows.costEstimate / scheduledPublishAt / contentSafetyWarnings / modelOverrides`, `contentBriefs.articleWorkflowId`). These were extracted from a production deployment with a wider schema. If your Convex deployment runs with strict validation (the default), these writes throw.

If you hit one of these in development, you have three options:

1. Add the missing fields to the schema (preferred — explicit is better than implicit).
2. Set `schemaValidation: false` in `defineSchema` (works, but you lose the type-checking benefits).
3. Strip the writes from the code (but most of them carry actual product data).

This isn't a multi-tenant issue per se, but it's the kind of thing that a multi-tenant migration would surface, so flagging it here.
