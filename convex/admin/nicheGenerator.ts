/**
 * Niche-Driven Prompt Generator (Stage 2)
 *
 * Operator gives the system a niche profile (description + audience + optional
 * website) and the generator produces tailored versions of all six agent
 * prompts (research / outline / draft + 3 format adapters), which the operator
 * previews and applies to the agentInstructions table.
 *
 * Pure function `buildMetaPrompt` is kept exported for unit testing.
 *
 * Lock-aware apply: rows that the operator has manually edited (useDefault=false
 * with a body that doesn't match the bundled default) are NOT overwritten unless
 * `force` is passed. This prevents a regenerate from clobbering hand-tuned text.
 */

import { v } from "convex/values";
import { z } from "zod";
import { generateObject } from "ai";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import {
  workspaceAdminAction,
  workspaceAdminMutation,
  workspaceAdminQuery,
} from "../lib/adminAuth";
import { createModelFromConfig, type GatewayProvider } from "../agents/config";
import { getDefaultInstruction } from "../agents/instructionsResolver";

// ===== Types =====

type Stage = "research" | "outline" | "draft";
type Format = "twitter_thread" | "linkedin_article" | "newsletter_issue";

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

export type GeneratedPromptSet = {
  research: string;
  outline: string;
  draft: string;
  twitter_thread: string;
  linkedin_article: string;
  newsletter_issue: string;
};

const PromptSetSchema = z.object({
  research: z.string().min(200),
  outline: z.string().min(200),
  draft: z.string().min(200),
  twitter_thread: z.string().min(100),
  linkedin_article: z.string().min(100),
  newsletter_issue: z.string().min(100),
});

const ALL_KEYS: Array<{ stage: Stage; format?: Format; key: keyof GeneratedPromptSet }> = [
  { stage: "research", key: "research" },
  { stage: "outline", key: "outline" },
  { stage: "draft", key: "draft" },
  { stage: "draft", format: "twitter_thread", key: "twitter_thread" },
  { stage: "draft", format: "linkedin_article", key: "linkedin_article" },
  { stage: "draft", format: "newsletter_issue", key: "newsletter_issue" },
];

// ===== Pure: meta-prompt construction (testable) =====

export type NicheInputs = {
  description: string;
  audience: string;
  websiteUrl?: string;
  websiteSummary?: string; // populated from a Firecrawl scrape, optional
};

export function buildMetaPrompt(inputs: NicheInputs): string {
  const sections: string[] = [];
  sections.push(`You are configuring an AI content pipeline for a specific niche.`);
  sections.push(`# Niche profile\n\n- **Domain / niche**: ${inputs.description}\n- **Target audience**: ${inputs.audience}${inputs.websiteUrl ? `\n- **Website**: ${inputs.websiteUrl}` : ""}`);
  if (inputs.websiteSummary && inputs.websiteSummary.trim()) {
    sections.push(`# Website extract\n\n${inputs.websiteSummary.trim()}`);
  }
  sections.push(`# Task

Produce six tailored agent prompts for this niche. You MUST keep:
- The exact JSON output schema each base prompt requires (sources/summary/suggestedAngles for research; title/sections/targetWordCount for outline; content/metaDescription/estimatedReadTime for draft).
- The hard rules in the draft prompt (no H1, no placeholder tokens, GFM footnote citations under a final \`## Sources\` heading).
- The structural requirements of each format adapter (Twitter character limits, LinkedIn no-H1 + short paragraphs, newsletter SUBJECT/PREVIEW/INTRO/MAIN STORY/QUICK HITS/CTA section headers).

Tailor:
- Tone, voice, and audience framing.
- Topic-area examples and quality standards.
- What "good sources" look like for this niche.
- Format adapter specifics (e.g. who the LinkedIn audience actually is, what kind of CTA fits the newsletter).

Below are the current bundled defaults — produce a niche-tailored version of each, similar in length and structure but rewritten for the profile above. Don't copy the defaults verbatim; rewrite them.

# Defaults to rewrite

## research (default)
${getDefaultInstruction("research")}

## outline (default)
${getDefaultInstruction("outline")}

## draft (default)
${getDefaultInstruction("draft")}

## twitter_thread (default)
${getDefaultInstruction("draft", "twitter_thread")}

## linkedin_article (default)
${getDefaultInstruction("draft", "linkedin_article")}

## newsletter_issue (default)
${getDefaultInstruction("draft", "newsletter_issue")}

Return JSON matching the requested schema. Each field is the full rewritten prompt as a single string; preserve markdown headings inside.`);

  return sections.join("\n\n");
}

// ===== Internal queries / mutations =====

/**
 * Read the niche profile row from siteSettings for a workspace.
 */
export const _readNicheRow = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    return await ctx.db
      .query("siteSettings")
      .withIndex("by_workspace_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", "niche"),
      )
      .first();
  },
});

/**
 * Look up the existing agentInstructions row for a slot. Returns undefined if
 * none exists.
 */
