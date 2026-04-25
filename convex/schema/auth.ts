import { defineTable } from "convex/server";
import { v } from "convex/values";

export const authDomainTables = {
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  }).index("email", ["email"])
    .index("phone", ["phone"]),

  userRoles: defineTable({
    userId: v.id("users"),
    role: v.string(),
    assignedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_role", ["role"]),

  adminProfiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    notificationPreferences: v.optional(v.object({
      content_review_push: v.optional(v.boolean()),
      content_review_email: v.optional(v.boolean()),
    })),
    avatarStorageId: v.optional(v.id("_storage")),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
};
