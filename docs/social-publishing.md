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

## How it's wired

The integration lives in `convex/admin/zernioPublish.ts` and is invoked at the end of the content pipeline workflow (`convex/workflows/contentPipeline.ts`):

1. After the draft is approved and the blog post is created, the workflow reads the `zernio` row from `siteSettings`.
2. If `autoPublish` is true, it calls `internal.admin.zernioPublish.publishWorkflow` for the workflow.
3. `publishWorkflow` looks up the profile IDs for the workflow's `outputFormat`, formats the draft for the platform (see `formatForPlatform`), and POSTs to `/api/v1/posts`.
4. The result is recorded on `articleWorkflows.socialPublish` (`status`, `postIds`, `error`, etc.).
5. Failures are non-fatal — the workflow stays `completed` and you can retry from the admin UI.

For `outputFormat = "blog_post"` the publish is skipped (the internal blog handles that). For `newsletter_issue`, Zernio is invoked but consider switching to a real newsletter tool (see below).

## Setup

### 1. Create a Zernio account

Sign up at https://zernio.com. Connect your social accounts in the dashboard.

### 2. Get your API key

Zernio Dashboard → Settings → API → Generate API key (starts with `sk_`)

### 3. Set the env var

```bash
# In .env.local
ZERNIO_API_KEY=sk_your_key_here

# In Convex environment (this is what publishToZernio actually reads)
pnpx convex env set ZERNIO_API_KEY "sk_your_key_here"
```

### 4. Discover your profile IDs

```bash
# As an authed admin (browser) you can also run this from the admin UI;
# from the CLI pass an admin API token:
pnpx convex run admin/zernioPublish:listZernioProfiles '{}'
```

Note the profile IDs for the platforms you want to target.

### 5. Save the profile mapping

Call `updateZernioConfig` once with your profile IDs grouped by output format. Example:

```bash
pnpx convex run admin/zernioPublish:updateZernioConfig '{
  "autoPublish": true,
  "profilesByFormat": {
    "twitter_thread": ["prof_x_main"],
    "linkedin_article": ["prof_li_company"],
    "newsletter_issue": []
  }
}'
```

`autoPublish: true` makes the workflow auto-publish after a draft is approved. Set to `false` to gate publishing behind the manual trigger.

### 6. (Optional) Verify

```bash
pnpx convex run admin/zernioPublish:testZernioConnection '{}'
# → { ok: true, profiles: [...] } or { ok: false, error: "..." }
```

## Manual publishing

To publish a workflow that's already `completed` (e.g. one that failed, or that was created before `autoPublish` was enabled):

```bash
pnpx convex run admin/zernioPublish:manualPublishWorkflow \
  '{"id": "j97abc...articleWorkflowsId"}'
```

Pass `scheduledAt` (Unix ms) to schedule rather than publish now.

## Format-to-platform mapping

| `outputFormat` | Behavior |
|---|---|
| `blog_post` | Skipped — internal blog only |
| `twitter_thread` | Joined by blank lines, sent to configured X profiles |
| `linkedin_article` | Markdown stripped (headings, bold, bullets), sent to LinkedIn profiles |
| `newsletter_issue` | Sent as plain markdown — but consider a real newsletter tool below |

Format adapters in `convex/agents/formatAdapters.ts` already shape the draft for each platform; `formatForPlatform` in `zernioPublish.ts` does a final pass for Zernio's plain-text content body.

## Newsletter delivery

Zernio does **not** handle email newsletters. For email delivery, consider:

- **[Resend](https://resend.com)** — transactional + broadcast, clean API, good free tier
- **[Beehiiv](https://beehiiv.com)** — newsletter platform with its own API, audience management
- **[ConvertKit (Kit)](https://kit.com)** — creator-focused, tag-based segmentation

The `newsletter_issue` format outputs a structured draft (subject, preview, sections, CTA). Send it to your newsletter tool's API instead of Zernio.

## Public functions

| Function | Type | Purpose |
|---|---|---|
| `getZernioConfig` | `adminQuery` | Read current profile config (no API key leaked) |
| `updateZernioConfig` | `adminMutation` | Save profile mapping + autoPublish toggle |
| `listZernioProfiles` | `adminAction` | Fetch connected profiles from Zernio |
| `testZernioConnection` | `adminAction` | Same as above but returns `{ok, error?}` |
| `manualPublishWorkflow` | `adminAction` | Force-publish (or re-publish) one workflow |

Internal:

| Function | Type | Purpose |
|---|---|---|
| `publishWorkflow` | `internalAction` | Pipeline-side publish; records status on workflow |
| `publishToZernio` | `internalAction` | Low-level POST `/posts` (use `publishWorkflow` instead) |
| `_readZernioRow` | `internalQuery` | Reads the `siteSettings` row with `key="zernio"` |
| `_seedZernioConfig` | `internalMutation` | CLI/migration seeder |

## Future improvements

- [ ] Zernio TypeScript SDK (watch https://github.com/zernio-dev for releases)
- [ ] Auto-schedule posts on calendar from `contentCalendar` table
- [ ] Per-workflow profile selection in the admin UI (currently global per format)
- [ ] Webhook handling for Zernio post status updates (published, failed, etc.) — they would close the loop on `socialPublish.status` rather than relying on the synchronous response
- [ ] Per-platform character/length validation before send
