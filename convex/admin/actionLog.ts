import { v } from "convex/values";
import { adminQuery } from "../lib/adminAuth";
import type { Doc, Id } from "../_generated/dataModel";

/** Shared shape returned by both action log queries */
interface ActionGroup {
  customerId: string;
  customerName: string;
  quoteId?: Id<"quotes">;
  conversationId: Id<"conversations"> | string;
  spaceId: Id<"spaces"> | string;
  lastActionAt: number;
  actionCount: number;
  actions: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: number;
    isRead: boolean;
    navigationTarget: {
      type: string;
      url: string;
    };
  }>;
}

/**
 * Get recent actions for the dashboard widget.
 * Groups consecutive actions by customer with collapsible UI.
 */
export const getRecentActions = adminQuery({
  args: {
    limit: v.optional(v.number()), // Default: 50 for widget
  },
  handler: async (ctx, { limit = 50 }) => {
    // Fetch conversations sorted by most recent activity
    const conversations = await ctx.db
      .query("conversations")
      .order("desc")
      .take(limit);

    const groups = [];
    
    for (const convo of conversations) {
      // Fetch recent entries for this conversation
      const entriesRaw = await ctx.db
        .query("conversationEntries")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", convo._id)
        )
        .order("desc")
        .take(20); // Last 20 actions per customer

      const entries = entriesRaw.filter((e) => !e.isDryRun);
      if (entries.length === 0) continue;

      // Fetch quote details if available
      let quote = null;
      if (convo.quoteId) {
        quote = await ctx.db.get(convo.quoteId);
      }

      groups.push({
        customerId: convo.participantEmail,
        customerName: convo.participantName ?? convo.participantEmail,
        quoteId: convo.quoteId,
        conversationId: convo._id,
        spaceId: convo.spaceId,
        lastActionAt: entries[0].timestamp,
        actionCount: entries.length,
        actions: entries.map(e => ({
          id: e._id,
          type: e.type,
          description: generateActionDescription(e, quote),
          timestamp: e.timestamp,
          isRead: e.isReadByAdmin,
          navigationTarget: determineNavigationTarget(e, convo, quote),
        })),
      });
    }

    // Sort groups by most recent action
    groups.sort((a, b) => b.lastActionAt - a.lastActionAt);

    return groups;
  },
});

/**
 * Get paginated action log with filters for the full page view.
 * Merges conversationEntries with abandoned/draft quotes (including anonymous guests).
 */
