# social-pipeline

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/alunsoldantarctica/social-pipeline)

An open-source AI content pipeline scaffold. Research → Outline → Draft → Publish with per-stage model selection, cost tracking, editable prompts and editorial rules, competitor intelligence, multi-platform publishing.

Built with **Astro 6 + Convex + Cloudflare Workers + OpenRouter via Cloudflare AI Gateway**.

> **Status**: Open scaffold. Extracted from a production deployment. Single-tenant by default; the schema has forward-compatible `workspaceId` columns so multi-tenant work won't be a destructive migration. See [`docs/multi-tenant.md`](docs/multi-tenant.md).

---

## What's included

**Pipeline core**
- 5-stage workflow: `research_in_progress → research_review → outline_in_progress → outline_review → draft_in_progress → draft_review → completed` (with reject paths and revision loops, max 3 per stage)
- Per-stage model overrides; per-workflow model overrides on top of that
- Persistent agent threads — feedback compounds across revisions
- Cost tracking: estimated (pre-run) and actual (post-run, from token logs) reconciled in the analytics dashboard
- Cloudflare AI Gateway is the single audited LLM chokepoint (spend caps, unified logging)

**Configuration without deploys** — see [`docs/prompts.md`](docs/prompts.md), [`docs/niche-setup.md`](docs/niche-setup.md)
- **Niche generator** (`/admin/content?tab=setup`): describe your niche + audience, optionally drop in your website URL, get six tailored agent prompts in one click. Lock-aware: custom edits aren't clobbered.
- **DB-driven agent prompts** (`/admin/content?tab=prompts`): research / outline / draft + 3 format adapters editable inline; resolver falls back to the bundled defaults until you customize.
- **Editorial rules** (`/admin/content?tab=rules`): per-category constraints injected into every agent prompt at runtime.

**Output formats** — see [`docs/format-adapters.md`](docs/format-adapters.md)
- `blog_post` (default), `twitter_thread`, `linkedin_article`, `newsletter_issue`. Each is a draft-stage instruction block that's appended to the base draft prompt.

**Multi-platform publishing** — see [`docs/social-publishing.md`](docs/social-publishing.md)
- **Zernio** for X / LinkedIn / Threads / IG / 11 more — drop in API key + profile IDs.
- **Resend** for newsletter broadcasts — configure `AUTH_RESEND_KEY` in the Convex dashboard.
- Auto-publish gated by config; failures land on `articleWorkflows.socialPublish` and can be retried.

**Competitor intelligence**
- Scrape competitor URLs → LLM-tag content → cluster matrix and gap analysis → generate briefs that feed the pipeline.

**Operations**
- Convex Auth: Google OAuth (sign-in via Google).
- Web push notifications when a draft hits review.
- Action log: audit trail of every pipeline state change.
- Public blog: scheduled publishing, edge cache, i18n translation overlay, in-browser markdown editor.
- Cloudflare Images media picker.

**Quality scaffolding** — see [`docs/development.md`](docs/development.md)
- Biome lint + format.
- Vitest unit tests + convex-test integration tests.
- GitHub Actions CI: install → codegen → lint → typecheck → test → build.
- SessionStart hook for Claude Code on the web sessions.

---

## Prerequisites

