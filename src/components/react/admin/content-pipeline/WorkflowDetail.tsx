import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  FileText,
  Trash2,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { StatusBadge } from './StatusBadge';
import { StatusTimeline } from './StatusTimeline';
import { ResearchReviewPanel } from './ResearchReviewPanel';
import { OutlineReviewPanel } from './OutlineReviewPanel';
import { DraftReviewPanel } from './DraftReviewPanel';
import { WorkflowCostPanel } from './WorkflowCostPanel';

export function WorkflowDetail({
  workflowId,
  onBack,
}: {
  workflowId: Id<'articleWorkflows'>;
  onBack: () => void;
}) {
  const workflow = useQuery(api.admin.contentPipeline.getById, { id: workflowId });

  const approveResearch = useMutation(api.admin.contentPipeline.approveResearch);
  const reviseResearch = useMutation(api.admin.contentPipeline.reviseResearch);
  const rejectResearch = useMutation(api.admin.contentPipeline.rejectResearch);

  const approveOutline = useMutation(api.admin.contentPipeline.approveOutline);
  const reviseOutline = useMutation(api.admin.contentPipeline.reviseOutline);
  const rejectOutline = useMutation(api.admin.contentPipeline.rejectOutline);

  const approveDraft = useMutation(api.admin.contentPipeline.approveDraft);
  const reviseDraft = useMutation(api.admin.contentPipeline.reviseDraft);
  const rejectDraft = useMutation(api.admin.contentPipeline.rejectDraft);

  const retryWorkflow = useMutation(api.admin.contentPipeline.retryWorkflow);
  const deleteWorkflow = useMutation(api.admin.contentPipeline.deleteWorkflow);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  if (workflow === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="text-center p-8">
        <p className="text-slate-400">Workflow not found</p>
        <button onClick={onBack} className="mt-4 text-teal-400 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const renderStagePanel = () => {
    switch (workflow.status) {
      case 'research_in_progress':
        return (
          <div className="p-8 text-center">
            <Loader2 className="w-12 h-12 text-teal-500 animate-spin mx-auto mb-4" />
            <p className="text-slate-300">AI is researching your topic...</p>
            <p className="text-sm text-slate-500 mt-2">This may take a few minutes</p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={async () => {
                  setIsRetrying(true);
                  try { await retryWorkflow({ id: workflowId }); } finally { setIsRetrying(false); }
                }}
                disabled={isRetrying || isCancelling}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Restart
              </button>
              <button
                onClick={async () => {
                  setIsCancelling(true);
                  try { await deleteWorkflow({ id: workflowId }); onBack(); } finally { setIsCancelling(false); }
                }}
                disabled={isRetrying || isCancelling}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 disabled:opacity-50 text-red-400 rounded-lg transition-colors"
              >
                {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Cancel
              </button>
            </div>
          </div>
        );

      case 'research_review':
        return (
          <ResearchReviewPanel
            workflow={workflow}
            onApprove={(angle) => approveResearch({ id: workflowId, selectedAngle: angle })}
            onRevise={(fb) => reviseResearch({ id: workflowId, feedback: fb })}
            onReject={(reason) => rejectResearch({ id: workflowId, reason })}
          />
        );

      case 'outline_in_progress':
        return (
          <div className="p-8 text-center">
            <Loader2 className="w-12 h-12 text-teal-500 animate-spin mx-auto mb-4" />
            <p className="text-slate-300">AI is creating the outline...</p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={async () => {
                  setIsRetrying(true);
                  try { await retryWorkflow({ id: workflowId }); } finally { setIsRetrying(false); }
                }}
                disabled={isRetrying || isCancelling}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Restart
              </button>
              <button
                onClick={async () => {
                  setIsCancelling(true);
                  try { await deleteWorkflow({ id: workflowId }); onBack(); } finally { setIsCancelling(false); }
                }}
                disabled={isRetrying || isCancelling}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 disabled:opacity-50 text-red-400 rounded-lg transition-colors"
              >
                {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Cancel
              </button>
            </div>
          </div>
        );

      case 'outline_review':
        return (
          <OutlineReviewPanel
            workflow={workflow}
            onApprove={(edited) => approveOutline({ id: workflowId, editedOutline: edited })}
            onRevise={(fb) => reviseOutline({ id: workflowId, feedback: fb })}
            onReject={(reason) => rejectOutline({ id: workflowId, reason })}
          />
        );

      case 'draft_in_progress':
        return (
          <div className="p-8 text-center">
            <Loader2 className="w-12 h-12 text-teal-500 animate-spin mx-auto mb-4" />
            <p className="text-slate-300">AI is writing the draft...</p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={async () => {
                  setIsRetrying(true);
                  try { await retryWorkflow({ id: workflowId }); } finally { setIsRetrying(false); }
                }}
                disabled={isRetrying || isCancelling}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Restart
              </button>
              <button
                onClick={async () => {
                  setIsCancelling(true);
                  try { await deleteWorkflow({ id: workflowId }); onBack(); } finally { setIsCancelling(false); }
                }}
                disabled={isRetrying || isCancelling}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 disabled:opacity-50 text-red-400 rounded-lg transition-colors"
              >
                {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Cancel
              </button>
            </div>
          </div>
        );

      case 'draft_review':
        return (
          <DraftReviewPanel
            workflow={workflow}
            onApprove={(content, scheduledAt) => approveDraft({ id: workflowId, editedContent: content, scheduledPublishAt: scheduledAt })}
            onRevise={(fb) => reviseDraft({ id: workflowId, feedback: fb })}
            onReject={(reason) => rejectDraft({ id: workflowId, reason })}
          />
        );

      case 'completed':
        return (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-slate-300">Article published successfully!</p>
            {workflow.blogPostId && (
              <a
                href={`/admin/blog?edit=${workflow.blogPostId}`}
                className="mt-4 inline-flex items-center gap-2 text-teal-400 hover:underline"
              >
                <FileText className="w-4 h-4" />
                View in Blog Admin
              </a>
            )}
          </div>
        );

      case 'rejected':
        return (
          <div className="p-8 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-slate-300">This workflow was rejected</p>
            {workflow.feedbackHistory.length > 0 && (
              <p className="text-sm text-slate-500 mt-2">
                Reason: {workflow.feedbackHistory[workflow.feedbackHistory.length - 1].feedback}
              </p>
            )}
            <button
              onClick={async () => {
                setIsRetrying(true);
                try {
                  await retryWorkflow({ id: workflowId });
                } finally {
                  setIsRetrying(false);
                }
              }}
              disabled={isRetrying}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Retry from scratch
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="overflow-x-hidden">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-slate-400 hover:text-white mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to list
        </button>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-white break-words">{workflow.topic}</h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
              <StatusBadge status={workflow.status} />
              <span className="text-xs sm:text-sm text-slate-500">
                Created {new Date(workflow.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {workflow.keywords.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {workflow.keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-400">
                    {kw}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={async () => {
                if (confirm('Delete this workflow? This cannot be undone.')) {
                  await deleteWorkflow({ id: workflowId });
                  onBack();
                }
              }}
              className="p-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors"
              title="Delete workflow"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <StatusTimeline status={workflow.status} />

      {/* Cost panel — per-step model override + estimate vs actual */}
      <div className="my-4">
        <WorkflowCostPanel workflowId={workflowId} />
      </div>

      {/* Stage Panel */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 sm:p-6">
        {renderStagePanel()}
      </div>

      {/* Revision history */}
      {workflow.feedbackHistory.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-white mb-3">Feedback History</h3>
          <div className="space-y-2">
            {workflow.feedbackHistory.map((fb, i) => (
              <div key={i} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs',
                    fb.action === 'approve' ? 'bg-green-500/20 text-green-400' :
                    fb.action === 'revise' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  )}>
                    {fb.action}
                  </span>
                  <span className="text-slate-500">{fb.stage}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-500">
                    {new Date(fb.timestamp).toLocaleString()}
                  </span>
                </div>
                {fb.feedback && (
                  <p className="text-sm text-slate-300 mt-2">{fb.feedback}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
