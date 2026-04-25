import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Resend } from "resend";
import { adminQuery, adminMutation } from "./lib/adminAuth";
import { emailSubject, devGuardRecipients, ADMIN_EMAIL } from "./lib/constants";
import { resolveOrCreateCustomer } from "./lib/customerIdentity";

// Subject labels for display
const subjectLabels: Record<string, string> = {
  quote: "Get a Quote",
  coverage: "Coverage Questions",
  claim: "File a Claim",
  operator: "Operator Partnership",
  existing: "Existing Policy",
  other: "Other",
};

/**
 * Submit a contact form - stores in database and sends notification email
 */
export const submit = action({
  args: {
    name: v.string(),
    email: v.string(),
    subject: v.union(
      v.literal("quote"),
      v.literal("coverage"),
      v.literal("claim"),
      v.literal("operator"),
      v.literal("existing"),
      v.literal("other")
    ),
    expedition: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Store the submission in the database
    const submissionId: any = await ctx.runMutation(
      internal.contact._insertSubmission,
      {
        ...args,
        status: "new" as const,
        emailSent: false,
        createdAt: now,
        updatedAt: now,
      }
    );

    // Create conversation in the "questions" space
    const subjectLabel = subjectLabels[args.subject] || args.subject;
    try {
      await ctx.runMutation(
        internal.admin.conversations._createConversationForContact,
        {
          contactSubmissionId: submissionId,
          name: args.name,
          email: args.email,
          subject: `${subjectLabel} - ${args.name}`,
          message: args.message,
          createdAt: now,
        },
      );
    } catch (convError) {
      console.error("Failed to create conversation for contact:", convError);
    }

    // Push notification to admin
    const isPushEnabled = await ctx.runQuery(
      internal.lib.notificationGate._shouldNotify,
      { category: "contact", channel: "push" },
    );
    if (isPushEnabled) {
      await ctx.scheduler.runAfter(0, internal.pushNotificationsNode._sendPushNotification, {
        title: "New Contact Submission",
        body: `${args.name} — ${subjectLabel}`,
        url: `/admin/inbox`,
        tag: "contact-form",
        category: "contact_form",
      });
    }

    // Send notification email via Resend
    const isEmailEnabled = await ctx.runQuery(
      internal.lib.notificationGate._shouldNotify,
      { category: "contact", channel: "email" },
    );
    let emailSent = false;
    const resendKey = process.env.AUTH_RESEND_KEY;

    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const subjectLabel = subjectLabels[args.subject] || args.subject;

        // Send notification to team
        const teamHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #0A2540; font-size: 24px; margin-bottom: 20px; border-bottom: 2px solid #00B4A0; padding-bottom: 10px;">
                New Contact Form Submission
              </h1>

              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 0; color: #718096; width: 120px;">Name:</td>
                  <td style="padding: 8px 0; color: #0A2540; font-weight: 600;">${args.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096;">Email:</td>
                  <td style="padding: 8px 0;">
                    <a href="mailto:${args.email}" style="color: #00B4A0;">${args.email}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096;">Subject:</td>
                  <td style="padding: 8px 0; color: #0A2540;">${subjectLabel}</td>
                </tr>
                ${args.expedition ? `
                <tr>
                  <td style="padding: 8px 0; color: #718096;">Expedition:</td>
                  <td style="padding: 8px 0; color: #0A2540;">${args.expedition}</td>
                </tr>
                ` : ""}
              </table>

              <div style="background: #F7FAFC; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <h3 style="color: #0A2540; font-size: 14px; margin: 0 0 8px 0;">Message:</h3>
                <p style="color: #4A5568; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${args.message}</p>
              </div>

              <p style="color: #A0AEC0; font-size: 12px; margin-top: 24px;">
                Reply directly to this email to respond to ${args.name}.
              </p>
            </div>
          `;
        const teamText = `
New Contact Form Submission

Name: ${args.name}
Email: ${args.email}
Subject: ${subjectLabel}
${args.expedition ? `Expedition: ${args.expedition}` : ""}

Message:
${args.message}

---
Reply to this email to respond to the customer.
          `.trim();

        // Team notification email (gated by preference)
        if (isEmailEnabled) {
          const { data: teamSendData } = await resend.emails.send({
            from: "Expedition Insure <noreply@expeditioninsure.com>",
            to: [ADMIN_EMAIL],
            replyTo: args.email,
            subject: emailSubject(`[Contact Form] ${subjectLabel} - ${args.name}`),
            html: teamHtml,
            text: teamText,
          });

          // Log team notification
          await ctx.runMutation(internal.lib.emailLogger.logSentEmail, {
            recipientEmail: ADMIN_EMAIL,
            to: [ADMIN_EMAIL],
            from: "Expedition Insure <noreply@expeditioninsure.com>",
            replyTo: args.email,
            subject: emailSubject(`[Contact Form] ${subjectLabel} - ${args.name}`),
            category: "contact_notification" as const,
            referenceId: submissionId,
            resendId: teamSendData?.id,
            htmlBody: teamHtml,
            textBody: teamText,
          });
        }

        // Send confirmation to customer
        const confirmHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #0A2540; font-size: 24px; margin-bottom: 20px;">
                Thanks for reaching out, ${args.name.split(" ")[0]}!
              </h1>

              <p style="color: #4A5568; font-size: 16px; line-height: 1.6;">
                We've received your message and our expedition insurance specialists will get back to you within 24 hours.
              </p>

              <div style="background: #F7FAFC; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="color: #718096; font-size: 14px; margin: 0 0 8px 0;">Your message:</p>
                <p style="color: #4A5568; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${args.message.substring(0, 200)}${args.message.length > 200 ? "..." : ""}</p>
              </div>

              <p style="color: #4A5568; font-size: 16px; line-height: 1.6;">
                In the meantime, you might find answers in our <a href="https://expedition.insure/faq" style="color: #00B4A0;">FAQ</a>.
              </p>

              <p style="color: #4A5568; font-size: 16px; line-height: 1.6; margin-top: 24px;">
                For emergencies while traveling, call our 24/7 line: <strong>1-800-555-0911</strong>
              </p>

              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />

              <p style="color: #A0AEC0; font-size: 12px;">
                Expedition Insure - Specialized Travel Insurance for Polar & Safari Adventures
              </p>
            </div>
          `;
        const confirmText = `
Thanks for reaching out, ${args.name.split(" ")[0]}!

We've received your message and our expedition insurance specialists will get back to you within 24 hours.

Your message:
${args.message.substring(0, 200)}${args.message.length > 200 ? "..." : ""}

In the meantime, you might find answers in our FAQ: https://expedition.insure/faq

For emergencies while traveling, call our 24/7 line: 1-800-555-0911

---
Expedition Insure - Specialized Travel Insurance for Polar & Safari Adventures
          `.trim();

        const { data: confirmSendData } = await resend.emails.send({
          from: "Expedition Insure <noreply@expeditioninsure.com>",
          to: devGuardRecipients([args.email]),
          subject: emailSubject("We received your message - Expedition Insure"),
          html: confirmHtml,
          text: confirmText,
        });

        // Log customer confirmation
        await ctx.runMutation(internal.lib.emailLogger.logSentEmail, {
          recipientEmail: args.email,
          to: [args.email],
          from: "Expedition Insure <noreply@expeditioninsure.com>",
          subject: emailSubject("We received your message - Expedition Insure"),
          category: "contact_confirmation" as const,
          referenceId: submissionId,
          resendId: confirmSendData?.id,
          htmlBody: confirmHtml,
          textBody: confirmText,
        });

        emailSent = true;
      } catch (error) {
        console.error("Failed to send contact form emails:", error);
        // Don't throw - we still saved the submission
      }
    }

    // Update the submission with email status
    await ctx.runMutation(
      internal.contact._updateEmailStatus,
      {
        id: submissionId,
        emailSent,
      }
    );

    return { success: true, id: submissionId };
  },
});