| Service | Purpose | Free tier |
|---|---|---|
| [Cloudflare](https://cloudflare.com) | Workers (host), KV (sessions), Images (media), AI Gateway (LLM router) | Yes |
| [Convex](https://convex.dev/referral/ALSTEM6599) | DB + serverless functions + workflows + agents + auth | Yes (generous) |
| [OpenRouter](https://openrouter.ai) | LLM provider (200+ models incl. Perplexity Sonar for research) | Pay-per-use |
| [Firecrawl](https://firecrawl.dev) | Research agent + competitor scraping + niche-generator site extract | 500 pages/mo free |
| [Resend](https://resend.com) | Newsletter broadcasts (publishing) | Yes |
| [Zernio](https://zernio.com/signup?ref=432A6295) | Optional — social publishing aggregator | 20 posts/mo free |

---

## Quick start

```bash
git clone https://github.com/your-org/social-pipeline
cd social-pipeline
pnpm install

# 1. Initialize Convex (creates your deployment, generates _generated/)
pnpx convex dev

# 2. Copy env template and fill in your keys
cp .env.example .env.local

# 3. Run migrations to seed editorial rules, model catalog, cost assumptions
pnpx convex run migrations/runner:runPending '{}'

# 4. Start the dev server (in a second terminal)
pnpm dev

# 5. Open the admin panel
open http://localhost:4321/admin/content?tab=setup
```

The first stop is the **Setup** tab — describe your niche, hit Generate, review the six tailored prompts, click Apply. Then create your first workflow on the Pipeline tab.

See [`docs/setup.md`](docs/setup.md) for full bring-up instructions including secrets, KV namespace, and Cloudflare Images.

---

## Architecture (high level)

```
Browser (Astro + React islands)
    │
    ├── /                  → Public landing page
    ├── /admin/content     → Setup, Blog, Pods, Pipeline, Models, Prompts, Rules, FAQ
    ├── /admin/analytics   → Cost dashboard (estimated vs actual)
    ├── /admin/action-log  → Audit trail
    └── /blog/*            → Public blog (static, edge-cached, i18n overlay)

Convex (backend)
    ├── workflows/contentPipeline.ts  → Durable 3-agent loop with revision handling
    ├── agents/
    │     ├── runner.ts                → Research / Outline / Draft internal actions
    │     ├── instructionsResolver.ts  → DB-vs-fallback prompt lookup
    │     ├── editorialContext.ts      → Injects rules into every agent prompt
    │     ├── formatAdapters.ts        → Per-format draft instruction constants
    │     └── parseNewsletterDraft.ts  → newsletter_issue → {subject, preview, body}
    ├── admin/
    │     ├── nicheGenerator.ts        → Niche profile → six tailored prompts
    │     ├── agentInstructions.ts     → CRUD for prompt overrides
    │     ├── editorialRules.ts        → CRUD for editorial rules
    │     ├── contentPipeline.ts       → Workflow CRUD + approvals + cost
    │     ├── competitorIntel.ts       → Scrape → tag → brief
    │     ├── zernioPublish.ts         → Social publishing
    │     ├── resendNewsletter.ts      → Newsletter broadcasts
    │     └── media.ts                 → Cloudflare Images
    ├── catalog/  → Model registry + cost tracking
    └── lib/aiGateway.ts → All LLM calls funnel through here

Cloudflare Workers (edge)
    └── AI Gateway → spend caps + logging
```

See [`docs/architecture.md`](docs/architecture.md) for the detailed flow.

---

## Documentation index

- [`docs/setup.md`](docs/setup.md) — bring-up checklist
- [`docs/architecture.md`](docs/architecture.md) — pipeline state machine, agent runner, config layers
- [`docs/niche-setup.md`](docs/niche-setup.md) — using the niche generator
- [`docs/prompts.md`](docs/prompts.md) — DB-driven agent prompts
- [`docs/format-adapters.md`](docs/format-adapters.md) — adding output formats
- [`docs/social-publishing.md`](docs/social-publishing.md) — Zernio + Resend
- [`docs/multi-tenant.md`](docs/multi-tenant.md) — workspaceId columns + roadmap
- [`docs/development.md`](docs/development.md) — lint, tests, CI, SessionStart hook
- [`docs/next-js-migration.md`](docs/next-js-migration.md) — Astro → Next.js adapter swap

---

## Deployment

```bash
pnpm build
wrangler deploy
pnpx convex deploy
```

Or rely on the `.github/workflows/ci.yml` GitHub Action for typecheck/lint/test on PRs (deploy steps are deliberately not wired — add them when you're ready).

---

## License

MIT
