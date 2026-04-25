# Setup Guide

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

This creates a dev deployment, generates `convex/_generated/`, and starts watching for schema changes. Keep it running in a terminal.

Copy the deployment URL printed by the command (e.g. `https://your-deployment.convex.cloud`) — you'll need it.

## 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `CF_AI_GATEWAY_NAME` | Cloudflare Dashboard → AI Gateway → create a gateway, use the slug |
| `CF_ACCOUNT_ID` | Cloudflare Dashboard → top-right account selector |
| `CF_IMAGES_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens → create token with Images:Edit |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `FIRECRAWL_API_KEY` | https://firecrawl.dev |
| `AUTH_RESEND_KEY` | https://resend.com/api-keys (used for OTP emails) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Run: `npx web-push generate-vapid-keys` |

Set these as Convex environment variables too (the agents run server-side in Convex actions):

```bash
pnpx convex env set CF_AI_GATEWAY_NAME "your-gateway-slug"
pnpx convex env set CF_ACCOUNT_ID "your-account-id"
pnpx convex env set CF_IMAGES_TOKEN "your-token"
pnpx convex env set OPENROUTER_API_KEY "sk-or-..."
pnpx convex env set FIRECRAWL_API_KEY "fc-..."
pnpx convex env set AUTH_RESEND_KEY "re_..."
pnpx convex env set VAPID_PRIVATE_KEY "your-private-key"
```

## 4. Configure Cloudflare AI Gateway

1. Go to Cloudflare Dashboard → AI Gateway → Create gateway
2. Note the gateway slug (e.g. `my-pipeline-gateway`)
3. Add a spend limit (recommended: $10/month to start)
4. Enable logging for model observability

The gateway is used for **all** LLM calls — never bypass it. See `convex/lib/aiGateway.ts` for the implementation.

## 5. Update wrangler.toml

Edit `wrangler.toml`:
- Replace `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` with your KV namespace ID
- Replace `your-deployment.convex.cloud` with your Convex URL
- Replace `REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY` with your VAPID public key
- Replace `REPLACE_WITH_YOUR_IMAGES_HASH` with your Cloudflare Images account hash

To create the KV namespace:
```bash
wrangler kv namespace create SESSION
# Copy the id from the output into wrangler.toml
```

To find your Cloudflare Images account hash:
- Cloudflare Dashboard → Images → Overview → "Account Hash"

## 6. Run initial migrations

```bash
pnpx convex run migrations/runner:runPending '{}'
```

This seeds agent configs, available models, editorial rules, and pipeline cost assumptions.

## 7. Start the dev server

```bash
pnpm dev
```

Open http://localhost:4321/admin — you should see the admin panel.

## 8. Create your first pipeline workflow

1. Go to `/admin/content` → Pipeline tab
2. Click "New Workflow"
3. Enter a topic, keywords, and target audience
4. Click "Start Research"
5. Wait for research to complete, review, approve
6. Outline and draft stages follow the same pattern

## Production deploy

```bash
git push origin main
# If CI is configured, this auto-deploys Convex + Cloudflare Worker

# Manual deploy:
pnpx convex deploy -y
wrangler deploy
```
