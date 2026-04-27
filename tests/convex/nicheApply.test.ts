/**
 * Lock-aware apply for the niche generator.
 *
 * Verifies that _applyOneSlot:
 *  - writes when there's no row yet
 *  - writes when the existing row uses the bundled default
 *  - skips when the existing row is custom (useDefault=false, body !== default)
 *  - writes when force=true regardless of lock
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { getDefaultInstruction } from "../../convex/agents/instructionsResolver";

describe("nicheGenerator._applyOneSlot", () => {
  it("creates a new row when none exists", async () => {
    const t = convexTest(schema);
    const result = await t.mutation(internal.admin.nicheGenerator._applyOneSlot, {
      stage: "research",
      body: "TAILORED RESEARCH",
      force: false,
    });
    expect(result).toBe("written");
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("agentInstructions")
        .withIndex("by_stage_format", (q) => q.eq("stage", "research").eq("format", undefined))
        .first(),
    );
    expect(row?.body).toBe("TAILORED RESEARCH");
    expect(row?.useDefault).toBe(false);
  });

  it("overwrites a row that is on the bundled default", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("agentInstructions", {
        stage: "outline",
        body: getDefaultInstruction("outline"),
        useDefault: true,
        updatedAt: Date.now(),
      });
    });
    const result = await t.mutation(internal.admin.nicheGenerator._applyOneSlot, {
      stage: "outline",
      body: "TAILORED OUTLINE",
      force: false,
    });
    expect(result).toBe("written");
  });

  it("skips a custom-edited row when force=false", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("agentInstructions", {
        stage: "draft",
        body: "MY HAND-TUNED DRAFT PROMPT",
        useDefault: false,
        updatedAt: Date.now(),
      });
    });
    const result = await t.mutation(internal.admin.nicheGenerator._applyOneSlot, {
      stage: "draft",
      body: "GENERATOR-WRITTEN DRAFT",
      force: false,
    });
    expect(result).toBe("skipped_locked");
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("agentInstructions")
        .withIndex("by_stage_format", (q) => q.eq("stage", "draft").eq("format", undefined))
        .first(),
    );
    expect(row?.body).toBe("MY HAND-TUNED DRAFT PROMPT");
  });

  it("writes a custom-edited row when force=true", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("agentInstructions", {
        stage: "draft",
        body: "MY HAND-TUNED DRAFT PROMPT",
        useDefault: false,
        updatedAt: Date.now(),
      });
    });
    const result = await t.mutation(internal.admin.nicheGenerator._applyOneSlot, {
      stage: "draft",
      body: "GENERATOR-WRITTEN DRAFT",
      force: true,
    });
    expect(result).toBe("written");
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("agentInstructions")
        .withIndex("by_stage_format", (q) => q.eq("stage", "draft").eq("format", undefined))
        .first(),
    );
    expect(row?.body).toBe("GENERATOR-WRITTEN DRAFT");
  });

  it("scopes by (stage, format) — draft+twitter doesn't collide with bare draft", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.admin.nicheGenerator._applyOneSlot, {
      stage: "draft",
      body: "BARE DRAFT",
      force: false,
    });
    await t.mutation(internal.admin.nicheGenerator._applyOneSlot, {
      stage: "draft",
      format: "twitter_thread",
      body: "TWITTER FORMAT",
      force: false,
    });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentInstructions").collect(),
    );
    expect(rows).toHaveLength(2);
    const bare = rows.find((r) => r.format === undefined);
    const tw = rows.find((r) => r.format === "twitter_thread");
    expect(bare?.body).toBe("BARE DRAFT");
    expect(tw?.body).toBe("TWITTER FORMAT");
  });
});
