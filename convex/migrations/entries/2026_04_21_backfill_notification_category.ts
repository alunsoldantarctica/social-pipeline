import type { MutationCtx } from "../types";

type Category =
  | "customer_email"
  | "quote"
  | "contact_form"
  | "payment"
  | "content"
  | "system"
  | "audit"
  | "error";

const PRIORITY = new Set<Category>([
  "customer_email",
  "quote",
  "contact_form",
  "payment",
]);

function inferCategory(row: { tag?: string; title: string }): Category {
  const tag = row.tag ?? "";
  const title = row.title ?? "";

  if (tag === "contact-form") return "contact_form";
  if (tag === "content-review") return "content";
  if (tag === "email-received" || tag.startsWith("whatsapp-")) return "customer_email";
  if (tag.startsWith("new-quote-")) return "quote";
  if (tag.startsWith("preauth-")) return "payment";
  if (tag === "test-push") return "system";

  if (/new quote|quote request/i.test(title)) return "quote";
  if (/contact/i.test(title)) return "contact_form";
  if (/payment|pre-auth|preauth|guest info/i.test(title)) return "payment";
  if (/email|whatsapp|message/i.test(title)) return "customer_email";
  if (/ready for review|content/i.test(title)) return "content";

  return "system";
}

export async function handler(ctx: MutationCtx): Promise<string> {
  const rows = await ctx.db.query("adminNotifications").collect();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.category !== undefined && row.isPriority !== undefined) {
      skipped++;
      continue;
    }
    const category = row.category ?? inferCategory(row);
    const isPriority = PRIORITY.has(category);
    await ctx.db.patch(row._id, { category, isPriority });
    updated++;
  }

  return `Backfilled ${updated} adminNotifications (skipped ${skipped})`;
}
