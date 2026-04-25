import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  Edit3,
  AlertCircle,
  CalendarClock,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Workflow } from './types';

export function DraftReviewPanel({
  workflow,
  onApprove,
  onRevise,
  onReject,
}: {
  workflow: Workflow;
  onApprove: (editedContent?: string, scheduledPublishAt?: number) => void | Promise<void>;
  onRevise: (feedback: string) => void | Promise<void>;
  onReject: (reason: string) => void | Promise<void>;
}) {
  const draft = workflow.draftOutput;
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState(draft?.content || '');
  const [feedback, setFeedback] = useState('');
  const [action, setAction] = useState<'approve' | 'schedule' | 'revise' | 'reject' | null>(null);
  const [scheduleDatetime, setScheduleDatetime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!draft) return <div className="text-slate-400">Draft data not available</div>;

  const hasEdits = editedContent !== draft.content;
  const readTime = draft.estimatedReadTime || Math.ceil(editedContent.split(/\s+/).length / 200);

  const handleAction = async () => {
    setSubmitting(true);
    try {
      if (action === 'approve') {
        await onApprove(hasEdits ? editedContent : undefined);
      } else if (action === 'schedule') {
        const scheduledAt = new Date(scheduleDatetime).getTime();
        if (!scheduleDatetime || isNaN(scheduledAt) || scheduledAt <= Date.now()) return;
        await onApprove(hasEdits ? editedContent : undefined, scheduledAt);
      } else if (action === 'revise') {
        await onRevise(feedback);
      } else if (action === 'reject') {
        await onReject(feedback);
      }
      setAction(null);
      setFeedback('');
      setScheduleDatetime('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Meta info */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="px-3 sm:px-4 py-2 bg-slate-800 rounded-lg flex-shrink-0">
          <span className="text-xs text-slate-400 block">Read Time</span>
          <span className="text-white">{readTime} min</span>
        </div>
        <div className="flex-1 px-3 sm:px-4 py-2 bg-slate-800 rounded-lg min-w-0">
          <span className="text-xs text-slate-400 block">Meta Description</span>
          <span className="text-xs sm:text-sm text-slate-200 break-words">{draft.metaDescription}</span>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 sm:gap-2 border-b border-slate-700 pb-2">
        <button
          onClick={() => setEditMode(false)}
          className={cn(
            'px-3 sm:px-4 py-2 rounded-t-lg flex items-center gap-1.5 sm:gap-2 transition-colors text-sm',
            !editMode ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
          )}
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>
        <button
          onClick={() => setEditMode(true)}
          className={cn(
            'px-3 sm:px-4 py-2 rounded-t-lg flex items-center gap-1.5 sm:gap-2 transition-colors text-sm',
            editMode ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
          )}
        >
          <Edit3 className="w-4 h-4" />
          Edit
          {hasEdits && <span className="w-2 h-2 bg-yellow-500 rounded-full" />}
        </button>
      </div>

      {/* Content */}
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        {editMode ? (
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full h-[300px] sm:h-[500px] p-3 sm:p-4 bg-slate-900 text-slate-200 font-mono text-xs sm:text-sm resize-none focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <div className="p-4 sm:p-6 bg-slate-900 h-[300px] sm:h-[500px] overflow-auto text-sm sm:text-base prose prose-invert max-w-none prose-headings:text-white prose-a:text-teal-400">
            <Markdown remarkPlugins={[remarkGfm]}>{editedContent}</Markdown>
          </div>
        )}
      </div>

      {hasEdits && (
        <div className="flex items-center gap-2 text-sm text-yellow-400">
          <AlertCircle className="w-4 h-4" />
          You have unsaved edits. These will be included when you approve.
        </div>
      )}

      {/* Action Buttons */}
      {action && (
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
          {action === 'schedule' && (
            <div className="mb-3">
              <label className="block text-sm text-slate-400 mb-1">Publish date & time</label>
              <input
                type="datetime-local"
                value={scheduleDatetime}
                onChange={(e) => setScheduleDatetime(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full sm:w-auto px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
              />
            </div>
          )}
          {(action === 'revise' || action === 'reject') && (
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={action === 'revise' ? 'What should be revised?' : 'Reason for rejection'}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 mb-3"
              rows={3}
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setAction(null); setScheduleDatetime(''); }}
              disabled={submitting}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAction}
              disabled={
                submitting ||
                (action === 'schedule' && (!scheduleDatetime || new Date(scheduleDatetime).getTime() <= Date.now())) ||
                ((action === 'revise' || action === 'reject') && !feedback.trim())
              }
              className={cn(
                'px-4 py-2 rounded-lg text-white flex items-center gap-2',
                (action === 'approve' || action === 'schedule') ? 'bg-green-600 hover:bg-green-500' :
                action === 'revise' ? 'bg-yellow-600 hover:bg-yellow-500' :
                'bg-red-600 hover:bg-red-500',
                (submitting ||
                  (action === 'schedule' && !scheduleDatetime) ||
                  ((action === 'revise' || action === 'reject') && !feedback.trim())) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Working…' : action === 'schedule' ? 'Confirm Schedule' : `Confirm ${action}`}
            </button>
          </div>
        </div>
      )}

      {!action && (
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={() => setAction('approve')}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <CheckCircle2 className="w-4 h-4" />
            {hasEdits ? 'Approve with Edits' : 'Approve Now'}
          </button>
          <button
            onClick={() => setAction('schedule')}
            className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <CalendarClock className="w-4 h-4" />
            Schedule for Later
          </button>
          <button
            onClick={() => setAction('revise')}
            className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <RefreshCw className="w-4 h-4" />
            Request Revision
          </button>
          <button
            onClick={() => setAction('reject')}
            className="sm:flex-none px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
