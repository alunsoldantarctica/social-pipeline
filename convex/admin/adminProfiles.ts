import { v } from "convex/values";
import { adminQuery, adminMutation } from "../lib/adminAuth";
import { internalQuery } from "../_generated/server";

/**
 * Admin profile management — display name, email signature, and avatar.
 */

/**
 * Get the current admin's profile (with resolved avatar URL).
 */
export const getMyProfile = adminQuery({
  args: {},
  handler: async (ctx) => {
    const profile = await ctx.db
      .query("adminProfiles")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();
    if (!profile) return null;
    const avatarUrl = profile.avatarStorageId
      ? await ctx.storage.getUrl(profile.avatarStorageId)
      : null;
    return { ...profile, avatarUrl };
  },
});

/**
 * Generate an upload URL for avatar images.
 */
export const generateUploadUrl = adminMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Create or update the current admin's profile.
 */
export const upsertProfile = adminMutation({
  args: {
    displayName: v.string(),
    emailSignature: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { displayName, emailSignature, avatarStorageId }) => {
    const existing = await ctx.db
      .query("adminProfiles")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        displayName,
        emailSignature,
        updatedAt: Date.now(),
      };
      if (avatarStorageId !== undefined) {
        // Delete old avatar from storage if replacing
        if (existing.avatarStorageId && existing.avatarStorageId !== avatarStorageId) {
          await ctx.storage.delete(existing.avatarStorageId);
        }
        patch.avatarStorageId = avatarStorageId;
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("adminProfiles", {
      userId: ctx.userId,
      displayName,
      emailSignature,
      avatarStorageId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update notification preferences for the current admin.
 */
export const updateNotificationPreferences = adminMutation({
  args: {
    notificationPreferences: v.object({
      // Legacy keys (kept for backward compat)
      content_review: v.optional(v.boolean()),
      quote_notification: v.optional(v.boolean()),
      contact_notification: v.optional(v.boolean()),
      payment_notification: v.optional(v.boolean()),
      // Dual-channel keys
      content_review_push: v.optional(v.boolean()),
      content_review_email: v.optional(v.boolean()),
      quote_push: v.optional(v.boolean()),
      quote_email: v.optional(v.boolean()),
      payment_push: v.optional(v.boolean()),
      payment_email: v.optional(v.boolean()),
      contact_push: v.optional(v.boolean()),
      contact_email: v.optional(v.boolean()),
      email_received_push: v.optional(v.boolean()),
      email_received_email: v.optional(v.boolean()),
      whatsapp_push: v.optional(v.boolean()),
      whatsapp_email: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { notificationPreferences }) => {
    const existing = await ctx.db
      .query("adminProfiles")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        notificationPreferences,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("adminProfiles", {
      userId: ctx.userId,
      displayName: "Admin",
      notificationPreferences,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: check if a notification category is enabled.
 * Returns true if missing/undefined (default to enabled).
 */
export const _getNotificationPreference = internalQuery({
  args: { category: v.string() },
  handler: async (ctx, { category }) => {
    const profile = await ctx.db.query("adminProfiles").first();
    if (!profile?.notificationPreferences) return true;
    const value = (profile.notificationPreferences as Record<string, boolean | undefined>)[category];
    return value !== false;
  },
});

/**
 * Internal: get profile by userId (for use in actions).
 */
export const _getProfileByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("adminProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});
