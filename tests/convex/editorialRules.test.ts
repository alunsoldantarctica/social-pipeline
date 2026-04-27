/**
 * convex-test integration tests for editorialRules CRUD + ordering.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

describe("editorialRules.create + list", () => {
  it("creates a rule with sequential order and returns it from list", async () => {
    const t = convexTest(schema);
    await t.mutation(api.admin.editorialRules.create, {
      category: "tone",
      title: "Active voice",
      body: "Prefer active voice over passive.",
    });
    const rules = await t.query(api.admin.editorialRules.list, {});
    expect(rules).toHaveLength(1);
    expect(rules[0].title).toBe("Active voice");
    expect(rules[0].order).toBe(0);
    expect(rules[0].isActive).toBe(true);
  });

  it("auto-increments order across multiple creates", async () => {
    const t = convexTest(schema);
    await t.mutation(api.admin.editorialRules.create, {
      category: "tone",
      title: "First",
      body: "1",
    });
    await t.mutation(api.admin.editorialRules.create, {
      category: "tone",
      title: "Second",
      body: "2",
    });
    const rules = await t.query(api.admin.editorialRules.list, {});
    expect(rules.map((r) => r.order)).toEqual([0, 1]);
  });
});

describe("editorialRules.toggleActive", () => {
  it("flips isActive between true and false", async () => {
    const t = convexTest(schema);
    const id = await t.mutation(api.admin.editorialRules.create, {
      category: "structure",
      title: "Flip me",
      body: "x",
    });
    await t.mutation(api.admin.editorialRules.toggleActive, { id });
    let rules = await t.query(api.admin.editorialRules.list, {});
    expect(rules[0].isActive).toBe(false);

    await t.mutation(api.admin.editorialRules.toggleActive, { id });
    rules = await t.query(api.admin.editorialRules.list, {});
    expect(rules[0].isActive).toBe(true);
  });
});

describe("editorialRules.listActive", () => {
  it("only returns rules with isActive=true", async () => {
    const t = convexTest(schema);
    const a = await t.mutation(api.admin.editorialRules.create, {
      category: "legal",
      title: "Active",
      body: "x",
    });
    await t.mutation(api.admin.editorialRules.create, {
      category: "legal",
      title: "Inactive",
      body: "y",
      isActive: false,
    });
    const active = await t.query(api.admin.editorialRules.listActive, {});
    expect(active).toHaveLength(1);
    expect(active[0]._id).toBe(a);
  });
});

describe("editorialRules.reorder", () => {
  it("swaps order with the previous rule when direction=up", async () => {
    const t = convexTest(schema);
    const a = await t.mutation(api.admin.editorialRules.create, {
      category: "tone",
      title: "A",
      body: "a",
    });
    const b = await t.mutation(api.admin.editorialRules.create, {
      category: "tone",
      title: "B",
      body: "b",
    });
    await t.mutation(api.admin.editorialRules.reorder, { id: b, direction: "up" });
    const rules = await t.query(api.admin.editorialRules.list, {});
    // After the swap, B should come first
    expect(rules[0]._id).toBe(b);
    expect(rules[1]._id).toBe(a);
  });
});
