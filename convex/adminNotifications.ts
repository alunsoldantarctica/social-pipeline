import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/adminAuth";

/**
 * Notification category taxonomy (EXP-194).
 * Priority categories surface in the default "Priority" tab of the bell dropdown.
 */
export const NOTIFICATION_CATEGORIES = [
  "customer_email",
  "quote",
  "contact_form",
  "payment",
  "content",
  "system",
  "audit",
  "error",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const PRIORITY_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  "customer_email",
  "quote",
  "contact_form",
  "payment",
]);

export const categoryValidator = v.union(
  v.literal("customer_email"),
  v.literal("quote"),
  v.literal("contact_form"),
  v.literal("payment"),
  v.literal("content"),
  v.literal("system"),
  v.literal("audit"),
  v.literal("error"),
);

const tabValidator = v.union(v.literal("priority"), v.literal("all"));

/**
 * Insert a notification record (called from _sendPushNotification action).
 */
export const _insertNotification = internalMutation({
  args: {
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
    category: categoryValidator,
  },
  handler: async (ctx, args) => {
    const isPriority = PRIORITY_CATEGORIES.has(args.category);
    return await ctx.db.insert("adminNotifications", {
      ...args,
      isPriority,
      isRead: false,
      createdAt: Date.now(),
    });
  },
});

/**
 * List the most recent 50 notifications for a given tab.
 */
export const list = adminQuery({
  args: { tab: v.optional(tabValidator) },
  handler: async (ctx, { tab }) => {
    if (tab === "priority") {
      return await ctx.db
        .query("adminNotifications")
        .withIndex("by_priority_and_created", (q) => q.eq("isPriority", true))
        .order("desc")
        .take(50);
    }
    return await ctx.db
      .query("adminNotifications")
      .withIndex("by_createdAt")
      .order("desc")
      .take(50);
  },
});

/**
 * Count unread notifications for a given tab (for badge).
 */
export const unreadCount = adminQuery({
  args: { tab: v.optional(tabValidator) },
  handler: async (ctx, { tab }) => {
    if (tab === "priority") {
      const unread = await ctx.db
        .query("adminNotifications")
        .withIndex("by_priority_and_read", (q) =>
          q.eq("isPriority", true).eq("isRead", false),
        )
        .collect();
      return unread.length;
    }
    const unread = await ctx.db
      .query("adminNotifications")
      .withIndex("by_read_createdAt", (q) => q.eq("isRead", false))
      .collect();
    return unread.length;
  },
});

/**
 * Count unread notifications (internal — for badge count in push payload).
 * Always counts all unread (not tab-scoped) for the global system app badge.
 */
export const _unreadCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("adminNotifications")
      .withIndex("by_read_createdAt", (q) => q.eq("isRead", false))
      .collect();
    return unread.length;
  },
});

/**
 * Count all notifications (for testing).
 */
export const _countAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("adminNotifications").collect();
    return all.length;
  },
});

/**
 * Mark a single notification as read.
 */
export const markAsRead = adminMutation({
  args: { id: v.id("adminNotifications") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { isRead: true });
  },
});

/**
 * Mark all unread notifications as read (optionally scoped to a tab).
 */
export const markAllAsRead = adminMutation({
  args: { tab: v.optional(tabValidator) },
  handler: async (ctx, { tab }) => {
    const unread =
      tab === "priority"
        ? await ctx.db
            .query("adminNotifications")
            .withIndex("by_priority_and_read", (q) =>
              q.eq("isPriority", true).eq("isRead", false),
            )
            .collect()
        : await ctx.db
            .query("adminNotifications")
            .withIndex("by_read_createdAt", (q) => q.eq("isRead", false))
            .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { isRead: true });
    }
  },
});
