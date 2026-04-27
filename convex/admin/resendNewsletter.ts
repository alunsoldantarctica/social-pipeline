/**
 * Resend Newsletter Adapter
 *
 * Sends newsletter_issue drafts to a Resend audience as a broadcast.
 * Mirrors the Zernio adapter (convex/admin/zernioPublish.ts) — same shape,
 * different provider. Status lands on articleWorkflows.socialPublish with
 * provider="resend".
 *
 * Required Convex env: AUTH_RESEND_KEY (already in use for OTP auth).
 * Configure audience + from address via `updateResendConfig`.
 *
 * Resend broadcasts API: https://resend.com/docs/api-reference/broadcasts
 *   POST /broadcasts          → create
 *   POST /broadcasts/:id/send → send (or schedule)
 */

import { v } from "convex/values";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { adminAction, adminMutation, adminQuery } from "../lib/adminAuth";
import { parseNewsletterDraft } from "../agents/parseNewsletterDraft";

const RESEND_BASE_URL = "https://api.resend.com";

type ResendConfig = {
  autoSend: boolean;
  audienceId?: string;
  fromAddress?: string;
  replyTo?: string;
};

const EMPTY_CONFIG: ResendConfig = { autoSend: false };

function readConfig(row: unknown): ResendConfig {
  if (!row || typeof row !== "object") return EMPTY_CONFIG;
  const r = row as {
    resendAutoSend?: boolean;
    resendAudienceId?: string;
    resendFromAddress?: string;
    resendReplyTo?: string;
  };
  return {
    autoSend: r.resendAutoSend ?? false,
    audienceId: r.resendAudienceId,
    fromAddress: r.resendFromAddress,
    replyTo: r.resendReplyTo,
  };
}

