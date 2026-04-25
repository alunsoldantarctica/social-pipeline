import { getAuthUserId } from "@convex-dev/auth/server";
import { customQuery, customMutation, customAction } from "convex-helpers/server/customFunctions";
import { query, mutation, action, internalQuery } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { timingSafeEqual } from "./timingSafeEqual";
import { ADMIN_SERVICE_EMAIL } from "./constants";

/**
 * Requires the current user to be authenticated and have admin role.
 * Throws an error if not authenticated or not an admin.
 *
 * @returns The authenticated admin user's ID
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const role = await ctx.db
    .query("userRoles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (!role || role.role !== "admin") {
    throw new ConvexError("Admin access required");
  }

  return userId;
}

/**
 * Checks if the current user has admin role (non-throwing version).
 * Returns false if not authenticated or not an admin.
 */
export async function isAdmin(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return false;

  const role = await ctx.db
    .query("userRoles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  return role?.role === "admin";
}

/**
 * Require auth. Admins pass. Regular users must own the quote (email match or sessionId).
 * For the anonymous wizard flow, sessionId-based ownership is sufficient.
 */
export async function requireQuoteAccess(
  ctx: QueryCtx | MutationCtx,
  quoteId: Id<"quotes">,
  sessionId?: string
): Promise<Id<"users"> | null> {
  const quote = await ctx.db.get(quoteId);
  if (!quote) throw new Error("Quote not found");

  // Try authenticated user first
  const userId = await getAuthUserId(ctx);
  if (userId) {
    // Admins can access any quote
    const role = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (role?.role === "admin") return userId;

    // Regular authenticated user must own the quote by userId or email
    if (quote.userId && quote.userId === userId) return userId;
    const user = await ctx.db.get(userId);
    if (user?.email && user.email === quote.email) return userId;
  }

  // Unauthenticated: check sessionId ownership (anonymous wizard flow)
  if (sessionId && quote.sessionId && sessionId === quote.sessionId) {
    return null; // Access granted, no userId
  }

  throw new ConvexError("Access denied");
}

/**
 * Require auth. Admins pass. Regular users must match the email.
 */
export async function requireEmailAccess(
  ctx: QueryCtx | MutationCtx,
  email: string
): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Authentication required");

  // Admins can access any email's data
  const role = await ctx.db
    .query("userRoles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (role?.role === "admin") return;

  // Regular user must match the email
  const user = await ctx.db.get(userId);
  if (user?.email && user.email === email) return;

  throw new ConvexError("Access denied");
}

/**
 * Attempt API token auth as fallback when session auth is unavailable.
 * Validates the token against the ADMIN_API_TOKEN env var and resolves
 * the api@expedition.insure service user.
 */
async function tryApiTokenAuth(
  ctx: QueryCtx | MutationCtx,
  apiToken: string | undefined,
) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!apiToken || !expectedToken) return null;
  if (!timingSafeEqual(apiToken, expectedToken)) return null;

  const serviceUser = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("email"), ADMIN_SERVICE_EMAIL))
    .first();

  if (!serviceUser) return null;

  // Verify the service user actually has admin role
  const role = await ctx.db
    .query("userRoles")
    .withIndex("by_user", (q) => q.eq("userId", serviceUser._id))
    .first();

  if (role?.role !== "admin") return null;

  return serviceUser._id;
}

/**
 * Custom query wrapper that requires admin authentication.
 * Use this instead of `query` for admin-only endpoints.
 *
 * Supports two auth flows:
 * 1. Session auth (browser) — checked first
 * 2. API token (`_apiToken` arg) — fallback for CLI access
 *
 * The `_apiToken` arg is consumed by the wrapper and not passed to the handler.
 */
