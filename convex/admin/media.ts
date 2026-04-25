/**
 * Cloudflare Images — Media Management
 *
 * Provides direct-upload URL generation, image listing, and deletion
 * via the Cloudflare Images REST API.
 *
 * Required env vars (set as Convex environment variables):
 *   CF_ACCOUNT_ID     — Cloudflare account ID
 *   CF_IMAGES_TOKEN   — Cloudflare API token with Images:Edit permission
 *
 * The public delivery URL format is:
 *   https://imagedelivery.net/{CLOUDFLARE_IMAGES_HASH}/{imageId}/public
 *
 * CLOUDFLARE_IMAGES_HASH is your account hash from the Cloudflare Dashboard
 * → Images → Overview. Set it in wrangler.toml as a [vars] entry and in
 * the Convex environment as well.
 */

import { v } from "convex/values";
import { internalAction, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";

const CF_IMAGES_BASE = "https://api.cloudflare.com/client/v4/accounts";

function getCfConfig() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_IMAGES_TOKEN;
  if (!accountId || !token) {
    throw new Error("CF_ACCOUNT_ID and CF_IMAGES_TOKEN must be set in Convex environment variables");
  }
  return { accountId, token };
}

/** Returns a one-time direct-upload URL for the client to POST the image to. */
export const getDirectUploadUrl = internalAction({
  args: {},
  handler: async (): Promise<{ uploadUrl: string; id: string }> => {
    const { accountId, token } = getCfConfig();
    const res = await fetch(
      `${CF_IMAGES_BASE}/${accountId}/images/v2/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requireSignedURLs: false }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CF Images direct upload failed: ${res.status} ${text}`);
    }
    const data = await res.json() as { result: { uploadURL: string; id: string } };
    return { uploadUrl: data.result.uploadURL, id: data.result.id };
  },
});

/** Lists images from Cloudflare Images (paginated, newest first). */
export const listImages = internalAction({
  args: {
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  handler: async (_ctx, { page = 1, perPage = 50 }): Promise<{
    images: Array<{ id: string; filename: string; uploaded: string; variants: string[] }>;
    total: number;
  }> => {
    const { accountId, token } = getCfConfig();
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    const res = await fetch(
      `${CF_IMAGES_BASE}/${accountId}/images/v1?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CF Images list failed: ${res.status} ${text}`);
    }
    const data = await res.json() as {
      result: {
        images: Array<{ id: string; filename: string; uploaded: string; variants: string[] }>;
        total_count?: number;
      };
    };
    return {
      images: data.result.images ?? [],
      total: data.result.total_count ?? 0,
    };
  },
});

/** Deletes an image from Cloudflare Images and removes the DB record. */
export const deleteImage = internalAction({
  args: { imageId: v.string() },
  handler: async (ctx, { imageId }): Promise<void> => {
    const { accountId, token } = getCfConfig();
    const res = await fetch(
      `${CF_IMAGES_BASE}/${accountId}/images/v1/${imageId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`CF Images delete failed: ${res.status} ${text}`);
    }
    await ctx.runMutation(internal.admin.media._deleteByImageId, { imageId });
  },
});

/** Records a newly uploaded image in the DB after the client direct-uploads it. */
export const recordUpload = mutation({
  args: {
    cloudflareImageId: v.string(),
    filename: v.optional(v.string()),
    altText: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("media", {
      cloudflareImageId: args.cloudflareImageId,
      filename: args.filename,
      altText: args.altText,
      tags: args.tags,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const _deleteByImageId = mutation({
  args: { imageId: v.string() },
  handler: async (ctx, { imageId }) => {
    const record = await ctx.db
      .query("media")
      .withIndex("by_imageId", (q) => q.eq("cloudflareImageId", imageId))
      .first();
    if (record) await ctx.db.delete(record._id);
  },
});

/** List media records from DB (for admin gallery). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("media")
      .withIndex("by_createdAt")
      .order("desc")
      .take(200);
  },
});
