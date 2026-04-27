/**
 * Agent Instructions Admin
 *
 * CRUD for the DB-driven prompt overrides. Each row corresponds to a
 * (stage, format) pair. The admin UI (AgentInstructionsAdmin.tsx) edits these
 * rows; the runtime resolver (convex/agents/instructionsResolver.ts) reads
 * them and falls back to the constants in convex/agents/instructions.ts and
 * convex/agents/formatAdapters.ts.
 */

import { v } from "convex/values";
import { adminMutation, adminQuery } from "../lib/adminAuth";
import { getDefaultInstruction } from "../agents/instructionsResolver";

const stageValidator = v.union(
  v.literal("research"),
  v.literal("outline"),
  v.literal("draft"),
);

const formatValidator = v.union(
  v.literal("twitter_thread"),
  v.literal("linkedin_article"),
  v.literal("newsletter_issue"),
);

type Stage = "research" | "outline" | "draft";
type Format = "twitter_thread" | "linkedin_article" | "newsletter_issue";

const ALL_KEYS: Array<{ stage: Stage; format?: Format }> = [
  { stage: "research" },
  { stage: "outline" },
  { stage: "draft" },
  { stage: "draft", format: "twitter_thread" },
  { stage: "draft", format: "linkedin_article" },
  { stage: "draft", format: "newsletter_issue" },
];

/**
 * Return one entry per (stage, format) slot — DB row when present, otherwise
 * a synthetic record exposing the bundled default. Lets the UI render every
 * editable prompt regardless of whether anyone has saved an override.
 */
export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("agentInstructions").collect();
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      byKey.set(`${r.stage}::${r.format ?? ""}`, r);
    }

    return ALL_KEYS.map(({ stage, format }) => {
      const key = `${stage}::${format ?? ""}`;
      const row = byKey.get(key);
      const defaultBody = getDefaultInstruction(stage, format);
      if (row) {
        return {
          _id: row._id,
          stage: row.stage,
          format: row.format,
          body: row.body,
          useDefault: row.useDefault,
          updatedAt: row.updatedAt,
          defaultBody,
          isOverridden: !row.useDefault,
        };
      }
      return {
        _id: null,
        stage,
        format,
        body: defaultBody,
        useDefault: true,
        updatedAt: null,
        defaultBody,
        isOverridden: false,
      };
    });
  },
});

/**
 * Save (or upsert) a custom prompt for one (stage, format) slot. Setting
 * useDefault=true makes the resolver fall back to the constant; the row is
 * kept so the body persists if you toggle useDefault back off.
 */
export const upsert = adminMutation({
  args: {
    stage: stageValidator,
    format: v.optional(formatValidator),
    body: v.string(),
    useDefault: v.boolean(),
  },
  handler: async (ctx, { stage, format, body, useDefault }) => {
    const existing = await ctx.db
      .query("agentInstructions")
      .withIndex("by_stage_format", (q) =>
        q.eq("stage", stage).eq("format", format),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { body, useDefault, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("agentInstructions", {
      stage,
      format,
      body,
      useDefault,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Drop the override for a slot. The resolver will fall back to the constant.
 */
export const resetToDefault = adminMutation({
  args: {
    stage: stageValidator,
    format: v.optional(formatValidator),
  },
  handler: async (ctx, { stage, format }) => {
    const existing = await ctx.db
      .query("agentInstructions")
      .withIndex("by_stage_format", (q) =>
        q.eq("stage", stage).eq("format", format),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
