import { useState } from 'react';
import {
  Plus,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  Edit3,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { type Workflow } from './types';

export function OutlineReviewPanel({
  workflow,
  onApprove,
  onRevise,
  onReject,
}: {
  workflow: Workflow;
  onApprove: (editedOutline?: Workflow['outlineOutput']) => void | Promise<void>;
  onRevise: (feedback: string) => void | Promise<void>;
  onReject: (reason: string) => void | Promise<void>;
}) {
  const outline = workflow.outlineOutput;
  const [feedback, setFeedback] = useState('');
  const [action, setAction] = useState<'approve' | 'revise' | 'reject' | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Editable state — deep clone from outline
  const [editedTitle, setEditedTitle] = useState(outline?.title ?? '');
  const [editedWordCount, setEditedWordCount] = useState(outline?.targetWordCount ?? 2000);
  const [editedSections, setEditedSections] = useState<
    Array<{ heading: string; keyPoints: string[]; subsections?: Array<{ heading: string; keyPoints: string[] }> }>
  >(() => outline?.sections.map(s => ({ ...s, keyPoints: [...s.keyPoints], subsections: s.subsections?.map(sub => ({ ...sub, keyPoints: [...sub.keyPoints] })) })) ?? []);

  if (!outline) return <div className="text-slate-400">Outline data not available</div>;

  const hasEdits =
    editedTitle !== outline.title ||
    editedWordCount !== outline.targetWordCount ||
    JSON.stringify(editedSections) !== JSON.stringify(outline.sections);

  const updateSectionHeading = (i: number, heading: string) => {
    setEditedSections(prev => prev.map((s, idx) => idx === i ? { ...s, heading } : s));
  };
  const updateKeyPoint = (sectionIdx: number, pointIdx: number, value: string) => {
    setEditedSections(prev => prev.map((s, i) => i === sectionIdx ? { ...s, keyPoints: s.keyPoints.map((p, j) => j === pointIdx ? value : p) } : s));
  };
  const addKeyPoint = (sectionIdx: number) => {
    setEditedSections(prev => prev.map((s, i) => i === sectionIdx ? { ...s, keyPoints: [...s.keyPoints, ''] } : s));
  };
  const removeKeyPoint = (sectionIdx: number, pointIdx: number) => {
    setEditedSections(prev => prev.map((s, i) => i === sectionIdx ? { ...s, keyPoints: s.keyPoints.filter((_, j) => j !== pointIdx) } : s));
  };

  const handleAction = async () => {
    setSubmitting(true);
    try {
      if (action === 'approve') {
        await onApprove(hasEdits ? { title: editedTitle, sections: editedSections, targetWordCount: editedWordCount } : undefined);
      } else if (action === 'revise') await onRevise(feedback);
      else if (action === 'reject') await onReject(feedback);
      setAction(null);
      setFeedback('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
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

      {editMode ? (
        /* ===== EDIT MODE ===== */
        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Article Title</label>
            <input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {/* Word Count */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Target Word Count</label>
            <input
              type="number"
              value={editedWordCount}
              onChange={(e) => setEditedWordCount(parseInt(e.target.value) || 0)}
              className="w-32 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {/* Sections */}
          <div>
            <h3 className="text-lg font-medium text-white mb-3">Sections</h3>
            <div className="space-y-4">
              {editedSections.map((section, i) => (
                <div key={i} className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg space-y-3">
                  <input
                    value={section.heading}
                    onChange={(e) => updateSectionHeading(i, e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white font-medium focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Section heading"
                  />
                  <div className="space-y-2 ml-2">
                    {section.keyPoints.map((point, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <span className="text-teal-400 text-sm">•</span>
                        <input
                          value={point}
                          onChange={(e) => updateKeyPoint(i, j, e.target.value)}
                          className="flex-1 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:ring-1 focus:ring-teal-500 focus:border-transparent"
                          placeholder="Key point"
                        />
                        <button
                          onClick={() => removeKeyPoint(i, j)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          title="Remove point"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addKeyPoint(i)}
                      className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 mt-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add point
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ===== PREVIEW MODE ===== */
        <div className="space-y-6">
          {/* Title */}
          <div>
            <h3 className="text-lg font-medium text-white mb-2">Article Title</h3>
            <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
              <h2 className="text-xl font-semibold text-teal-400">{hasEdits ? editedTitle : outline.title}</h2>
            </div>
          </div>

          {/* Word Count */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">Target word count:</span>
            <span className="px-3 py-1 bg-slate-800 rounded-full text-sm text-white">
              {(hasEdits ? editedWordCount : outline.targetWordCount).toLocaleString()} words
            </span>
          </div>

          {/* Sections */}
          <div>
            <h3 className="text-lg font-medium text-white mb-3">Outline Structure</h3>
            <div className="space-y-4">
              {(hasEdits ? editedSections : outline.sections).map((section, i) => (
                <div key={i} className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <h4 className="font-medium text-white mb-2">{section.heading}</h4>
                  <ul className="space-y-1 ml-4">
                    {section.keyPoints.map((point, j) => (
                      <li key={j} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-teal-400 mt-1">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                  {section.subsections && section.subsections.length > 0 && (
                    <div className="mt-3 ml-4 space-y-3 border-l-2 border-slate-700 pl-4">
                      {section.subsections.map((sub, k) => (
                        <div key={k}>
                          <h5 className="text-sm font-medium text-slate-200 mb-1">{sub.heading}</h5>
                          <ul className="space-y-1">
                            {sub.keyPoints.map((point, l) => (
                              <li key={l} className="text-xs text-slate-400 flex items-start gap-2">
                                <span className="text-slate-500">-</span>
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasEdits && (
        <div className="flex items-center gap-2 text-sm text-yellow-400">
          <AlertCircle className="w-4 h-4" />
          You have unsaved edits. These will be included when you approve.
        </div>
      )}

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
            {hasEdits ? 'Approve with Edits' : 'Approve Outline'}
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