export const adminQuery = customQuery(query, {
  args: { _apiToken: v.optional(v.string()) },
  input: async (ctx, { _apiToken }) => {
    // Try session auth first (normal browser flow)
    const sessionUserId = await getAuthUserId(ctx);
    if (sessionUserId) {
      const role = await ctx.db
        .query("userRoles")
        .withIndex("by_user", (q) => q.eq("userId", sessionUserId))
        .first();
      if (role?.role === "admin") {
        return { ctx: { userId: sessionUserId }, args: {} };
      }
    }

    // Fall back to API token (CLI flow)
    const tokenUserId = await tryApiTokenAuth(ctx, _apiToken);
    if (tokenUserId) {
      return { ctx: { userId: tokenUserId }, args: {} };
    }

    throw new ConvexError("Authentication required");
  },
});

/**
 * Custom mutation wrapper that requires admin authentication.
 * Use this instead of `mutation` for admin-only endpoints.
 *
 * Supports two auth flows:
 * 1. Session auth (browser) — checked first
 * 2. API token (`_apiToken` arg) — fallback for CLI access
 *
 * The `_apiToken` arg is consumed by the wrapper and not passed to the handler.
 */
export const adminMutation = customMutation(mutation, {
  args: { _apiToken: v.optional(v.string()) },
  input: async (ctx, { _apiToken }) => {
    // Try session auth first (normal browser flow)
    const sessionUserId = await getAuthUserId(ctx);
    if (sessionUserId) {
      const role = await ctx.db
        .query("userRoles")
        .withIndex("by_user", (q) => q.eq("userId", sessionUserId))
        .first();
      if (role?.role === "admin") {
        return { ctx: { userId: sessionUserId }, args: {} };
      }
    }

    // Fall back to API token (CLI flow)
    const tokenUserId = await tryApiTokenAuth(ctx, _apiToken);
    if (tokenUserId) {
      return { ctx: { userId: tokenUserId }, args: {} };
    }

    throw new ConvexError("Authentication required");
  },
});

// ===== Internal queries for adminAction (actions lack ctx.db) =====

/**
 * Check if a user has admin role. Used by adminAction wrapper.
 */
export const _checkAdminRole = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const role = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return role?.role === "admin";
  },
});

/**
 * Resolve the API service user by email and validate admin role + token.
 * Returns the service user's ID if token is valid and user is admin, null otherwise.
 */
export const _resolveApiServiceUser = internalQuery({
  args: { apiToken: v.string() },
  handler: async (ctx, { apiToken }) => {
    const expectedToken = process.env.ADMIN_API_TOKEN;
    if (!expectedToken) return null;
    if (!timingSafeEqual(apiToken, expectedToken)) return null;

    const serviceUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), ADMIN_SERVICE_EMAIL))
      .first();
    if (!serviceUser) return null;

    const role = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", serviceUser._id))
      .first();
    if (role?.role !== "admin") return null;

    return serviceUser._id;
  },
});

/**
 * Custom action wrapper that requires admin authentication.
 * Use this instead of `action` for admin-only action endpoints.
 *
 * Supports two auth flows:
 * 1. Session auth (browser) — checked first
 * 2. API token (`_apiToken` arg) — fallback for CLI access
 *
 * The `_apiToken` arg is consumed by the wrapper and not passed to the handler.
 */
export const adminAction: any = customAction(action, {
  args: { _apiToken: v.optional(v.string()) },
  input: async (ctx, { _apiToken }) => {
    // Try session auth first (normal browser flow)
    const sessionUserId = await getAuthUserId(ctx);
    if (sessionUserId) {
      const isAdminUser = await ctx.runQuery(
        internal.lib.adminAuth._checkAdminRole,
        { userId: sessionUserId },
      );
      if (isAdminUser) {
        return { ctx: { userId: sessionUserId }, args: {} };
      }
    }

    // Fall back to API token (CLI flow)
    if (_apiToken) {
      const tokenUserId: string | null = await ctx.runQuery(
        internal.lib.adminAuth._resolveApiServiceUser,
        { apiToken: _apiToken },
      );
      if (tokenUserId) {
        return { ctx: { userId: tokenUserId }, args: {} };
      }
    }

    throw new ConvexError("Authentication required");
  },
});
