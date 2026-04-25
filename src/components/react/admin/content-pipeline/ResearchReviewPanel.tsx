import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Workflow } from './types';

export function ResearchReviewPanel({
  workflow,
  onApprove,
  onRevise,
  onReject,
}: {
  workflow: Workflow;
  onApprove: (selectedAngle: string) => void | Promise<void>;
  onRevise: (feedback: string) => void | Promise<void>;
  onReject: (reason: string) => void | Promise<void>;
}) {
  const research = workflow.researchOutput;
  const [selectedAngle, setSelectedAngle] = useState(research?.suggestedAngles[0] || '');
  const [feedback, setFeedback] = useState('');
  const [action, setAction] = useState<'approve' | 'revise' | 'reject' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!research) return <div className="text-slate-400">Research data not available</div>;

  const handleAction = async () => {
    setSubmitting(true);
    try {
      if (action === 'approve') await onApprove(selectedAngle);
      else if (action === 'revise') await onRevise(feedback);
      else if (action === 'reject') await onReject(feedback);
      setAction(null);
      setFeedback('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sources */}
      <div>
        <h3 className="text-lg font-medium text-white mb-3">Sources ({research.sources.length})</h3>
        <div className="space-y-2">
          {research.sources.map((source, i) => (
            <div key={i} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 flex items-center gap-1 mb-1"
              >
                {source.title}
                <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-sm text-slate-400">{source.summary}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div>
        <h3 className="text-lg font-medium text-white mb-3">Research Summary</h3>
        <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg prose prose-invert prose-sm max-w-none">
          <Markdown remarkPlugins={[remarkGfm]}>{research.summary}</Markdown>
        </div>
      </div>

      {/* Angle Selection */}
      <div>
        <h3 className="text-lg font-medium text-white mb-3">Suggested Angles</h3>
        <div className="space-y-2">
          {research.suggestedAngles.map((angle, i) => (
            <label
              key={i}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                selectedAngle === angle
                  ? 'bg-teal-600/20 border-teal-500'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              )}
            >
              <input
                type="radio"
                name="angle"
                value={angle}
                checked={selectedAngle === angle}
                onChange={(e) => setSelectedAngle(e.target.value)}
                className="mt-1"
              />
              <span className="text-slate-200">{angle}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      {action && (
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
          {action !== 'approve' && (
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
              onClick={() => setAction(null)}
              disabled={submitting}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAction}
              disabled={submitting || (action !== 'approve' && !feedback.trim())}
              className={cn(
                'px-4 py-2 rounded-lg text-white flex items-center gap-2',
                action === 'approve' ? 'bg-green-600 hover:bg-green-500' :
                action === 'revise' ? 'bg-yellow-600 hover:bg-yellow-500' :
                'bg-red-600 hover:bg-red-500',
                (submitting || (action !== 'approve' && !feedback.trim())) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Working…' : `Confirm ${action}`}
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
            Approve Research
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
