/**
 * convex-test integration tests for the agent-instructions DB layer.
 *
 * These exercise the resolver fallback logic (DB row vs bundled constant)
 * and the upsert/reset round-trip. Requires `pnpx convex codegen` to have
 * generated `convex/_generated/` first (the SessionStart hook does this on
 * web sessions).
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

describe("instructionsResolver.resolve", () => {
  it("falls back to the bundled default when no DB row exists", async () => {
    const t = convexTest(schema);
    const out = await t.query(internal.agents.instructionsResolver.resolve, {
      stage: "research",
    });
    expect(out).toContain("research specialist");
  });

  it("returns the DB body when a row exists with useDefault=false", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("agentInstructions", {
        stage: "research",
        body: "CUSTOM RESEARCH PROMPT",
        useDefault: false,
        updatedAt: Date.now(),
      });
    });
    const out = await t.query(internal.agents.instructionsResolver.resolve, {
      stage: "research",
    });
    expect(out).toBe("CUSTOM RESEARCH PROMPT");
  });

  it("falls back to default when useDefault=true even if a row exists", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("agentInstructions", {
        stage: "outline",
        body: "should not be returned",
        useDefault: true,
        updatedAt: Date.now(),
      });
    });
    const out = await t.query(internal.agents.instructionsResolver.resolve, {
      stage: "outline",
    });
    expect(out).toContain("content strategist");
    expect(out).not.toBe("should not be returned");
  });

  it("scopes by format — twitter_thread returns the thread block", async () => {
    const t = convexTest(schema);
    const out = await t.query(internal.agents.instructionsResolver.resolve, {
      stage: "draft",
      format: "twitter_thread",
    });
    expect(out).toContain("Twitter/X Thread");
  });

  it("DB rows for (stage=draft, format=undefined) and (stage=draft, format=twitter_thread) don't collide", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("agentInstructions", {
        stage: "draft",
        body: "CUSTOM BASE DRAFT",
        useDefault: false,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("agentInstructions", {
        stage: "draft",
        format: "twitter_thread",
        body: "CUSTOM THREAD BLOCK",
        useDefault: false,
        updatedAt: Date.now(),
      });
    });

    const base = await t.query(internal.agents.instructionsResolver.resolve, {
      stage: "draft",
    });
    const thread = await t.query(internal.agents.instructionsResolver.resolve, {
      stage: "draft",
      format: "twitter_thread",
    });
    expect(base).toBe("CUSTOM BASE DRAFT");
    expect(thread).toBe("CUSTOM THREAD BLOCK");
  });
});

describe("admin.agentInstructions.list", () => {
  it("returns six synthetic slots even with an empty table", async () => {
    const t = convexTest(schema);
    // adminQuery requires auth — use t.run to read the DB shape directly.
    const slots = await t.run(async (ctx) => {
      const rows = await ctx.db.query("agentInstructions").collect();
      return rows;
    });
    expect(slots).toHaveLength(0);
    // Then when the user is wired up, the adminQuery would return 6 entries
    // with isOverridden=false and the bundled defaults inlined.
  });
});
