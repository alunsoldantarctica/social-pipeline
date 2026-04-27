# Deploying to Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/alunsoldantarctica/social-pipeline)

The button deploys the Astro frontend to Cloudflare Workers. The Convex backend requires a few manual steps after.

---

## Step 1 — Click the button

The deploy button will:
1. Fork this repo to your GitHub account
2. Prompt you to connect your Cloudflare account
3. Run `wrangler deploy` — your Worker is live

---

## Step 2 — Create a Convex project

**[Sign up for Convex](https://convex.dev/referral/ALSTEM6599)** (referral link — gets you priority support), then:

```bash
npx convex dev
```

This opens a browser to connect your Convex account and create a deployment. Once done, copy the deployment URL (e.g. `https://happy-animal-123.convex.cloud`).

---

## Step 3 — Set Convex environment variables

In the [Convex dashboard](https://dashboard.convex.dev) under your deployment → Settings → Environment Variables:

| Variable | Where to get it |
|----------|----------------|
| `AUTH_GOOGLE_ID` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client |
| `AUTH_GOOGLE_SECRET` | Same place |
| `AUTH_RESEND_KEY` | [Resend dashboard](https://resend.com/api-keys) — needed for newsletter broadcasts |
| `ADMIN_API_TOKEN` | Generate: `openssl rand -hex 32` |
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `FIRECRAWL_API_KEY` | [firecrawl.dev](https://firecrawl.dev) |
| `ZERNIO_API_KEY` | Optional — [Zernio](https://zernio.com/signup?ref=432A6295) for social publishing (X, LinkedIn, Threads, etc.) |

For Google OAuth, set the authorized redirect URI in Google Cloud Console to:
```
https://<your-convex-deployment>.convex.site/api/auth/callback/google
```

---

## Step 4 — Update wrangler.toml

In your forked repo, edit `wrangler.toml`:

```toml
[vars]
SITE_URL = "https://your-worker.workers.dev"
PUBLIC_CONVEX_URL = "https://your-deployment.convex.cloud"
```

---

## Step 5 — Create KV namespace for sessions

```bash
wrangler kv namespace create SESSION
```

Copy the output `id` into `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "SESSION"
id = "paste-id-here"
```

---

## Step 6 — Set Worker secrets

```bash
wrangler secret put VAPID_PRIVATE_KEY
```

Generate VAPID keys if you need push notifications:
```bash
npx web-push generate-vapid-keys
```

Also add `PUBLIC_VAPID_KEY` to `wrangler.toml [vars]`.

---

## Step 7 — Redeploy

```bash
pnpm build && wrangler deploy
```

Or push to `main` — the GitHub Actions workflow in `.github/workflows/deploy.yml` handles it automatically once you add these repository secrets:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar |

And these repository variables (Settings → Variables):

| Variable | Value |
|----------|-------|
| `PUBLIC_CONVEX_URL` | Your Convex deployment URL |
| `SITE_URL` | Your Worker URL |

---

## Running migrations

After Convex is set up:

```bash
npx convex run migrations/runner:runPending
```

---

## Local development

```bash
# Terminal 1 — Convex backend
npx convex dev

# Terminal 2 — Astro frontend
pnpm dev
```

Visit `http://localhost:4321/admin` → redirects to onboarding wizard.
