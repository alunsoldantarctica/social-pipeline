/**
 * Zernio Social Publishing Adapter
 *
 * Zernio (formerly Late/getlate.dev) — unified social publishing API.
 * Docs: https://docs.zernio.com
 *
 * Supported platforms: Instagram, TikTok, X/Twitter, Facebook, LinkedIn,
 * YouTube, WhatsApp, Threads, Pinterest, Reddit, Bluesky, Telegram,
 * Discord, Snapchat, Google Business.
 *
 * Required env var: ZERNIO_API_KEY (Bearer token, sk_ prefix)
 *
 * Storage:
 *   Profile config lives in the `siteSettings` row with key="zernio". It maps
 *   each outputFormat to one or more Zernio profile IDs and carries an
 *   `autoPublish` toggle. Edit via `updateZernioConfig` from the admin UI.
 *
 * Lifecycle:
 *   The content pipeline workflow calls `publishWorkflow` after a draft is
 *   approved and the blog post is created. For `blog_post` outputFormat the
 *   call is a no-op (status="skipped"). For other formats the action loads
 *   profile IDs from siteSettings, formats the draft for the platform, and
 *   POSTs to Zernio. Status is recorded on the workflow's `socialPublish`
 *   field. Errors are non-fatal — the workflow stays "completed" and the
 *   admin can retry via `manualPublishWorkflow`.
 */

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { adminAction, adminMutation, adminQuery } from "../lib/adminAuth";

const ZERNIO_BASE_URL = "https://api.zernio.com/api/v1";

type OutputFormat =
  | "blog_post"
  | "twitter_thread"
  | "linkedin_article"
  | "newsletter_issue";

type ZernioConfig = {
  autoPublish: boolean;
  profilesByFormat: Partial<Record<OutputFormat, string[]>>;
};

const EMPTY_CONFIG: ZernioConfig = {
  autoPublish: false,
  profilesByFormat: {},
};

function readConfig(row: unknown): ZernioConfig {
  if (!row || typeof row !== "object") return EMPTY_CONFIG;
  const r = row as {
    zernioAutoPublish?: boolean;
    zernioProfilesByFormat?: ZernioConfig["profilesByFormat"];
  };
  return {
    autoPublish: r.zernioAutoPublish ?? false,
    profilesByFormat: r.zernioProfilesByFormat ?? {},
  };
}

/**
 * Convert draft markdown into the platform-appropriate text Zernio expects.
 * Zernio's `content.text` is a single string; we strip markdown the platform
 * won't render and trim to safe lengths. The format adapter (formatAdapters.ts)
 * is what produced the draft, so the shape is already broadly correct here.
 */
export function formatForPlatform(
  outputFormat: OutputFormat,
  content: string,
): string {
  const trimmed = content.trim();
  switch (outputFormat) {
    case "twitter_thread": {
      // Drafts use lines containing only "---" between tweets. Zernio takes a
      // single text body — join with blank lines so the thread reads as a
      // single post if the platform doesn't auto-thread.
      return trimmed
        .split(/\r?\n---\r?\n/)
        .map((tweet) => tweet.trim())
        .filter(Boolean)
        .join("\n\n");
    }
    case "linkedin_article": {
      // LinkedIn renders basic markdown poorly via API; strip headings and
      // emphasis, keep bullets readable.
      return trimmed
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/^[-*]\s+/gm, "• ");
    }
    case "newsletter_issue":
    case "blog_post":
    default:
      return trimmed;
  }
}

// ===== INTERNAL: low-level Zernio API calls =====

