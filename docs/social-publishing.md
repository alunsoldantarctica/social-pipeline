# Social Publishing — Zernio Integration

## What is Zernio?

Zernio (formerly Late/getlate.dev) is a unified social media publishing API that lets you post to 15+ platforms with a single REST call.

**Docs**: https://docs.zernio.com

**Supported platforms**: Instagram, TikTok, X/Twitter, Facebook, LinkedIn, YouTube, WhatsApp, Threads, Pinterest, Reddit, Bluesky, Telegram, Discord, Snapchat, Google Business

**Pricing**:
| Plan | Price | Posts/month |
|---|---|---|
| Free | $0 | 20 |
| Build | $19/month | 120 |
| Accelerate | $49/month | Unlimited (fair use) |
| Unlimited | $999/month | No limits |

No overage fees — exceeding limits pauses posting until you upgrade.

## API Reference

**Base URL**: `https://api.zernio.com/api/v1`

**Authentication**: Bearer token (`sk_` prefix + 64 hex chars)

```
Authorization: Bearer sk_abc123...
```

**Create/schedule a post**:
```
POST /api/v1/posts
{
  "profiles": ["profile_id_1", "profile_id_2"],
  "content": {
    "text": "Your post content here",
    "media": ["https://imagedelivery.net/hash/image-id/public"]  // optional
  },
  "scheduledAt": "2026-05-01T10:00:00Z"  // optional, ISO 8601
}
```

**List connected profiles** (to get profile IDs):
```
GET /api/v1/profiles
```

No official TypeScript/JavaScript SDK as of April 2026 — the integration uses raw `fetch`.

## Setup

### 1. Create a Zernio account

Sign up at https://zernio.com. Connect your social accounts in the dashboard.

### 2. Get your API key

Zernio Dashboard → Settings → API → Generate API key (starts with `sk_`)

### 3. Set the env var

```bash
# In .env.local
ZERNIO_API_KEY=sk_your_key_here

# In Convex environment
pnpx convex env set ZERNIO_API_KEY "sk_your_key_here"
```

### 4. Get your profile IDs

```bash
# Run the listZernioProfiles action from the Convex dashboard
pnpx convex run admin/zernioPublish:listZernioProfiles '{}'
```

Note the profile IDs for the platforms you want to target.

### 5. Wire the publish action

In `convex/admin/contentPipeline.ts`, find the `approveForPublish` mutation and add the Zernio call:

```ts
import { internal } from "../_generated/api";

// After creating the blogPost record...
if (workflow.outputFormat === "twitter_thread") {
  const threadContent = formatThreadForZernio(draftOutput.content);
  await ctx.scheduler.runAfter(0, internal.admin.zernioPublish.publishToZernio, {
    workflowRecordId: args.id,
    profiles: ["your_twitter_profile_id"],
    content: threadContent,
  });
}
```

## Format-to-platform mapping

| `outputFormat` | Recommended platform |
|---|---|
| `blog_post` | Internal blog only (no Zernio needed) |
| `twitter_thread` | X/Twitter |
| `linkedin_article` | LinkedIn |
| `newsletter_issue` | Your newsletter tool (Beehiiv, Resend, etc.) |

## Newsletter delivery

Zernio does **not** handle email newsletters. For email delivery, consider:

- **[Resend](https://resend.com)** — transactional + broadcast, clean API, good free tier
- **[Beehiiv](https://beehiiv.com)** — newsletter platform with its own API, audience management
- **[ConvertKit (Kit)](https://kit.com)** — creator-focused, tag-based segmentation

The `newsletter_issue` format outputs a structured draft (subject, preview, sections, CTA). You'd post the content to your newsletter tool's API to send.

## Future improvements

- [ ] Zernio TypeScript SDK (watch https://github.com/zernio-dev for releases)
- [ ] Auto-schedule posts on calendar from contentCalendar table
- [ ] Per-workflow Zernio profile selection in the admin UI
- [ ] Webhook handling for Zernio post status updates (published, failed, etc.)
