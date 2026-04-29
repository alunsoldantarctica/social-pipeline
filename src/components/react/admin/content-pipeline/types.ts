import type { Doc } from "../../../../../convex/_generated/dataModel";

export type WorkflowStatus =
  | "research_in_progress"
  | "research_review"
  | "outline_in_progress"
  | "outline_review"
  | "draft_in_progress"
  | "draft_review"
  | "completed"
  | "rejected";

export type Workflow = Doc<"articleWorkflows">;

export function isInProgress(status: WorkflowStatus): boolean {
  return status.endsWith("_in_progress");
}

export function isPendingReview(status: WorkflowStatus): boolean {
  return status.endsWith("_review");
}

interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
}

export const STATUS_CONFIG: Record<WorkflowStatus, StatusConfig> = {
  research_in_progress: { label: "Researching", color: "text-blue-700", bgColor: "bg-blue-50" },
  research_review:      { label: "Research Review", color: "text-amber-700", bgColor: "bg-amber-50" },
  outline_in_progress:  { label: "Outlining", color: "text-blue-700", bgColor: "bg-blue-50" },
  outline_review:       { label: "Outline Review", color: "text-amber-700", bgColor: "bg-amber-50" },
  draft_in_progress:    { label: "Drafting", color: "text-blue-700", bgColor: "bg-blue-50" },
  draft_review:         { label: "Draft Review", color: "text-amber-700", bgColor: "bg-amber-50" },
  completed:            { label: "Completed", color: "text-green-700", bgColor: "bg-green-50" },
  rejected:             { label: "Rejected", color: "text-red-700", bgColor: "bg-red-50" },
};
