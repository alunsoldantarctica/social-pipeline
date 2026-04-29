export { StatusBadge } from './StatusBadge';
export { StatusTimeline } from './StatusTimeline';
export { WorkflowList } from './WorkflowList';
export { WorkflowDetail } from './WorkflowDetail';
export { WorkflowCostPanel } from './WorkflowCostPanel';
export { CreateWorkflowModal } from './CreateWorkflowModal';
export { ResearchReviewPanel } from './ResearchReviewPanel';
export { OutlineReviewPanel } from './OutlineReviewPanel';
export { DraftReviewPanel } from './DraftReviewPanel';

export type FilterStatus = "all" | "pending_review" | "in_progress" | "completed" | "failed";

export function isPendingReview(status: string): boolean {
  return status.endsWith("_review");
}

export function isInProgress(status: string): boolean {
  return status.endsWith("_in_progress");
}