async function resendFetch(path: string, init: RequestInit = {}) {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) {
    throw new Error("AUTH_RESEND_KEY is not set in Convex environment");
  }
  const res = await fetch(`${RESEND_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return await res.json();
}

// ===== INTERNAL: settings reader =====

export const _readResendRow = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "resend"))
      .first();
  },
});

// ===== INTERNAL: workflow integration =====

/**
 * Send a completed newsletter_issue workflow to Resend as a broadcast.
 * Idempotent in spirit — re-running on a workflow already marked "published"
 * skips unless `force=true`.
 */
export const sendNewsletterWorkflow = internalAction({
  args: {
    workflowRecordId: v.id("articleWorkflows"),
    scheduledAt: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { workflowRecordId, scheduledAt, force }) => {
    const workflow = await ctx.runQuery(
      internal.admin.contentPipeline.getWorkflow,
      { id: workflowRecordId },
    );
    if (!workflow) throw new Error("Workflow not found");

    if (!force && workflow.socialPublish?.status === "published") {
      return { status: "skipped", reason: "already published" };
    }

    if (workflow.outputFormat !== "newsletter_issue") {
      const reason = `outputFormat=${workflow.outputFormat ?? "blog_post"} — Resend handles newsletter_issue only`;
      await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
        id: workflowRecordId,
        socialPublish: {
          status: "skipped",
          provider: "resend",
          attemptedAt: Date.now(),
          error: reason,
        },
      });
      return { status: "skipped", reason };
    }

    const settingsRow = await ctx.runQuery(
      internal.admin.resendNewsletter._readResendRow,
      {},
    );
    const config = readConfig(settingsRow);

    if (!config.audienceId || !config.fromAddress) {
      const reason = "Resend audienceId and fromAddress must be set via updateResendConfig";
      await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
        id: workflowRecordId,
        socialPublish: {
          status: "skipped",
          provider: "resend",
          attemptedAt: Date.now(),
          error: reason,
        },
      });
      return { status: "skipped", reason };
    }

    const draftContent: string | undefined = workflow.draftOutput?.content;
    if (!draftContent) {
      throw new Error("Workflow has no draftOutput.content to send");
    }

    const parts = parseNewsletterDraft(draftContent);
    if (!parts.subject) {
      throw new Error("Newsletter draft has no usable subject — check the SUBJECT section");
    }

    const rawHtml = await marked.parse(parts.bodyMarkdown);
    const html = sanitizeHtml(rawHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ["src", "alt", "width", "height"],
        a: ["href", "title", "target", "rel"],
        "*": ["style"],
      },
      allowedSchemes: ["https", "mailto"],
    });
    const now = Date.now();

    await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
      id: workflowRecordId,
      socialPublish: {
        status: "pending",
        provider: "resend",
        profileIds: [config.audienceId],
        scheduledAt,
        attemptedAt: now,
      },
    });

    try {
      // 1. Create the broadcast
      const broadcast = await resendFetch("/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          name: `${parts.subject} — ${new Date(now).toISOString().slice(0, 10)}`,
          audience_id: config.audienceId,
          from: config.fromAddress,
          ...(config.replyTo ? { reply_to: config.replyTo } : {}),
          subject: parts.subject,
          ...(parts.preview ? { preview_text: parts.preview } : {}),
          html,
        }),
      });
      const broadcastId =
        typeof broadcast === "object" && broadcast && "id" in broadcast
          ? String((broadcast as Record<string, unknown>).id)
          : undefined;

      // 2. Send (or schedule) it
      if (broadcastId) {
        await resendFetch(`/broadcasts/${broadcastId}/send`, {
          method: "POST",
          body: JSON.stringify(
            scheduledAt
              ? { scheduled_at: new Date(scheduledAt).toISOString() }
              : {},
          ),
        });
      }

      await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
        id: workflowRecordId,
        socialPublish: {
          status: "published",
          provider: "resend",
          profileIds: [config.audienceId],
          postIds: broadcastId ? [broadcastId] : undefined,
          scheduledAt,
          attemptedAt: now,
          publishedAt: Date.now(),
        },
      });
      return { status: "published", broadcastId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.admin.contentPipeline.setSocialPublishStatus, {
        id: workflowRecordId,
        socialPublish: {
          status: "failed",
          provider: "resend",
          profileIds: [config.audienceId],
          scheduledAt,
          attemptedAt: now,
          error: message,
        },
      });
      throw error;
    }
  },
});

// ===== ADMIN: configuration =====

export const getResendConfig = adminQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "resend"))
      .first();
    return readConfig(row);
  },
});

export const updateResendConfig = adminMutation({
  args: {
    autoSend: v.boolean(),
    audienceId: v.optional(v.string()),
    fromAddress: v.optional(v.string()),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, { autoSend, audienceId, fromAddress, replyTo }) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "resend"))
      .first();
    const patch = {
      key: "resend",
      resendAutoSend: autoSend,
      resendAudienceId: audienceId,
      resendFromAddress: fromAddress,
      resendReplyTo: replyTo,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", patch);
  },
});

// ===== ADMIN: actions =====

/**
 * List Resend audiences. Use the IDs in `updateResendConfig`.
 */
export const listResendAudiences = adminAction({
  args: {},
  handler: async () => {
    return await resendFetch("/audiences");
  },
});

/**
 * Verify Resend credentials. UI helper — returns audiences on success.
 */
export const testResendConnection = adminAction({
  args: {},
  handler: async () => {
    try {
      const audiences = await resendFetch("/audiences");
      return { ok: true, audiences } as const;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } as const;
    }
  },
});

/**
 * Manually send a newsletter workflow to Resend. Useful for retries or for
 * sending older workflows once Resend is configured.
 */
export const manualSendNewsletter = adminAction({
  args: {
    id: v.id("articleWorkflows"),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, scheduledAt }) => {
    return await ctx.runAction(internal.admin.resendNewsletter.sendNewsletterWorkflow, {
      workflowRecordId: id,
      scheduledAt,
      force: true,
    });
  },
});

// ===== INTERNAL MUTATION: settings seeder =====

export const _seedResendConfig = internalMutation({
  args: {
    autoSend: v.boolean(),
    audienceId: v.optional(v.string()),
    fromAddress: v.optional(v.string()),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "resend"))
      .first();
    const patch = {
      key: "resend",
      resendAutoSend: args.autoSend,
      resendAudienceId: args.audienceId,
      resendFromAddress: args.fromAddress,
      resendReplyTo: args.replyTo,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", patch);
  },
});