export const getPaginatedActions = adminQuery({
  args: {
    cursor: v.optional(v.number()), // Timestamp of last action
    pageSize: v.optional(v.number()), // Default: 100
    filters: v.optional(v.object({
      dateStart: v.optional(v.number()),
      dateEnd: v.optional(v.number()),
      actionTypes: v.optional(v.array(v.string())),
      customerEmail: v.optional(v.string()),
      conversationStatus: v.optional(v.string()),
    })),
  },
  handler: async (ctx, { cursor, pageSize = 100, filters }) => {
    const wantOnlyAbandoned = filters?.actionTypes?.length === 1
      && filters.actionTypes[0] === "quote_abandoned";
    const excludeAbandoned = filters?.actionTypes
      && filters.actionTypes.length > 0
      && !filters.actionTypes.includes("quote_abandoned");

    // --- 1. Conversation entries (skip if filtering to abandoned only) ---
    let entryGroups: ActionGroup[] = [];
    let entriesCount = 0;
    if (!wantOnlyAbandoned) {
      const entries_raw = cursor
        ? await ctx.db.query("conversationEntries")
            .withIndex("by_timestamp_global", (q) => q.lt("timestamp", cursor))
            .order("desc").take(pageSize * 2)
        : await ctx.db.query("conversationEntries")
            .withIndex("by_timestamp_global")
            .order("desc").take(pageSize * 2);

      let entries = entries_raw.filter((e) => !e.isDryRun);
      if (filters) {
        entries = entries.filter(entry => {
          if (filters.dateStart && entry.timestamp < filters.dateStart) return false;
          if (filters.dateEnd && entry.timestamp > filters.dateEnd) return false;
          if (filters.actionTypes && filters.actionTypes.length > 0) {
            if (!filters.actionTypes.includes(entry.type)) return false;
          }
          return true;
        });
      }
      entries = entries.slice(0, pageSize);
      entriesCount = entries.length;
      entryGroups = await groupActionsByConversation(ctx, entries);
    }

    // --- 2. Abandoned/draft quotes (skip if filter excludes them) ---
    let quoteGroups: ActionGroup[] = [];
    if (!excludeAbandoned) {
      // Fetch abandoned quotes, paginated by updatedAt
      const abandonedQuotes = cursor
        ? await ctx.db.query("quotes")
            .withIndex("by_status", (q) => q.eq("status", "abandoned").lt("createdAt", cursor))
            .order("desc").take(pageSize)
        : await ctx.db.query("quotes")
            .withIndex("by_status", (q) => q.eq("status", "abandoned"))
            .order("desc").take(pageSize);

      // Apply date/email filters
      let filtered = abandonedQuotes;
      if (filters) {
        filtered = filtered.filter(q => {
          const ts = q.updatedAt ?? q.createdAt ?? q._creationTime;
          if (filters.dateStart && ts < filters.dateStart) return false;
          if (filters.dateEnd && ts > filters.dateEnd) return false;
          if (filters.customerEmail && q.email && !q.email.toLowerCase().includes(filters.customerEmail.toLowerCase())) return false;
          return true;
        });
      }

      // Exclude quotes that already have conversation entries (avoid duplicates)
      const quotesWithConversations = new Set(
        entryGroups.filter(g => g.quoteId).map(g => g.quoteId)
      );

      for (const q of filtered) {
        if (quotesWithConversations.has(q._id)) continue;

        const ts = q.updatedAt ?? q.createdAt ?? q._creationTime;
        const isAnonymous = !q.email;
        const label = isAnonymous
          ? `Anonymous visitor${q.visitorCity ? ` from ${q.visitorCity}` : ""}${q.visitorCountry ? `, ${q.visitorCountry}` : ""}`
          : (q.name || q.email);

        const details = [
          q.destination,
          q.startDate,
          q.travelers ? `${q.travelers} traveler${q.travelers !== 1 ? "s" : ""}` : null,
          q.tripCost ? `$${q.tripCost.toLocaleString()}` : null,
          q.operator || null,
        ].filter(Boolean).join(" · ");

        quoteGroups.push({
          customerId: q.email || q.sessionId || q._id,
          customerName: label,
          quoteId: q._id,
          conversationId: q._id as any, // Use quoteId as key for anonymous
          spaceId: "" as any,
          lastActionAt: ts,
          actionCount: 1,
          actions: [{
            id: q._id as any,
            type: "quote_abandoned",
            description: `Abandoned quote${isAnonymous ? " (anonymous)" : ""}: ${details}`,
            timestamp: ts,
            isRead: !!q.viewedByAdminAt,
            navigationTarget: {
              type: "abandoned_quote" as const,
              url: `/admin/inbox?view=abandoned&selected=${q._id}`,
            },
          }],
        });
      }
    }

    // --- 3. Merge and sort ---
    const allGroups = [...entryGroups, ...quoteGroups]
      .sort((a, b) => b.lastActionAt - a.lastActionAt)
      .slice(0, pageSize);

    const totalItems = entriesCount + quoteGroups.length;

    return {
      groups: allGroups,
      nextCursor: allGroups.length > 0 && totalItems >= pageSize
        ? allGroups[allGroups.length - 1].lastActionAt
        : null,
      hasMore: totalItems >= pageSize,
    };
  },
});

/**
 * Helper: Group conversation entries by conversation
 */
async function groupActionsByConversation(
  ctx: any,
  entries: Doc<"conversationEntries">[]
) {
  // Group entries by conversation ID
  const conversationMap = new Map<Id<"conversations">, Doc<"conversationEntries">[]>();
  
  for (const entry of entries) {
    const existing = conversationMap.get(entry.conversationId) || [];
    existing.push(entry);
    conversationMap.set(entry.conversationId, existing);
  }

  // Build groups with conversation metadata
  const groups = [];
  
  for (const [conversationId, groupEntries] of conversationMap) {
    const convo = await ctx.db.get(conversationId);
    if (!convo) continue;

    // Fetch quote if available
    let quote = null;
    if (convo.quoteId) {
      quote = await ctx.db.get(convo.quoteId);
    }

    groups.push({
      customerId: convo.participantEmail,
      customerName: convo.participantName ?? convo.participantEmail,
      quoteId: convo.quoteId,
      conversationId: convo._id,
      spaceId: convo.spaceId,
      lastActionAt: groupEntries[0].timestamp,
      actionCount: groupEntries.length,
      actions: groupEntries.map(e => ({
        id: e._id,
        type: e.type,
        description: generateActionDescription(e, quote),
        timestamp: e.timestamp,
        isRead: e.isReadByAdmin,
        navigationTarget: determineNavigationTarget(e, convo, quote),
      })),
    });
  }

  // Sort by most recent action
  groups.sort((a, b) => b.lastActionAt - a.lastActionAt);

  return groups;
}