async function zernioFetch(path: string, init: RequestInit = {}) {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) {
    throw new Error("ZERNIO_API_KEY is not set in Convex environment");
  }
  const res = await fetch(`${ZERNIO_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zernio ${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return await res.json();
}

/**
 * Low-level Zernio post call. Prefer `publishWorkflow` for pipeline use.
 */
export const publishToZernio = internalAction({
  args: {
    profiles: v.array(v.string()),
    content: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (_ctx, { profiles, content, mediaUrls, scheduledAt }) => {
    const body: Record<string, unknown> = {
      profiles,
      content: { text: content },
    };
    if (mediaUrls && mediaUrls.length > 0) {
      (body.content as Record<string, unknown>).media = mediaUrls;
    }
    if (scheduledAt) {
      body.scheduledAt = new Date(scheduledAt).toISOString();
    }
    return await zernioFetch("/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
});

// ===== INTERNAL: workflow integration =====

/**
 * Publish a completed workflow's draft to Zernio according to its outputFormat.
 * Idempotent in spirit — re-running on a workflow already marked "published"
 * will skip and return early. Records status on workflow.socialPublish.
 */
export const publishWorkflow = internalAction({
  args: {
    workflowRecordId: v.id("articleWorkflows"),
    scheduledAt: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { workflowRecordId, scheduledAt, force }) => {
    const workflow = await ctx.runQuery(
      internal.admin.contentPipeline.getWorkflow,
      { id: workflowRecordId },
    );
    if (!workflow) throw new Error("Workflow not found");

    if (!force && workflow.socialPublish?.status === "published") {
      return { status: "skipped", reason: "already published" };
    }

    const outputFormat = (workflow.outputFormat ?? "blog_post") as OutputFormat;
    const settingsRow = await ctx.runQuery(
      internal.admin.zernioPublish._readZernioRow,
      {},
    );
    const config = readConfig(settingsRow);
    const profileIds = config.profilesByFormat[outputFormat] ?? [];

    if (outputFormat === "blog_post") {
      await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
        id: workflowRecordId,
        socialPublish: {
          status: "skipped",
          provider: "zernio",
          attemptedAt: Date.now(),
        },
      });
      return { status: "skipped", reason: "blog_post — internal publish only" };
    }

    if (profileIds.length === 0) {
      const reason = `No Zernio profiles configured for outputFormat=${outputFormat}`;
      await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
        id: workflowRecordId,
        socialPublish: {
          status: "skipped",
          provider: "zernio",
          attemptedAt: Date.now(),
          error: reason,
        },
      });
      return { status: "skipped", reason };
    }

    const draftContent: string | undefined = workflow.draftOutput?.content;
    if (!draftContent) {
      throw new Error("Workflow has no draftOutput.content to publish");
    }

    const text = formatForPlatform(outputFormat, draftContent);
    const now = Date.now();

    await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
      id: workflowRecordId,
      socialPublish: {
        status: "pending",
        provider: "zernio",
        profileIds,
        scheduledAt,
        attemptedAt: now,
      },
    });

    try {
      const result = await zernioFetch("/posts", {
        method: "POST",
        body: JSON.stringify({
          profiles: profileIds,
          content: { text },
          ...(scheduledAt
            ? { scheduledAt: new Date(scheduledAt).toISOString() }
            : {}),
        }),
      });
      const postIds = extractPostIds(result);
      await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
        id: workflowRecordId,
        socialPublish: {
          status: "published",
          provider: "zernio",
          profileIds,
          postIds,
          scheduledAt,
          attemptedAt: now,
          publishedAt: Date.now(),
        },
      });
      return { status: "published", postIds };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
        id: workflowRecordId,
        socialPublish: {
          status: "failed",
          provider: "zernio",
          profileIds,
          scheduledAt,
          attemptedAt: now,
          error: message,
        },
      });
      throw error;
    }
  },
});

export function extractPostIds(result: unknown): string[] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const obj = result as Record<string, unknown>;
  const posts = obj.posts ?? obj.data;
  if (Array.isArray(posts)) {
    const ids = posts
      .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>).id : undefined))
      .filter((id): id is string => typeof id === "string");
    if (ids.length > 0) return ids;
  }
  if (typeof obj.id === "string") return [obj.id];
  return undefined;
}

// ===== INTERNAL: settings row reader (actions can't read DB directly) =====

export const _readZernioRow = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "zernio"))
      .first();
  },
});

// ===== ADMIN: configuration =====

/**
 * Read Zernio profile config (does NOT return the API key).
 */
export const getZernioConfig = adminQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "zernio"))
      .first();
    return readConfig(row);
  },
});

/**
 * Save Zernio profile config. Pass the full mapping each time — this replaces.
 */
export const updateZernioConfig = adminMutation({
  args: {
    autoPublish: v.boolean(),
    profilesByFormat: v.object({
      twitter_thread: v.optional(v.array(v.string())),
      linkedin_article: v.optional(v.array(v.string())),
      newsletter_issue: v.optional(v.array(v.string())),
      blog_post: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, { autoPublish, profilesByFormat }) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "zernio"))
      .first();
    const patch = {
      key: "zernio",
      zernioAutoPublish: autoPublish,
      zernioProfilesByFormat: profilesByFormat,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", patch);
  },
});

// ===== ADMIN: actions =====

/**
 * List connected Zernio profiles. Use this to discover IDs to paste into
 * `updateZernioConfig`. Requires ZERNIO_API_KEY in Convex env.
 */
export const listZernioProfiles = adminAction({
  args: {},
  handler: async () => {
    return await zernioFetch("/profiles");
  },
});

/**
 * Verify Zernio credentials and fetch the profile list. UI helper.
 */
export const testZernioConnection = adminAction({
  args: {},
  handler: async () => {
    try {
      const profiles = await zernioFetch("/profiles");
      return { ok: true, profiles } as const;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } as const;
    }
  },
});

/**
 * Manually trigger a Zernio publish for a workflow. Useful for retries after
 * a failed auto-publish, or for publishing workflows that were created before
 * autoPublish was enabled. Always force-reruns regardless of prior status.
 */
export const manualPublishWorkflow = adminAction({
  args: {
    id: v.id("articleWorkflows"),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, scheduledAt }) => {
    return await ctx.runAction(internal.admin.zernioPublish.publishWorkflow, {
      workflowRecordId: id,
      scheduledAt,
      force: true,
    });
  },
});

// ===== INTERNAL MUTATION: writes the settings row from CLI/migrations =====

export const _seedZernioConfig = internalMutation({
  args: {
    autoPublish: v.boolean(),
    profilesByFormat: v.any(),
  },
  handler: async (ctx, { autoPublish, profilesByFormat }) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "zernio"))
      .first();
    const patch = {
      key: "zernio",
      zernioAutoPublish: autoPublish,
      zernioProfilesByFormat: profilesByFormat,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", patch);
  },
});
