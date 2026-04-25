import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireQuoteAccess } from "./lib/adminAuth";
import type { Id, Doc } from "./_generated/dataModel";
import { resolveCustomerByEmail } from "./lib/customerIdentity";

/**
 * Get the current authenticated user's profile.
 * Returns null if not authenticated.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db.get(userId);
  },
});

/**
 * Check if the current user has admin role.
 * Returns false if not authenticated or not an admin.
 */
export const checkIsAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const role = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return role?.role === "admin";
  },
});

/**
 * Associate anonymous session data with the authenticated user.
 * Call this after successful sign-in to link quotes and coverage analyses
 * that were created before authentication.
 */
export const associateSessionData = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);

    let quotesUpdated = 0;
    let analysesUpdated = 0;

    // Find and update all quotes with this sessionId that aren't already linked
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();

    for (const quote of quotes) {
      // Only update if not already linked to a user
      if (!quote.userId) {
        await ctx.db.patch(quote._id, {
          userId,
          ...(user?.email ? { email: user.email } : {}),
        });
        quotesUpdated++;
      }
    }

    // Find and update all coverage analyses with this sessionId
    const analyses = await ctx.db
      .query("coverageAnalyses")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();

    for (const analysis of analyses) {
      // Only update if not already linked to a user
      if (!analysis.userId) {
        await ctx.db.patch(analysis._id, { userId });
        analysesUpdated++;
      }
    }

    return {
      quotesUpdated,
      analysesUpdated,
      totalUpdated: quotesUpdated + analysesUpdated,
    };
  },
});

/**
 * Get user's quote history (authenticated users only).
 */
export const getUserQuotes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("quotes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get user's coverage analysis history (authenticated users only).
 */
export const getUserCoverageAnalyses = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("coverageAnalyses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get all portal data for the authenticated user in a single reactive query.
 * Returns user profile and quotes enriched with draft estimations.
 */
export const getPortalData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    // Get user's quotes by userId
    const quotesByUser = await ctx.db
      .query("quotes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    // Also get quotes across all linked emails (multi-email identity)
    let allQuotes = quotesByUser;
    if (user.email) {
      const customer = await resolveCustomerByEmail(ctx, user.email);
      if (customer && customer.emails.length > 1) {
        const emailQuoteArrays = await Promise.all(
          customer.emails.map((e) =>
            ctx.db.query("quotes").withIndex("by_email", (q) => q.eq("email", e)).collect()
          ),
        );
        const seenIds = new Set(allQuotes.map((q) => String(q._id)));
        for (const arr of emailQuoteArrays) {
          for (const q of arr) {
            if (!seenIds.has(String(q._id))) {
              seenIds.add(String(q._id));
              allQuotes.push(q);
            }
          }
        }
        allQuotes.sort((a, b) => b._creationTime - a._creationTime);
      }
    }

    const visibleQuotes = allQuotes.filter(
      (q) => q.status !== "draft" && q.status !== "merged" && q.status !== "abandoned"
    );

    // Enrich each quote with draft estimations
    const enrichedQuotes = await Promise.all(
      visibleQuotes.map(async (quote) => {
        const draftQuote = await ctx.db
          .query("draftQuotes")
          .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
          .order("desc")
          .first();

        return {
          ...quote,
          estimatedPremium: draftQuote?.estimations?.[0]?.estimatedPremium ?? null,
          recommendedPlan: draftQuote?.recommendedPlan ?? null,
        };
      })
    );

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: (user as any).phone,
        emergencyContactName: (user as any).emergencyContactName,
        emergencyContactPhone: (user as any).emergencyContactPhone,
        emergencyContactRelation: (user as any).emergencyContactRelation,
      },
      quotes: enrichedQuotes,
    };
  },
});

/**
 * Get a single quote with full detail for the portal detail view.
 * Supports both authenticated user and anonymous sessionId access.
 */
export const getQuoteDetail = query({
  args: {
    quoteId: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, { quoteId, sessionId }) => {
    const id = quoteId as Id<"quotes">;
    await requireQuoteAccess(ctx, id, sessionId);

    const quote = await ctx.db.get(id);
    if (!quote) return null;

    // Get draft estimations
    const draftQuote = await ctx.db
      .query("draftQuotes")
      .withIndex("by_quote", (q) => q.eq("quoteId", id))
      .order("desc")
      .first();

    // Get destination data
    const destinations = await ctx.db
      .query("destinations")
      .withIndex("by_slug")
      .collect();
    const destinationData = destinations.find(
      (d) => d.name === quote.destination || d.slug === quote.destination.toLowerCase().replace(/\s+/g, "-")
    ) ?? null;

    return {
      ...quote,
      draftQuote: draftQuote
        ? {
            estimations: draftQuote.estimations,
            recommendedPlan: draftQuote.recommendedPlan,
            generatedAt: draftQuote.generatedAt,
          }
        : null,
      destinationData,
    };
  },
});

/**
 * Update user profile fields (name, phone, emergency contact).
 */
export const updateUserProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    emergencyContactRelation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    const updates: Record<string, string | undefined> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.emergencyContactName !== undefined) updates.emergencyContactName = args.emergencyContactName;
    if (args.emergencyContactPhone !== undefined) updates.emergencyContactPhone = args.emergencyContactPhone;
    if (args.emergencyContactRelation !== undefined) updates.emergencyContactRelation = args.emergencyContactRelation;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(userId, updates);
    }

    return { success: true };
  },
});