export const _readSlot = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    stage: stageValidator,
    format: v.optional(formatValidator),
  },
  handler: async (ctx, { workspaceId, stage, format }) => {
    return await ctx.db
      .query("agentInstructions")
      .withIndex("by_workspace_stage_format", (q) =>
        q.eq("workspaceId", workspaceId).eq("stage", stage).eq("format", format),
      )
      .first();
  },
});

/**
 * Stamp the niche row with last-generated metadata. Called from generatePrompts.
 */
export const _stampNicheGenerated = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    model: v.string(),
  },
  handler: async (ctx, { workspaceId, model }) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_workspace_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", "niche"),
      )
      .first();
    const patch = {
      key: "niche",
      workspaceId,
      nicheLastGeneratedAt: Date.now(),
      nicheLastSourceModel: model,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", patch);
  },
});

/**
 * Apply a single generated prompt to agentInstructions. Skips locked rows
 * (useDefault=false with body diverging from default) unless force=true.
 * Returns the action taken so the UI can summarize.
 */
export const _applyOneSlot = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    stage: stageValidator,
    format: v.optional(formatValidator),
    body: v.string(),
    force: v.boolean(),
  },
  handler: async (ctx, { workspaceId, stage, format, body, force }): Promise<"written" | "skipped_locked"> => {
    const existing = await ctx.db
      .query("agentInstructions")
      .withIndex("by_workspace_stage_format", (q) =>
        q.eq("workspaceId", workspaceId).eq("stage", stage).eq("format", format),
      )
      .first();

    const now = Date.now();
    const isLocked =
      existing &&
      existing.useDefault === false &&
      existing.body !== getDefaultInstruction(stage as Stage, format as Format | undefined);

    if (isLocked && !force) {
      return "skipped_locked";
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        body,
        useDefault: false,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("agentInstructions", {
        workspaceId,
        stage,
        format,
        body,
        useDefault: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    return "written";
  },
});

// ===== Admin queries / mutations =====

/**
 * Read the saved niche profile (does NOT include the bundled defaults).
 */
export const getNicheConfig = workspaceAdminQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("siteSettings")
      .withIndex("by_workspace_key", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("key", "niche"),
      )
      .first();
    if (!row) return null;
    return {
      websiteUrl: row.nicheWebsiteUrl,
      description: row.nicheDescription,
      audience: row.nicheAudience,
      lastGeneratedAt: row.nicheLastGeneratedAt,
      lastSourceModel: row.nicheLastSourceModel,
      updatedAt: row.updatedAt,
    };
  },
});

/**
 * Save the niche inputs (form data). Does NOT trigger generation; that's
 * a separate `generatePrompts` action so the operator can preview.
 */
export const saveNicheConfig = workspaceAdminMutation({
  args: {
    websiteUrl: v.optional(v.string()),
    description: v.string(),
    audience: v.string(),
  },
  handler: async (ctx, { websiteUrl, description, audience }) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_workspace_key", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("key", "niche"),
      )
      .first();
    const patch = {
      key: "niche",
      workspaceId: ctx.workspaceId,
      nicheWebsiteUrl: websiteUrl,
      nicheDescription: description,
      nicheAudience: audience,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", patch);
  },
});

// ===== Admin actions =====

/**
 * Generate tailored prompts for the configured niche. Saves the niche config
 * (in case the operator hasn't pressed save), optionally scrapes the website
 * for context, runs the meta-prompt through the configured "draft" model, and
 * returns the proposed six prompts as a preview. Does NOT write to
 * agentInstructions — that's `applyGeneratedPrompts`.
 */
