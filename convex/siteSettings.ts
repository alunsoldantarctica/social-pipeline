import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/adminAuth";

/**
 * Returns the Resend audience ID if configured, or null.
 * Used by the public subscribe endpoint and blog subscribe form.
 */
export const getNewsletterAudienceId = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "resend"))
      .first();
    return (row as { resendAudienceId?: string } | null)?.resendAudienceId ?? null;
  },
});

/**
 * Get contact settings (email, WhatsApp URL)
 */
export const getContactSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "contact"))
      .first();
    
    return settings || {
      contactEmail: "help@expedition.insure",
      whatsappUrl: null,
      trustpilotUrl: null,
    };
  },
});

/**
 * Update contact settings (admin use)
 */
export const updateContactSettings = mutation({
  args: {
    contactEmail: v.optional(v.string()),
    whatsappUrl: v.optional(v.string()),
    trustpilotUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "contact"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("siteSettings", {
        key: "contact",
        ...args,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Get auto-quote settings (buffer %, enabled flag)
 */
export const getAutoQuoteSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "autoQuote"))
      .first();

    return {
      autoQuoteEnabled: settings?.autoQuoteEnabled ?? false,
      autoQuoteBufferPercent: settings?.autoQuoteBufferPercent ?? 10,
    };
  },
});

/**
 * Update auto-quote settings (admin use)
 */
export const updateAutoQuoteSettings = mutation({
  args: {
    autoQuoteEnabled: v.optional(v.boolean()),
    autoQuoteBufferPercent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (args.autoQuoteBufferPercent !== undefined) {
      if (args.autoQuoteBufferPercent < 0 || args.autoQuoteBufferPercent > 50) {
        throw new Error("Buffer percent must be between 0 and 50");
      }
    }

    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "autoQuote"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("siteSettings", {
        key: "autoQuote",
        ...args,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Get pricing display settings (min premium threshold)
 */
export const getPricingSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "pricing"))
      .first();

    return {
      minPlanPremium: settings?.minPlanPremium ?? 0,
    };
  },
});

/**
 * Update pricing display settings (admin use)
 */
export const updatePricingSettings = mutation({
  args: {
    minPlanPremium: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (args.minPlanPremium !== undefined && args.minPlanPremium < 0) {
      throw new Error("Minimum plan premium cannot be negative");
    }

    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "pricing"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("siteSettings", {
        key: "pricing",
        ...args,
        updatedAt: Date.now(),
      });
    }
  },
});

/** Internal mutation for CLI/migration use (no auth required) */
export const _patchSettings = internalMutation({
  args: {
    key: v.string(),
    fields: v.any(),
  },
  handler: async (ctx, { key, fields }) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", { key, ...fields, updatedAt: Date.now() });
  },
});
