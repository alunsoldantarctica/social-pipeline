import { defineEvent } from "@convex-dev/workflow";
import { v } from "convex/values";

const approvalValidator = v.object({
  approved: v.boolean(),
  feedback: v.optional(v.string()),
});

export const researchApprovalEvent = defineEvent({
  name: "researchApproval",
  validator: approvalValidator,
});

export const outlineApprovalEvent = defineEvent({
  name: "outlineApproval",
  validator: approvalValidator,
});

export const draftApprovalEvent = defineEvent({
  name: "draftApproval",
  validator: approvalValidator,
});
