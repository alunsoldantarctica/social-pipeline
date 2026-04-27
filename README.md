# social-pipeline

An open-source AI content pipeline scaffold. Research → Outline → Draft → Publish with per-stage model selection, cost tracking, editorial rules, competitor intelligence, and push notifications.

Built with **Astro 6 + Convex + Cloudflare Workers + OpenRouter via Cloudflare AI Gateway**.

> **Status**: Private scaffold. Extracted from a production deployment. Not yet production-hardened for multi-tenant use.

---

## What's included

- **5-stage pipeline**: research_in_progress → research_review → outline_in_progress → outline_review → draft_in_progress → draft_review → completed
- **Per-stage model overrides**: swap any stage to any OpenRouter/Google/Workers AI model per workflow
- **Cost tracking**: estimated vs actual token cost at every step; AI Gateway spend limits enforced
- **Editorial rules**: database-driven editorial constraints injected into every agent prompt — edit without a deploy
- **Content pods**: pillar strategy — group articles into topic clusters
- **Competitor intelligence**: scrape competitor URLs → tag content → generate briefs → send to pipeline
- **Format adapters**: blog_post / twitter_thread / linkedin_article / newsletter_issue (architecture ready; draft instructions per format)
- **Push notifications**: web push when drafts hit review stage
- **Action log**: audit trail of every pipeline state change
- **Cloudflare Images**: direct-upload media picker (no third-party dependency)
- **Blog**: public blog pages with scheduled publishing and i18n overlay
- **Markdown editor**: in-browser draft editing with preview
- **Zernio integration**: drop in your API key + profile IDs and approved drafts auto-publish to 15+ social platforms; manual retry available

---

## Prerequisites

| Service | Purpose | Free tier |
|---|---|---|
| [Cloudflare account](https://cloudflare.com) | Workers, KV (sessions), Images (media picker) | Yes |
| [Convex account](https://convex.dev) | Backend DB + serverless functions | Yes (generous) |
| [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) | Routes all LLM calls, enforces spend limits | Yes |
| [OpenRouter](https://openrouter.ai) | Access to 200+ models (Perplexity Sonar for research) | Pay-per-use |
| [Firecrawl](https://firecrawl.dev) | Web research agent tool | Free tier (500 pages/mo) |
| Auth | Convex Auth (email OTP built-in) — no extra service | Built-in |

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

# 3. Start the dev server (in a second terminal)
pnpm dev

# 4. Open the admin panel
open http://localhost:4321/admin
```

See [`docs/setup.md`](docs/setup.md) for full setup instructions.

---

## Architecture

```
Browser (Astro + React islands)
    │
    ├── /admin/*        → Admin panel (React, client:load)
    │     ├── /content  → Pipeline + blog management
    │     ├── /analytics → AI cost dashboard
    │     └── /action-log → Audit trail
    │
    └── /blog/*         → Public blog (static, edge-cached)

Convex (backend)
    ├── agents/
    │     ├── runner.ts      → Research / Outline / Draft actions
    │     ├── instructions.ts → System prompts (TODO: customize for niche)
    │     ├── editorialContext.ts → Injects rules + live data into every prompt
    │     └── formatAdapters.ts  → Per-format draft instructions
    │
    ├── admin/
    │     ├── contentPipeline.ts → Pipeline mutations + queries
    │     ├── competitorIntel.ts → Competitor scrape + tagging
    │     ├── media.ts           → Cloudflare Images API
    │     └── zernioPublish.ts   → Social publishing stub
    │
    └── catalog/ → Model cost tracking (estimated vs actual)

Cloudflare Workers (edge)
    └── AI Gateway → all LLM calls routed here for spend limits + logging
```

---

## Customizing for your niche

1. **Instructions** — Edit `convex/agents/instructions.ts`. Replace the generic research/outline/draft prompts with your domain context. The `TODO: customize for your niche` comments mark the key spots.

2. **Editorial rules** — Go to `/admin/content?tab=rules`. Add/edit rules without touching code. These inject into every agent prompt at runtime.

3. **Blog categories** — Edit the `category` field in `convex/schema/content.ts`. Change the string union to match your taxonomy.

4. **Format adapters** — Edit `convex/agents/formatAdapters.ts`. Each format gets its own instruction block. See [`docs/format-adapters.md`](docs/format-adapters.md).

---

## Social publishing (Zernio)

See [`docs/social-publishing.md`](docs/social-publishing.md) for full setup.

Zernio (formerly Late/getlate.dev) publishes to 15+ platforms via a single REST API call. The pipeline is already wired:

1. Set `ZERNIO_API_KEY` in your Convex environment
2. Run `admin/zernioPublish:listZernioProfiles` to discover profile IDs
3. Save profile-to-format mappings via `admin/zernioPublish:updateZernioConfig` with `autoPublish: true`
4. Approved non-blog drafts publish automatically; failures land on `articleWorkflows.socialPublish` and can be retried with `manualPublishWorkflow`

---

## Framework alternatives (Next.js)

See [`docs/next-js-migration.md`](docs/next-js-migration.md) for the adapter swap guide. The Convex client wiring is framework-agnostic.

---

## Deployment

```bash
# Deploy to Cloudflare Workers (auto-deploys on GitHub push if CI is set up)
pnpm build
wrangler deploy
```

---

## License

MIT
