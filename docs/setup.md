# Setup Guide

End-to-end bring-up. Should take roughly 30 minutes assuming you already have accounts; up to a couple hours including account creation.

## 1. Clone and install

```bash
git clone https://github.com/your-org/social-pipeline
cd social-pipeline
pnpm install
```

## 2. Initialize Convex

```bash
pnpx convex dev
```

This creates a dev deployment, generates `convex/_generated/`, and starts watching for schema changes. **Keep it running** in a terminal.

Copy the deployment URL printed by the command (e.g. `https://your-deployment.convex.cloud`) — you'll need it for `wrangler.toml` and `PUBLIC_CONVEX_URL`.

## 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Purpose | Where to get it |
|---|---|---|
| `SITE_URL` | Production canonical URL (used by Astro for sitemap + canonical tags) | Your domain — placeholder is fine for dev |
| `CF_AI_GATEWAY_NAME` | AI Gateway slug for routing all LLM calls | Cloudflare Dashboard → AI Gateway → create gateway, copy slug |
| `CF_ACCOUNT_ID` | Cloudflare account ID (32 hex chars) | Cloudflare Dashboard → top-right account selector |
| `CF_IMAGES_TOKEN` | API token for Cloudflare Images uploads | Cloudflare Dashboard → My Profile → API Tokens → create token with `Images:Edit` |
| `OPENROUTER_API_KEY` | LLM access (default research model uses Perplexity Sonar via OpenRouter) | <https://openrouter.ai/keys> |
| `FIRECRAWL_API_KEY` | Web search + scraping for the research agent and the niche generator | <https://firecrawl.dev> |
| `AUTH_RESEND_KEY` | Resend API key — also used for newsletter broadcasts (see [social-publishing.md](social-publishing.md)) | <https://resend.com/api-keys> |
| `AUTH_RESEND_SECRET` | Random hex used to sign OTP-log internal endpoint | `openssl rand -hex 32` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth (optional — email OTP also works) | Google Cloud Console → OAuth credentials |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web push notifications | `npx web-push generate-vapid-keys` |
| `ZERNIO_API_KEY` | Optional — social publishing | <https://zernio.com> Settings → API |

Set the runtime keys as Convex environment variables too (the agents run server-side in Convex actions):

```bash
pnpx convex env set CF_AI_GATEWAY_NAME "your-gateway-slug"
pnpx convex env set CF_ACCOUNT_ID "your-account-id"
pnpx convex env set CF_IMAGES_TOKEN "your-token"
pnpx convex env set CLOUDFLARE_IMAGES_HASH "your-images-hash"
pnpx convex env set OPENROUTER_API_KEY "sk-or-..."
pnpx convex env set FIRECRAWL_API_KEY "fc-..."
pnpx convex env set AUTH_RESEND_KEY "re_..."
pnpx convex env set VAPID_PRIVATE_KEY "your-private-key"
# Optional:
pnpx convex env set ZERNIO_API_KEY "sk_..."
```

## 4. Configure Cloudflare AI Gateway

1. Cloudflare Dashboard → AI Gateway → Create gateway
2. Note the gateway slug (e.g. `my-pipeline-gateway`)
3. Add a spend limit (recommended: $10/month to start)
4. Enable logging for model observability

The gateway is used for **all** LLM calls — never bypass it. See `convex/lib/aiGateway.ts`.

## 5. Create the KV namespace and update `wrangler.toml`

```bash
wrangler kv namespace create SESSION
# Copy the printed id into wrangler.toml under [[kv_namespaces]]
```

Edit `wrangler.toml`:
- Replace `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` with the KV id from above
- Replace `https://your-deployment.convex.cloud` with your Convex URL
- Replace `REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY` with your VAPID public key
- Replace `REPLACE_WITH_YOUR_IMAGES_HASH` with your Cloudflare Images account hash (Dashboard → Images → Overview → "Account Hash")
- Update `SITE_URL` to your production domain (it's read at build time by `astro.config.mjs`)

## 6. Run initial migrations

```bash
pnpx convex run migrations/runner:runPending '{}'
```

Seeds: agent configs, available models, editorial rules, pipeline cost assumptions.

## 7. Start the dev server

```bash
pnpm dev
```

Open <http://localhost:4321/admin/content?tab=setup>.

## 8. Configure your niche (the important first step)

The **Setup** tab is the first thing you should hit:

1. Enter your **website URL** (optional — the generator will scrape it for brand voice and CTAs).
2. Describe your **niche** in a few sentences.
3. Describe your **target audience**.
4. Click **Generate prompts**.
5. Review the six tailored prompts side-by-side against the bundled defaults.
6. Tick the slots you want to apply, click **Apply**.

That writes the six prompts (research, outline, draft + 3 format adapters) into the `agentInstructions` table. Custom edits in the Prompts tab from here on are locked unless you re-run with "Override custom edits" checked.

See [`docs/niche-setup.md`](niche-setup.md) for the full guide.

## 9. (Optional) Configure publishing

- **Zernio** (X / LinkedIn / IG / 11 more): see [`docs/social-publishing.md`](social-publishing.md#zernio-setup).
- **Resend newsletters** (`newsletter_issue` format): see [`docs/social-publishing.md`](social-publishing.md#newsletter-delivery-resend).

Both are optional; without them, drafts still complete and land as blog posts.

## 10. Create your first workflow

1. `/admin/content?tab=pipeline` → New workflow
2. Topic, keywords, target audience, output format
3. Start research → wait → review → approve → outline → draft → publish

## Production deploy

```bash
pnpm build
wrangler deploy
pnpx convex deploy
```

CI is configured in `.github/workflows/ci.yml` — runs typecheck, lint, test, build on PRs and pushes to `main`. Add deploy steps when you're ready.

## Troubleshooting

- **`pnpm typecheck` fails on `convex/_generated/api`**: run `pnpx convex dev` once to generate the types.
- **`pnpm install` 403 in a sandboxed CI**: set `CONVEX_DEPLOY_KEY` as a repo secret so codegen can run; whitelist `registry.npmjs.org` in your CI environment.
- **Niche generator returns 401 from Firecrawl**: check `FIRECRAWL_API_KEY` is set in Convex env, not just `.env.local`.
- **Pipeline workflow stuck at `_in_progress`**: check `/admin/action-log` for the agent error; if the model returned malformed JSON, re-run via the Pipeline tab's retry.
