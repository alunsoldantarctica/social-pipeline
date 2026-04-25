import { mutation, query } from "../_generated/server";
import type { Migration } from "./types";

// Import all migration handlers
import { handler as initAgentConfigs } from "./entries/2026_04_24_init_agent_configs";
import { handler as seedEditorialRules } from "./entries/2026_04_21_seed_editorial_rules";
import { handler as seedPipelineCostAssumptions } from "./entries/2026_04_21_seed_pipeline_cost_assumptions";
import { handler as cleanBlogSlugsAndImages } from "./entries/2026_03_17_clean_blog_slugs_and_images";
import { handler as backfillBlogpostPodId } from "./entries/2026_04_21_backfill_blogpost_pod_id";
import { handler as abandonStuckDrafts } from "./entries/2026_04_21_abandon_stuck_drafts";
import { handler as backfillBriefCompletion } from "./entries/2026_04_21_backfill_brief_completion";
import { handler as backfillDraftSanitize } from "./entries/2026_04_21_backfill_draft_sanitize";
import { handler as backfillLegacyBlogpostPodId } from "./entries/2026_04_21_backfill_legacy_blogpost_pod_id";
import { handler as backfillNotificationCategory } from "./entries/2026_04_21_backfill_notification_category";

// Migration registry — ordered, runs exactly once per environment.
// Add new migrations at the bottom. Never remove or reorder existing entries.
const MIGRATIONS: Migration[] = [
  // ── Initial setup ──
  { name: "2026_04_24_init_agent_configs", handler: initAgentConfigs },
  { name: "2026_04_21_seed_editorial_rules", handler: seedEditorialRules },
  { name: "2026_04_21_seed_pipeline_cost_assumptions", handler: seedPipelineCostAssumptions },

  // ── Blog post cleanup ──
  { name: "2026_03_17_clean_blog_slugs_and_images", handler: cleanBlogSlugsAndImages },
  { name: "2026_04_21_backfill_legacy_blogpost_pod_id", handler: backfillLegacyBlogpostPodId },
  { name: "2026_04_21_backfill_blogpost_pod_id", handler: backfillBlogpostPodId },

  // ── Pipeline health ──
  { name: "2026_04_21_abandon_stuck_drafts", handler: abandonStuckDrafts },
  { name: "2026_04_21_backfill_brief_completion", handler: backfillBriefCompletion },
  { name: "2026_04_21_backfill_draft_sanitize", handler: backfillDraftSanitize },
  { name: "2026_04_21_backfill_notification_category", handler: backfillNotificationCategory },
];

/** Run all pending migrations (those not yet recorded in deployMigrations). */
export const runPending = mutation({
  args: {},
  handler: async (ctx): Promise<{ ran: string[]; skipped: string[] }> => {
    const ran: string[] = [];
    const skipped: string[] = [];

    for (const migration of MIGRATIONS) {
      const existing = await ctx.db
        .query("deployMigrations")
        .withIndex("by_name", (q) => q.eq("name", migration.name))
        .first();

      if (existing) {
        skipped.push(migration.name);
        continue;
      }

      const start = Date.now();
      let result: string | undefined;

      try {
        result = await migration.handler(ctx);
      } catch (error) {
        console.error(`[migration] ${migration.name} failed:`, error);
        throw error;
      }

      await ctx.db.insert("deployMigrations", {
        name: migration.name,
        ranAt: Date.now(),
        durationMs: Date.now() - start,
        result,
      });

      ran.push(migration.name);
    }

    return { ran, skipped };
  },
});

/** Check which migrations have run and which are pending. */
export const status = query({
  args: {},
  handler: async (ctx): Promise<{ ran: string[]; pending: string[] }> => {
    const completed = await ctx.db.query("deployMigrations").collect();
    const completedNames = new Set(completed.map((m) => m.name));

    const ran = MIGRATIONS
      .filter((m) => completedNames.has(m.name))
      .map((m) => m.name);

    const pending = MIGRATIONS
      .filter((m) => !completedNames.has(m.name))
      .map((m) => m.name);

    return { ran, pending };
  },
});