/**
 * Internal mutation to insert a contact submission
 */
export const _insertSubmission = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    subject: v.union(
      v.literal("quote"),
      v.literal("coverage"),
      v.literal("claim"),
      v.literal("operator"),
      v.literal("existing"),
      v.literal("other")
    ),
    expedition: v.optional(v.string()),
    message: v.string(),
    status: v.literal("new"),
    emailSent: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Resolve/create unified customer identity
    const customerId = await resolveOrCreateCustomer(ctx, args.email, args.name);
    return await ctx.db.insert("contactSubmissions", { ...args, customerId });
  },
});

/**
 * Internal mutation to update email sent status
 */
export const _updateEmailStatus = internalMutation({
  args: {
    id: v.id("contactSubmissions"),
    emailSent: v.boolean(),
  },
  handler: async (ctx, { id, emailSent }) => {
    await ctx.db.patch(id, { emailSent, updatedAt: Date.now() });
  },
});

/**
 * List all contact submissions (admin)
 */
export const list = adminQuery({
  args: {
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("read"),
        v.literal("replied"),
        v.literal("resolved")
      )
    ),
  },
  handler: async (ctx, { status }) => {
    if (status) {
      return await ctx.db
        .query("contactSubmissions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("contactSubmissions")
      .order("desc")
      .collect();
  },
});

/**
 * Update submission status (admin)
 */
export const updateStatus = adminMutation({
  args: {
    id: v.id("contactSubmissions"),
    status: v.union(
      v.literal("new"),
      v.literal("read"),
      v.literal("replied"),
      v.literal("resolved")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, notes }) => {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: Date.now(),
    };

    if (status === "replied") {
      updates.repliedAt = Date.now();
    } else if (status === "resolved") {
      updates.resolvedAt = Date.now();
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    await ctx.db.patch(id, updates);
  },
});
