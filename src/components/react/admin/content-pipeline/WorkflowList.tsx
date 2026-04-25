import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  ChevronLeft,
  Loader2,
  FileText,
  Layers,
} from 'lucide-react';
import { type Workflow } from './types';
import { StatusBadge } from './StatusBadge';

export function WorkflowList({
  workflows,
  isLoading,
  onSelect,
}: {
  workflows: Workflow[] | undefined;
  isLoading: boolean;
  onSelect: (id: Id<'articleWorkflows'>) => void;
}) {
  const pods = useQuery(api.admin.contentPods.list, {});
  const podMap = new Map((pods ?? []).map((p) => [p._id, p]));

  if (isLoading || workflows === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="text-center p-8">
        <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">No workflows found</p>
        <p className="text-sm text-slate-500 mt-1">Create one to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {workflows.map((wf) => {
        const pod = wf.podId ? podMap.get(wf.podId) : undefined;
        return (
          <button
            key={wf._id}
            onClick={() => onSelect(wf._id)}
            className="w-full p-4 bg-slate-900/50 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors text-left"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-white truncate">{wf.topic}</h3>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                  <StatusBadge status={wf.status} />
                  {pod && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      title={pod.description}
                    >
                      <Layers className="w-3 h-3" />
                      {pod.name}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {new Date(wf.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-slate-500 rotate-180" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
