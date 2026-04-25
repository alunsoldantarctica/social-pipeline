/**
 * Unified notification preference gate.
 *
 * All notification send sites call `_shouldNotify` before dispatching
 * push or email notifications. Reads the admin's dual-channel preferences
 * with fallback to legacy single-toggle keys, defaulting to enabled.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/** Maps legacy single-toggle keys → new dual-channel category prefix */
const LEGACY_KEY_MAP: Record<string, string> = {
  content_review: "content_review",
  quote_notification: "quote",
  contact_notification: "contact",
  payment_notification: "payment",
};

/** Reverse: category → legacy key */
const CATEGORY_TO_LEGACY: Record<string, string> = {
  content_review: "content_review",
  quote: "quote_notification",
  contact: "contact_notification",
  payment: "payment_notification",
};

/**
 * Check whether a notification should fire for a given category + channel.
 *
 * Resolution order:
 *   1. `${category}_${channel}` key (new dual-channel)
 *   2. Legacy single-toggle key (if one exists for this category)
 *   3. Default: true (new users / new categories get all notifications)
 */
export const _shouldNotify = internalQuery({
  args: {
    category: v.string(),
    channel: v.union(v.literal("push"), v.literal("email")),
  },
  handler: async (ctx, { category, channel }) => {
    const profile = await ctx.db.query("adminProfiles").first();
    if (!profile?.notificationPreferences) return true;

    const prefs = profile.notificationPreferences as Record<string, boolean | undefined>;

    // 1. Check new dual-channel key
    const dualKey = `${category}_${channel}`;
    if (prefs[dualKey] !== undefined) {
      return prefs[dualKey] !== false;
    }

    // 2. Fall back to legacy key
    const legacyKey = CATEGORY_TO_LEGACY[category];
    if (legacyKey && prefs[legacyKey] !== undefined) {
      return prefs[legacyKey] !== false;
    }

    // 3. Default enabled
    return true;
  },
});