/**
 * Generate human-readable action description
 */
function generateActionDescription(
  entry: Doc<"conversationEntries">,
  _quote: Doc<"quotes"> | null
): string {
  switch (entry.type) {
    case "message":
      return `Sent ${entry.channel ?? "message"}`;
    
    case "reply":
      return `Received admin reply`;
    
    case "note":
      return `Admin added note`;
    
    case "status_change": {
      let newStatus = entry.metadata?.newStatus;
      if (!newStatus) {
        // Parse body text for legacy entries without metadata
        const toMatch = entry.body.match(/to (\S+)$/);
        if (toMatch) {
          newStatus = toMatch[1];
        } else if (entry.body.startsWith("Archived")) {
          newStatus = "archived";
        } else if (entry.body.startsWith("Unarchived")) {
          const restoredMatch = entry.body.match(/restored to (\S+)/);
          newStatus = restoredMatch ? restoredMatch[1].replace(")", "") : "active";
        } else {
          // System merge entries or other non-status body text
          return entry.body.slice(0, 60) + (entry.body.length > 60 ? "..." : "");
        }
      }
      return `Status changed to ${formatStatus(newStatus)}`;
    }
    
    case "contract_step":
      const step = entry.metadata?.contractStep ?? "unknown";
      return `Reached ${formatStep(step)}`;
    
    case "quote_status_change":
      const quoteStatus = entry.metadata?.newStatus ?? "unknown";
      return `Quote ${formatStatus(quoteStatus)}`;
    
    case "quote_abandoned":
      return `Abandoned quote`;
    
    case "quote_viewed":
      return `Viewed quote`;
    
    case "payment_received":
      const amount = entry.metadata?.paymentAmount ?? 0;
      return `Payment received ($${(amount / 100).toFixed(2)})`;
    
    case "policy_issued":
      const policyNum = entry.metadata?.policyNumber ?? "unknown";
      return `Policy issued (${policyNum})`;
    
    default:
      // Fallback to body text (truncated)
      return entry.body.slice(0, 60) + (entry.body.length > 60 ? "..." : "");
  }
}

/**
 * Format status for display
 */
function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Format contract step for display
 */
function formatStep(step: string): string {
  const stepMap: Record<string, string> = {
    trip_review: "Trip Review",
    guest_info: "Guest Information",
    plan_selection: "Plan Selection",
    payment: "Payment",
    completed: "Completed",
  };
  return stepMap[step] || formatStatus(step);
}

/**
 * Determine navigation target for an action
 */
function determineNavigationTarget(
  entry: Doc<"conversationEntries">,
  conversation: Doc<"conversations">,
  quote: Doc<"quotes"> | null
): {
  type: "abandoned_quote" | "conversation" | "quote_detail";
  url: string;
} {
  // Abandoned cart → Abandoned quotes screen
  if (entry.type === "quote_abandoned" && conversation.quoteId) {
    return {
      type: "abandoned_quote",
      url: `/admin/inbox?view=abandoned&selected=${conversation.quoteId}`,
    };
  }

  // Quote-specific actions → Quote detail (if not abandoned)
  if (quote && ["quote_status_change", "payment_received", "policy_issued"].includes(entry.type)) {
    if (quote.status === "abandoned") {
      return {
        type: "abandoned_quote",
        url: `/admin/inbox?view=abandoned&selected=${conversation.quoteId}`,
      };
    }
    // For now, still go to conversation - we can add a quote detail view later
  }

  // Default: Customer conversation
  return {
    type: "conversation",
    url: `/admin/inbox?space=${conversation.spaceId}&conv=${conversation._id}&entry=${entry._id}`,
  };
}
