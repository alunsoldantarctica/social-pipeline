import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, action, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ===== Internal helpers =====

export const _getMemberRole = internalQuery({
  args: { userId: v.id("users"), workspaceId: v.id("workspaces") },
  handler: async (ctx, { userId, workspaceId }): Promise<string | null> => {
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId).eq("status", "active"))
      .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
      .first();
    return member?.role ?? null;
  },
});

export const _getWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    return await ctx.db.get(workspaceId);
  },
});

export const _createPendingMember = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    inviteEmail: v.string(),
    inviteToken: v.string(),
    inviteExpiresAt: v.number(),
    role: v.string(),
    invitedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Upsert: if a pending invite exists for this email + workspace, replace token
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending"),
      )
      .filter((q) => q.eq(q.field("inviteEmail"), args.inviteEmail))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        inviteToken: args.inviteToken,
        inviteExpiresAt: args.inviteExpiresAt,
        role: args.role,
        invitedBy: args.invitedBy,
      });
      return existing._id;
    }

    return await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      inviteEmail: args.inviteEmail,
      inviteToken: args.inviteToken,
      inviteExpiresAt: args.inviteExpiresAt,
      role: args.role,
      status: "pending",
      invitedBy: args.invitedBy,
    });
  },
});

// ===== Queries =====

export const listMembers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Authentication required");

    const self = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId).eq("status", "active"))
      .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
      .first();
    if (!self) throw new ConvexError("Not a member of this workspace");

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    return Promise.all(
      members.map(async (m) => {
        const user = m.userId ? await ctx.db.get(m.userId) : null;
        return {
          _id: m._id,
          role: m.role,
          status: m.status,
          inviteEmail: m.inviteEmail,
          joinedAt: m.joinedAt,
          user: user
            ? { name: user.name, email: user.email, image: user.image }
            : null,
        };
      }),
    );
  },
});

// ===== Mutations =====

export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Authentication required");

    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", token))
      .first();

    if (!member) throw new ConvexError("Invalid or expired invite link");
    if (member.status !== "pending") throw new ConvexError("Invite already used");
    if (member.inviteExpiresAt && member.inviteExpiresAt < Date.now()) {
      throw new ConvexError("Invite link has expired");
    }

    await ctx.db.patch(member._id, {
      userId,
      status: "active",
      joinedAt: Date.now(),
      inviteToken: undefined,
      inviteExpiresAt: undefined,
    });

    await ctx.db.patch(userId, { activeWorkspaceId: member.workspaceId });

    return member.workspaceId;
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("workspaceMembers") },
  handler: async (ctx, { memberId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Authentication required");

    const target = await ctx.db.get(memberId);
    if (!target) throw new ConvexError("Member not found");
    if (target.role === "owner") throw new ConvexError("Cannot remove workspace owner");

    const self = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId).eq("status", "active"))
      .filter((q) => q.eq(q.field("workspaceId"), target.workspaceId))
      .first();
    if (!self || !["owner", "admin"].includes(self.role)) {
      throw new ConvexError("Only owners and admins can remove members");
    }

    await ctx.db.delete(memberId);
  },
});

// ===== Actions =====

export const inviteMembers = action({
  args: {
    workspaceId: v.id("workspaces"),
    emails: v.array(v.string()),
    role: v.union(v.literal("admin"), v.literal("editor")),
  },
  handler: async (ctx, { workspaceId, emails, role }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Authentication required");

    const selfRole = await ctx.runQuery(internal.workspaceMembers._getMemberRole, {
      userId,
      workspaceId,
    });
    if (!selfRole || !["owner", "admin"].includes(selfRole)) {
      throw new ConvexError("Only owners and admins can invite members");
    }

    const workspace = await ctx.runQuery(internal.workspaceMembers._getWorkspace, {
      workspaceId,
    });
    if (!workspace) throw new ConvexError("Workspace not found");

    const apiKey = process.env.AUTH_RESEND_KEY;
    const results: Array<{ email: string; status: "invited" | "error"; error?: string }> = [];

    for (const rawEmail of emails) {
      const email = rawEmail.trim().toLowerCase();
      if (!email) continue;

      try {
        const token = generateToken();
        const expiresAt = Date.now() + INVITE_TTL_MS;

        await ctx.runMutation(internal.workspaceMembers._createPendingMember, {
          workspaceId,
          inviteEmail: email,
          inviteToken: token,
          inviteExpiresAt: expiresAt,
          role,
          invitedBy: userId,
        });

        if (apiKey) {
          const siteUrl = process.env.SITE_URL ?? "";
          const inviteUrl = `${siteUrl}/admin/accept-invite?token=${token}`;
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "no-reply@resend.dev",
              to: email,
              subject: `You're invited to ${workspace.name}`,
              html: `<p>You've been invited to join <strong>${workspace.name}</strong> as ${role}.</p><p><a href="${inviteUrl}">Accept invitation</a></p><p>This link expires in 7 days.</p>`,
            }),
          });
        }

        results.push({ email, status: "invited" });
      } catch (err) {
        results.push({
          email,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  },
});
