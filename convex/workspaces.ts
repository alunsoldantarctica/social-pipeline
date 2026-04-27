import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

// ===== Public queries =====

export const getActiveWorkspace = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.activeWorkspaceId) return null;
    const ws = await ctx.db.get(user.activeWorkspaceId);
    if (!ws) return null;
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .filter((q) => q.eq(q.field("workspaceId"), user.activeWorkspaceId!))
      .first();
    return {
      _id: ws._id,
      name: ws.name,
      slug: ws.slug,
      tier: ws.tier,
      role: (member?.role ?? "editor") as "owner" | "admin" | "editor",
    };
  },
});

export const listMyWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();
    const workspaces = await Promise.all(
      memberships.map(async (m) => {
        const ws = await ctx.db.get(m.workspaceId);
        if (!ws) return null;
        return {
          _id: ws._id,
          name: ws.name,
          slug: ws.slug,
          tier: ws.tier,
          role: m.role as "owner" | "admin" | "editor",
        };
      }),
    );
    return workspaces.filter(Boolean);
  },
});

export const checkSlugAvailable = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    if (!SLUG_RE.test(slug)) return { available: false, reason: "invalid" };
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    return { available: !existing, reason: existing ? "taken" : null };
  },
});

export const suggestSlug = query({
  args: { name: v.string() },
  handler: async (_ctx, { name }) => {
    return toSlug(name);
  },
});

// ===== Public mutations =====

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, { name, slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Authentication required");

    if (!name.trim()) throw new ConvexError("Workspace name is required");
    if (!SLUG_RE.test(slug)) {
      throw new ConvexError(
        "Slug must be lowercase letters, numbers, and hyphens only",
      );
    }

    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) throw new ConvexError("That slug is already taken");

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: name.trim(),
      slug,
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      status: "active",
      joinedAt: now,
    });

    await ctx.db.patch(userId, { activeWorkspaceId: workspaceId });

    // Grant the owner admin role so existing adminQuery endpoints work
    const existingRole = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existingRole) {
      await ctx.db.insert("userRoles", { userId, role: "admin", assignedAt: now });
    }

    return workspaceId;
  },
});

export const switchWorkspace = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Authentication required");

    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId).eq("status", "active"))
      .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
      .first();
    if (!member) throw new ConvexError("Not a member of this workspace");

    await ctx.db.patch(userId, { activeWorkspaceId: workspaceId });
  },
});

// ===== Internal helpers =====

export const _getActiveWorkspaceId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<Id<"workspaces"> | null> => {
    const user = await ctx.db.get(userId);
    return user?.activeWorkspaceId ?? null;
  },
});

export const _requireWorkspaceMember = internalQuery({
  args: {
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    minRole: v.optional(v.string()),
  },
  handler: async (ctx, { userId, workspaceId, minRole }) => {
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId).eq("status", "active"))
      .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
      .first();
    if (!member) return null;
    if (minRole) {
      const hierarchy = ["editor", "admin", "owner"];
      const memberIdx = hierarchy.indexOf(member.role);
      const requiredIdx = hierarchy.indexOf(minRole);
      if (memberIdx < requiredIdx) return null;
    }
    return member.role;
  },
});

export const _setActiveWorkspace = internalMutation({
  args: { userId: v.id("users"), workspaceId: v.id("workspaces") },
  handler: async (ctx, { userId, workspaceId }) => {
    await ctx.db.patch(userId, { activeWorkspaceId: workspaceId });
  },
});
