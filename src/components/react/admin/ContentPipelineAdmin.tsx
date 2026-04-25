/**
 * Content Pipeline Admin
 *
 * Manages AI-assisted article workflows with three stages:
 * 1. Research - Sources, summaries, suggested angles
 * 2. Outline - Title, sections, structure
 * 3. Draft - Full article with markdown editing
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { ConvexClientProvider } from '../ConvexClientProvider';
import { cn } from '../../../lib/utils';
import {
  Plus,
  Settings,
} from 'lucide-react';

import {
  type FilterStatus,
  isPendingReview,
  isInProgress,
  WorkflowDetail,
  WorkflowList,
  CreateWorkflowModal,
} from './content-pipeline';

// ===== MAIN COMPONENT =====

function ContentPipelineAdminInner() {
  // Read workflow ID from URL hash on mount (e.g. #workflow=abc123)
  const hashId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.hash.match(/workflow=([^&]+)/);
    return match ? match[1] as Id<'articleWorkflows'> : null;
  }, []);

  const [view, setView] = useState<'list' | 'detail'>(hashId ? 'detail' : 'list');
  const [selectedId, setSelectedId] = useState<Id<'articleWorkflows'> | null>(hashId);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showCreate, setShowCreate] = useState(false);

  // Sync URL hash with selected workflow.
  // Use replaceState (not window.location.hash) to avoid triggering popstate,
  // which would cause useTabParam to re-read the URL and reset the active tab.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId && view === 'detail') {
      url.hash = `workflow=${selectedId}`;
      history.replaceState(null, '', url.toString());
    } else if (view === 'list') {
      // Clear hash without scrolling, preserve query params (?tab=pipeline)
      url.hash = '';
      history.replaceState(null, '', url.pathname + url.search);
    }
  }, [selectedId, view]);

  const pendingCount = useQuery(api.admin.contentPipeline.getPendingCount, {});
  const workflows = useQuery(api.admin.contentPipeline.list, {});
  const createWorkflow = useMutation(api.admin.contentPipeline.create);

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    if (!workflows) return undefined;

    return workflows.filter((wf) => {
      switch (filter) {
        case 'pending':
          return isPendingReview(wf.status);
        case 'in_progress':
          return isInProgress(wf.status);
        case 'completed':
          return wf.status === 'completed';
        case 'rejected':
          return wf.status === 'rejected';
        default:
          return true;
      }
    });
  }, [workflows, filter]);

  const handleSelect = (id: Id<'articleWorkflows'>) => {
    setSelectedId(id);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedId(null);
  };

  const handleCreate = async (data: { topic: string; keywords: string[]; targetAudience: string }) => {
    const id = await createWorkflow(data);
    setSelectedId(id);
    setView('detail');
  };

  if (view === 'detail' && selectedId) {
    return <WorkflowDetail workflowId={selectedId} onBack={handleBack} />;
  }

  return (
    <div className="overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors',
              filter === 'all' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={cn(
              'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors flex items-center gap-1 sm:gap-2',
              filter === 'pending' ? 'bg-yellow-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            )}
          >
            <span className="hidden xs:inline">Pending</span> Review
            {pendingCount !== undefined && pendingCount > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500/30 rounded-full text-xs">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('in_progress')}
            className={cn(
              'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors',
              filter === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            )}
          >
            In Progress
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={cn(
              'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors',
              filter === 'completed' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            )}
          >
            Completed
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={cn(
              'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors',
              filter === 'rejected' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            )}
          >
            Rejected
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center justify-center gap-2 transition-colors flex-1 sm:flex-initial"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
          <a
            href="/admin/settings"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="AI Model Settings"
          >
            <Settings className="w-5 h-5" />
          </a>
        </div>
      </div>

      {/* List */}
      <WorkflowList
        workflows={filteredWorkflows}
        isLoading={workflows === undefined}
        onSelect={handleSelect}
      />

      {/* Create Modal */}
      <CreateWorkflowModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

// ===== EXPORT WITH PROVIDER =====

export { ContentPipelineAdminInner as ContentPipelineAdminContent };

export default function ContentPipelineAdmin() {
  return (
    <ConvexClientProvider>
      <ContentPipelineAdminInner />
    </ConvexClientProvider>
  );
}