export const generatePrompts = workspaceAdminAction({
  args: {
    websiteUrl: v.optional(v.string()),
    description: v.string(),
    audience: v.string(),
  },
  handler: async (ctx, { websiteUrl, description, audience }) => {
    // 1. Persist inputs so the row exists for the stamp later.
    await ctx.runMutation(internal.admin.nicheGenerator._saveNicheInputsInternal, {
      workspaceId: ctx.workspaceId,
      websiteUrl,
      description,
      audience,
    });

    // 2. Optional Firecrawl scrape for site context.
    let websiteSummary: string | undefined;
    if (websiteUrl && websiteUrl.trim().length > 0) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(websiteUrl);
      } catch {
        throw new Error("Invalid website URL format");
      }
      if (parsedUrl.protocol !== "https:") {
        throw new Error("Only https:// URLs are supported for website scraping");
      }
      try {
        const scraped: any = await ctx.runAction(
          internal.admin.genericScraper.scrapeWithSchema,
          {
            url: websiteUrl,
            schemaJson: JSON.stringify({
              type: "object",
              properties: {
                brandName: { type: "string", description: "The brand or product name" },
                tagline: { type: "string", description: "Tagline or value prop" },
                voiceCues: {
                  type: "array",
                  items: { type: "string" },
                  description: "Notable voice/tone cues — sample sentences that capture how the brand writes",
                },
                productsOrServices: {
                  type: "array",
                  items: { type: "string" },
                  description: "What the site sells or offers",
                },
                ctas: {
                  type: "array",
                  items: { type: "string" },
                  description: "Common calls-to-action used on the site",
                },
              },
            }),
            extractionPrompt:
              "Extract the brand's voice, tagline, primary products/services, and common calls-to-action from the homepage. Be concise; we use this as input to a content-pipeline tailoring step.",
          },
        );
        const extract = scraped?.extract ?? scraped ?? {};
        const lines: string[] = [];
        if (extract.brandName) lines.push(`Brand: ${extract.brandName}`);
        if (extract.tagline) lines.push(`Tagline: ${extract.tagline}`);
        if (Array.isArray(extract.voiceCues) && extract.voiceCues.length)
          lines.push(`Voice cues:\n- ${extract.voiceCues.join("\n- ")}`);
        if (Array.isArray(extract.productsOrServices) && extract.productsOrServices.length)
          lines.push(`Products/services:\n- ${extract.productsOrServices.join("\n- ")}`);
        if (Array.isArray(extract.ctas) && extract.ctas.length)
          lines.push(`Common CTAs:\n- ${extract.ctas.join("\n- ")}`);
        websiteSummary = lines.join("\n\n");
      } catch (err) {
        console.warn("[niche-generator] website scrape failed, continuing without it:", err);
      }
    }

    // 3. Build meta-prompt and call the configured "draft" model with structured output.
    const config: { provider: string; model: string } = await ctx.runQuery(
      internal.agents.config.getConfig,
      { key: "draft" },
    );
    const modelProvider = config.provider as GatewayProvider;
    const modelId = config.model;
    const model = createModelFromConfig(modelProvider, modelId);

    const prompt = buildMetaPrompt({ description, audience, websiteUrl, websiteSummary });

    const result = await generateObject({
      model,
      schema: PromptSetSchema,
      prompt,
      temperature: 0.4,
    });

    const generated: GeneratedPromptSet = result.object;

    // 4. Stamp the niche row with metadata.
    await ctx.runMutation(internal.admin.nicheGenerator._stampNicheGenerated, {
      workspaceId: ctx.workspaceId,
      model: `${modelProvider}/${modelId}`,
    });

    // 5. Build a preview against current state (which slots are locked).
    const slotsPreview = await Promise.all(
      ALL_KEYS.map(async ({ stage, format, key }) => {
        const existing = await ctx.runQuery(
          internal.admin.nicheGenerator._readSlot,
          { workspaceId: ctx.workspaceId, stage, format },
        );
        const defaultBody = getDefaultInstruction(stage, format);
        const isLocked =
          !!existing &&
          existing.useDefault === false &&
          existing.body !== defaultBody;
        return {
          stage,
          format,
          key,
          newBody: generated[key],
          currentBody: existing?.body ?? defaultBody,
          isLocked,
          isOverridden: !!existing && !existing.useDefault,
        };
      }),
    );

    return {
      generated,
      slots: slotsPreview,
      sourceModel: `${modelProvider}/${modelId}`,
      websiteSummaryUsed: !!websiteSummary,
    };
  },
});

// Internal mutation used by generatePrompts to save inputs before running the LLM.
export const _saveNicheInputsInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    websiteUrl: v.optional(v.string()),
    description: v.string(),
    audience: v.string(),
  },
  handler: async (ctx, { workspaceId, websiteUrl, description, audience }) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_workspace_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", "niche"),
      )
      .first();
    const patch = {
      key: "niche",
      workspaceId,
      nicheWebsiteUrl: websiteUrl,
      nicheDescription: description,
      nicheAudience: audience,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", patch);
  },
});

/**
 * Apply a previously-generated set of prompts to agentInstructions.
 * `force` overrides the lock check (custom-edited rows otherwise stay).
 */
export const applyGeneratedPrompts = workspaceAdminAction({
  args: {
    prompts: v.object({
      research: v.string(),
      outline: v.string(),
      draft: v.string(),
      twitter_thread: v.string(),
      linkedin_article: v.string(),
      newsletter_issue: v.string(),
    }),
    force: v.optional(v.boolean()),
    only: v.optional(
      v.array(
        v.union(
          v.literal("research"),
          v.literal("outline"),
          v.literal("draft"),
          v.literal("twitter_thread"),
          v.literal("linkedin_article"),
          v.literal("newsletter_issue"),
        ),
      ),
    ),
  },
  handler: async (ctx, { prompts, force, only }) => {
    const force_ = !!force;
    const onlySet = only ? new Set(only) : null;
    const written: string[] = [];
    const skipped: string[] = [];
    for (const { stage, format, key } of ALL_KEYS) {
      if (onlySet && !onlySet.has(key)) continue;
      const result = await ctx.runMutation(
        internal.admin.nicheGenerator._applyOneSlot,
        {
          workspaceId: ctx.workspaceId,
          stage,
          format,
          body: prompts[key],
          force: force_,
        },
      );
      if (result === "written") written.push(key);
      else skipped.push(key);
    }
    return { written, skipped };
  },
});
