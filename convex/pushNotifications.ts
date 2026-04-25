import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/adminAuth";

const pushLogStatusValidator = v.union(
  v.literal("delivered"),
  v.literal("retrying"),
  v.literal("exhausted"),
  v.literal("removed"),
);

/**
 * Store a push subscription for the current admin user.
 */
export const storePushSubscription = adminMutation({
  args: {
    endpoint: v.string(),
    keyP256dh: v.string(),
    keyAuth: v.string(),
  },
  handler: async (ctx, { endpoint, keyP256dh, keyAuth }) => {
    // Clear any previous rows with this endpoint (e.g. re-subscribe from a
    // different user) AND any other rows for this user. A user has one
    // device-in-use at a time; leaving stale rows means pushes get sent to
    // dead tokens and the UI can desync from the device.
    const byEndpoint = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (byEndpoint) await ctx.db.delete(byEndpoint._id);
    const byUser = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    for (const sub of byUser) {
      await ctx.db.delete(sub._id);
    }

    await ctx.db.insert("pushSubscriptions", {
      endpoint,
      keyP256dh,
      keyAuth,
      userId: ctx.userId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Remove push subscriptions for the current admin.
 *
 * Deletes by endpoint when provided (covers the happy path where the client
 * knows its exact PushSubscription), AND always deletes any other rows
 * belonging to this user. That matters when iOS rotates the device token
 * (e.g. after a service-worker update) — the DB row's endpoint no longer
 * matches what the client sees, so by-endpoint delete is a no-op and the
 * UI gets stuck showing "Disable" with no way to reset.
 */
export const removePushSubscription = adminMutation({
  args: {
    endpoint: v.optional(v.string()),
  },
  handler: async (ctx, { endpoint }) => {
    if (endpoint) {
      const byEndpoint = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .first();
      if (byEndpoint) await ctx.db.delete(byEndpoint._id);
    }
    const userSubs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    for (const sub of userSubs) {
      await ctx.db.delete(sub._id);
    }
  },
});

/**
 * Check if the current user has an active push subscription.
 */
export const getSubscriptionStatus = adminQuery({
  args: {},
  handler: async (ctx) => {
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();
    return { subscribed: !!sub };
  },
});

// ===== Internal helpers =====

/**
 * List all push subscriptions (called by _sendPushNotification action).
 */
export const _listAllSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pushSubscriptions").collect();
  },
});

/**
 * Remove a subscription by ID (cleanup of expired/410 subs).
 */
export const _removeSubscriptionById = internalMutation({
  args: { id: v.id("pushSubscriptions") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

/**
 * Check if a subscription still exists (for retry edge case).
 */
export const _getSubscriptionById = internalQuery({
  args: { id: v.id("pushSubscriptions") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// ===== PUSH NOTIFICATION LOG =====

/**
 * Log a push delivery attempt.
 */
export const _logPushAttempt = internalMutation({
  args: {
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
    subscriptionId: v.id("pushSubscriptions"),
    endpointShort: v.string(),
    status: pushLogStatusValidator,
    statusCode: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    attempt: v.number(),
    maxAttempts: v.number(),
    notificationKey: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("pushNotificationLog", {
      ...args,
      attemptedAt: Date.now(),
    });
  },
});

/**
 * List push notification log entries (admin dashboard).
 */
export const listPushLog = adminQuery({
  args: {
    limit: v.optional(v.number()),
    statusFilter: v.optional(v.string()),
  },
  handler: async (ctx, { limit, statusFilter }) => {
    const take = limit ?? 100;

    if (statusFilter && statusFilter !== "all") {
      return await ctx.db
        .query("pushNotificationLog")
        .withIndex("by_status", (q) => q.eq("status", statusFilter as "delivered" | "retrying" | "exhausted" | "removed"))
        .order("desc")
        .take(take);
    }

    return await ctx.db
      .query("pushNotificationLog")
      .withIndex("by_attemptedAt")
      .order("desc")
      .take(take);
  },
});

/**
 * Internal: read recent push logs from CLI for diagnostics.
 * Usage: pnpx convex run --prod pushNotifications:_recentPushLogs '{}'
 */
export const _recentPushLogs = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("pushNotificationLog")
      .order("desc")
      .take(10);
  },
});

/**
 * Push log stats for dashboard summary cards.
 */
export const getPushLogStats = adminQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const recent = await ctx.db
      .query("pushNotificationLog")
      .withIndex("by_attemptedAt", (q) => q.gte("attemptedAt", cutoff))
      .collect();

    const stats = { delivered: 0, retrying: 0, exhausted: 0, removed: 0, total: 0 };
    for (const entry of recent) {
      stats[entry.status]++;
      stats.total++;
    }
    return stats;
  },
});

