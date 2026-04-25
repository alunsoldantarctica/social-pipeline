"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
// @ts-ignore — web-push has no type declarations
import webpush from "web-push";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [5_000, 30_000, 120_000];

/**
 * Send a push notification to all subscribed admins.
 * Fans out to per-subscription actions for independent retry chains.
 */
const categoryValidator = v.union(
  v.literal("customer_email"),
  v.literal("quote"),
  v.literal("contact_form"),
  v.literal("payment"),
  v.literal("content"),
  v.literal("system"),
  v.literal("audit"),
  v.literal("error"),
);

export const _sendPushNotification = internalAction({
  args: {
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
    category: categoryValidator,
  },
  handler: async (ctx, { title, body, url, tag, category }) => {
    const isEnabled = await ctx.runQuery(
      internal.lib.notificationGate._shouldNotify,
      { category, channel: "push" },
    );
    if (!isEnabled) {
      console.log(`Push notification suppressed for category "${category}" (disabled in preferences)`);
      return;
    }

    // Always log the in-app notification, even if push delivery fails/skipped
    const notificationId = await ctx.runMutation(
      internal.adminNotifications._insertNotification,
      { title, body, url, tag, category },
    );

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn("VAPID keys not configured — skipping push notification");
      return;
    }

    // Get unread count for badge
    const badge = await ctx.runQuery(
      internal.adminNotifications._unreadCount,
    );

    const subscriptions = await ctx.runQuery(
      internal.pushNotifications._listAllSubscriptions,
    );

    if (subscriptions.length === 0) return;

    // Fan out: one action per subscription with independent retry
    for (const sub of subscriptions) {
      await ctx.scheduler.runAfter(
        0,
        internal.pushNotificationsNode._sendToSubscription,
        {
          title,
          body,
          url,
          tag,
          badge,
          subscriptionId: sub._id,
          endpoint: sub.endpoint,
          keyP256dh: sub.keyP256dh,
          keyAuth: sub.keyAuth,
          attempt: 1,
          maxAttempts: MAX_ATTEMPTS,
          notificationKey: `${notificationId}_${sub._id}`,
        },
      );
    }
  },
});

/**
 * Send push to a single subscription with retry on transient failure.
 * Self-schedules with exponential backoff on 5xx/network errors.
 */
export const _sendToSubscription = internalAction({
  args: {
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
    badge: v.optional(v.number()),
    subscriptionId: v.id("pushSubscriptions"),
    endpoint: v.string(),
    keyP256dh: v.string(),
    keyAuth: v.string(),
    attempt: v.number(),
    maxAttempts: v.number(),
    notificationKey: v.string(),
  },
  handler: async (ctx, args) => {
    const {
      title, body, url, tag, badge,
      subscriptionId, endpoint, keyP256dh, keyAuth,
      attempt, maxAttempts, notificationKey,
    } = args;

    const endpointShort = endpoint.slice(0, 80);
    const logBase = { title, body, url, tag, subscriptionId, endpointShort, attempt, maxAttempts, notificationKey };

    // Check if subscription was already removed (e.g., by a parallel 410)
    const sub = await ctx.runQuery(
      internal.pushNotifications._getSubscriptionById,
      { id: subscriptionId },
    );
    if (!sub) {
      await ctx.runMutation(internal.pushNotifications._logPushAttempt, {
        ...logBase,
        status: "removed",
        errorMessage: "Subscription already deleted before attempt",
      });
      return;
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;

    webpush.setVapidDetails(
      "mailto:help@expedition.insure",
      vapidPublicKey,
      vapidPrivateKey,
    );

    const payload = JSON.stringify({ title, body, url, tag, badge });

    try {
      // urgency:"high" tells APNs to deliver immediately instead of batching
      // until next device activity — required for timely iOS web push banners.
      const result = await webpush.sendNotification(
        { endpoint, keys: { p256dh: keyP256dh, auth: keyAuth } },
        payload,
        { TTL: 86400, urgency: "high" },
      );

      console.log(`Push delivered: status=${result.statusCode} body=${result.body || "(empty)"} endpoint=${endpointShort}`);

      await ctx.runMutation(internal.pushNotifications._logPushAttempt, {
        ...logBase,
        status: "delivered",
        statusCode: result.statusCode,
        errorMessage: result.body || undefined,
      });
    } catch (err: any) {
      const statusCode: number | undefined = err?.statusCode;
      const errorMessage = err?.message ?? String(err);

      // Permanent failure: expired/unsubscribed endpoint
      if (statusCode === 410 || statusCode === 404) {
        await ctx.runMutation(internal.pushNotifications._logPushAttempt, {
          ...logBase,
          status: "removed",
          statusCode,
          errorMessage,
        });
        await ctx.runMutation(
          internal.pushNotifications._removeSubscriptionById,
          { id: subscriptionId },
        );
        return;
      }

      // Transient failure with retries remaining
      if (attempt < maxAttempts) {
        await ctx.runMutation(internal.pushNotifications._logPushAttempt, {
          ...logBase,
          status: "retrying",
          statusCode,
          errorMessage,
        });

        const delay = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
        await ctx.scheduler.runAfter(
          delay,
          internal.pushNotificationsNode._sendToSubscription,
          { ...args, attempt: attempt + 1 },
        );
        return;
      }

      // All retries exhausted
      await ctx.runMutation(internal.pushNotifications._logPushAttempt, {
        ...logBase,
        status: "exhausted",
        statusCode,
        errorMessage,
      });
    }
  },
});

/**
 * Send a test push notification to verify delivery.
 * Call from CLI: pnpx convex run --prod pushNotificationsNode:testPush '{}'
 */
export const testPush = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal.pushNotificationsNode._sendPushNotification, {
      title: "Test Push",
      body: `Push test at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/Denver" })}`,
      url: "/admin",
      tag: "test-push",
      category: "system",
    });
    return "Test push dispatched — check your device";
  },
});
