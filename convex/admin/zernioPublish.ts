/**
 * Zernio Social Publishing Adapter
 *
 * TODO: Wire this up once you have a Zernio account.
 *
 * Zernio (formerly Late/getlate.dev) — unified social publishing API.
 * Docs: https://docs.zernio.com
 *
 * Supported platforms: Instagram, TikTok, X/Twitter, Facebook, LinkedIn,
 * YouTube, WhatsApp, Threads, Pinterest, Reddit, Bluesky, Telegram,
 * Discord, Snapchat, Google Business.
 *
 * Authentication: Bearer token (sk_ prefix + 64 hex chars)
 * Required env var: ZERNIO_API_KEY
 *
 * Pricing:
 *   Free: 20 posts/month
 *   Build: $19/month (120 posts)
 *   Accelerate: $49/month
 *   Unlimited: $999/month
 *
 * No official TypeScript/JavaScript SDK as of April 2026 — uses raw fetch.
 *
 * Integration points:
 * - Call publishToZernio after a workflow transitions to "completed"
 * - Wire in contentPipeline.ts approveForPublish mutation
 * - The outputFormat on the workflow determines which profiles to target
 *
 * Step 1: Connect your social accounts in the Zernio dashboard
 * Step 2: Get your profile IDs via GET /api/v1/profiles
 * Step 3: Set ZERNIO_API_KEY in Convex environment variables
 * Step 4: Uncomment and configure the publishToZernio action below
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";

const ZERNIO_BASE_URL = "https://api.zernio.com/api/v1";

/**
 * Publish content to one or more social profiles via Zernio.
 *
 * @param profiles - Array of Zernio profile IDs to publish to
 * @param content - Text content (plain text, no markdown for social)
 * @param mediaUrls - Optional array of image/video URLs to attach
 * @param scheduledAt - Optional Unix timestamp (ms) to schedule the post
 */
export const publishToZernio = internalAction({
  args: {
    workflowRecordId: v.id("articleWorkflows"),
    profiles: v.array(v.string()),
    content: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (_ctx, { profiles, content, mediaUrls, scheduledAt }) => {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      throw new Error("ZERNIO_API_KEY is not set in Convex environment variables");
    }

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

    const res = await fetch(`${ZERNIO_BASE_URL}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zernio publish failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    console.log("[zernio] published successfully", data);
    return data;
  },
});

/**
 * List connected Zernio profiles.
 * Run this to get profile IDs to use in publishToZernio.
 */
export const listZernioProfiles = internalAction({
  args: {},
  handler: async () => {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) throw new Error("ZERNIO_API_KEY not set");

    const res = await fetch(`${ZERNIO_BASE_URL}/profiles`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zernio list profiles failed: ${res.status} ${text}`);
    }

    return await res.json();
  },
});
