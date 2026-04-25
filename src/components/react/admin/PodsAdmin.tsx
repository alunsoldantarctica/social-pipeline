/**
 * Pods Admin
 *
 * Browse content pods + their draft briefs. From here, an admin can "Start
 * Research" on any brief to kick off the existing research → outline → draft
 * pipeline. The created workflow inherits the pod association so it shows
 * up grouped in the Pipeline tab.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { ConvexClientProvider } from '../ConvexClientProvider';
import {
  Layers,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Tag,
  Pencil,
  Eye,
  X as XIcon,
} from 'lucide-react';

type BriefStatus = 'generated' | 'approved' | 'rejected' | 'sent_to_pipeline' | 'completed';

type Brief = {
  _id: Id<'contentBriefs'>;
  title: string;
  topic: string;
  keywords: string[];
  suggestedAngle: string;
  status: BriefStatus;
  articleWorkflowId?: Id<'articleWorkflows'>;
  blogPostId?: Id<'blogPosts'>;
  blogPostSlug?: string | null;
  podId?: Id<'contentPods'>;
  podName?: string | null;
  podSlug?: string | null;
};

const statusColor: Record<BriefStatus, string> = {
  generated: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/40',
  sent_to_pipeline: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};

const statusLabel: Record<BriefStatus, string> = {
  generated: 'Draft',
  approved: 'Approved',
  rejected: 'Rejected',
  sent_to_pipeline: 'In Pipeline',
  completed: 'Completed',
};

// Status-weighted sort: actionable first, completed collapsed, rejected hidden
const STATUS_ORDER: Record<BriefStatus, number> = {
  sent_to_pipeline: 0,
  approved: 1,
  generated: 2,
  completed: 3,
  rejected: 4,
};

type PodEditable = {
  _id: Id<'contentPods'>;
  name: string;
  slug: string;
  description: string;
  pillarKeyword: string;
  pillarIntroContent?: string;
  isActive: boolean;
};

function PodsAdminInner() {
  const pods = useQuery(api.admin.contentPods.listWithCounts, {});
  const briefs = useQuery(api.admin.contentPods.listBriefs, {}) as Brief[] | undefined;
  const triggerResearch = useMutation(api.admin.contentPipeline.triggerResearchFromBrief);
  const rejectBrief = useMutation(api.admin.contentPods.rejectBrief);
  const updatePod = useMutation(api.admin.contentPods.update);

  const [expandedPodId, setExpandedPodId] = useState<Id<'contentPods'> | null>(null);
  const [triggeringId, setTriggeringId] = useState<Id<'contentBriefs'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingPod, setEditingPod] = useState<PodEditable | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showRejectedPods, setShowRejectedPods] = useState<Record<string, boolean>>({});
  const [showCompletedPods, setShowCompletedPods] = useState<Record<string, boolean>>({});

  const briefsByPod = useMemo(() => {
    const map = new Map<string, Brief[]>();
    for (const b of briefs ?? []) {
      const key = b.podId ? String(b.podId) : 'unpodded';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [briefs]);

  const handleStartResearch = async (briefId: Id<'contentBriefs'>) => {
    setError(null);
    setTriggeringId(briefId);
    try {
      await triggerResearch({ briefId });
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setTriggeringId(null);
    }
  };

  const handleReject = async (briefId: Id<'contentBriefs'>) => {
    try {
      await rejectBrief({ id: briefId });
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  if (pods === undefined || briefs === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {pods.length === 0 && (
        <div className="text-center p-8 text-slate-400">
          No content pods yet.{' '}
          <code className="text-teal-400">pnpx convex run admin/contentPods:seedCorePods</code>
        </div>
      )}

      {pods.map((pod) => {
        const allBriefs = briefsByPod.get(String(pod._id)) ?? [];
        const podBriefs = [...allBriefs].sort(
          (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b._id.localeCompare(a._id),
        );
        const activeBriefs = podBriefs.filter(
          (b) => b.status !== 'completed' && b.status !== 'rejected',
        );
        const completedBriefs = podBriefs.filter((b) => b.status === 'completed');
        const rejectedBriefs = podBriefs.filter((b) => b.status === 'rejected');
        const pending = podBriefs.filter((b) => b.status === 'generated').length;
        const inPipeline = podBriefs.filter((b) => b.status === 'sent_to_pipeline').length;
        const isExpanded = expandedPodId === pod._id;
        const podKey = String(pod._id);
        const showRejected = !!showRejectedPods[podKey];
        const showCompleted = !!showCompletedPods[podKey];

        return (
          <div
            key={pod._id}
            className="bg-slate-900/50 border border-slate-700 rounded-lg"
          >
            <button
              onClick={() => setExpandedPodId(isExpanded ? null : pod._id)}
              className="w-full p-4 text-left hover:bg-slate-800/40 transition-colors rounded-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <h3 className="font-semibold text-white">{pod.name}</h3>
                    <span className="text-xs text-slate-500">· pillar: {pod.pillarKeyword}</span>
                  </div>
                  <p className="text-sm text-slate-400 line-clamp-2">{pod.description}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                    <span>
                      {podBriefs.length} briefs · {pending} draft · {inPipeline} in pipeline ·{' '}
                      {pod.completedCount ?? 0} published
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {pod.isActive ? 'active' : 'inactive'}
                  </span>
                  <div className="flex items-center gap-1">
                    <a
                      href={`/hub/${pod.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      <Eye className="w-3 h-3" />
                      Preview hub
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPod({
                          _id: pod._id,
                          name: pod.name,
                          slug: pod.slug,
                          description: pod.description,
                          pillarKeyword: pod.pillarKeyword,
                          pillarIntroContent: pod.pillarIntroContent ?? '',
                          isActive: pod.isActive ?? true,
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-800 p-4 space-y-2">
                {podBriefs.length === 0 ? (
                  <p className="text-sm text-slate-500">No briefs in this pod yet.</p>
                ) : (
                  <>
                    {activeBriefs.map((b) => (
                      <BriefRow
                        key={b._id}
                        b={b}
                        triggeringId={triggeringId}
                        onStartResearch={handleStartResearch}
                        onReject={handleReject}
                      />
                    ))}
                    {completedBriefs.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setShowCompletedPods((s) => ({ ...s, [podKey]: !s[podKey] }))
                          }
                          className="text-xs text-slate-400 hover:text-slate-200 py-1"
                        >
                          {showCompleted ? '▾' : '▸'} Completed ({completedBriefs.length})
                        </button>
                        {showCompleted && (
                          <div className="space-y-2 mt-2">
                            {completedBriefs.map((b) => (
                              <BriefRow
                                key={b._id}
                                b={b}
                                triggeringId={triggeringId}
                                onStartResearch={handleStartResearch}
                                onReject={handleReject}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {rejectedBriefs.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setShowRejectedPods((s) => ({ ...s, [podKey]: !s[podKey] }))
                          }
                          className="text-xs text-slate-500 hover:text-slate-300 py-1"
                        >
                          {showRejected ? '▾' : '▸'} Show rejected ({rejectedBriefs.length})
                        </button>
                        {showRejected && (
                          <div className="space-y-2 mt-2 opacity-70">
                            {rejectedBriefs.map((b) => (
                              <BriefRow
                                key={b._id}
                                b={b}
                                triggeringId={triggeringId}
                                onStartResearch={handleStartResearch}
                                onReject={handleReject}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {editingPod && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto p-6"
          onClick={() => !savingEdit && setEditingPod(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Edit pod: {editingPod.name}</h3>
              <button
                type="button"
                onClick={() => !savingEdit && setEditingPod(null)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editingPod) return;
                setSavingEdit(true);
                setError(null);
                try {
                  await updatePod({
                    id: editingPod._id,
                    patch: {
                      name: editingPod.name,
                      slug: editingPod.slug,
                      description: editingPod.description,
                      pillarKeyword: editingPod.pillarKeyword,
                      pillarIntroContent: editingPod.pillarIntroContent || undefined,
                      isActive: editingPod.isActive,
                    },
                  });
                  setEditingPod(null);
                } catch (err: any) {
                  setError(err?.message ?? String(err));
                } finally {
                  setSavingEdit(false);
                }
              }}
              className="p-4 space-y-3 text-sm"
            >
              <Field label="Name">
                <input
                  type="text"
                  value={editingPod.name}
                  onChange={(e) => setEditingPod({ ...editingPod, name: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Slug">
                <input
                  type="text"
                  value={editingPod.slug}
                  onChange={(e) => setEditingPod({ ...editingPod, slug: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Pillar keyword">
                <input
                  type="text"
                  value={editingPod.pillarKeyword}
                  onChange={(e) => setEditingPod({ ...editingPod, pillarKeyword: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={editingPod.description}
                  onChange={(e) => setEditingPod({ ...editingPod, description: e.target.value })}
                  rows={3}
                  className={inputClass}
                />
              </Field>
              <Field label="Pillar intro content (markdown, 300–500 words)">
                <textarea
                  value={editingPod.pillarIntroContent ?? ''}
                  onChange={(e) => setEditingPod({ ...editingPod, pillarIntroContent: e.target.value })}
                  rows={10}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder="## What this hub covers\n\nMarkdown rendered as the intro section on /hub/[slug]…"
                />
              </Field>
              <Field label="Active">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPod.isActive}
                    onChange={(e) => setEditingPod({ ...editingPod, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-slate-300 text-sm">Pod is active</span>
                </label>
              </Field>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPod(null)}
                  disabled={savingEdit}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded bg-teal-600 hover:bg-teal-500 text-white text-sm disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefRow({
  b,
  triggeringId,
  onStartResearch,
  onReject,
}: {
  b: Brief;
  triggeringId: Id<'contentBriefs'> | null;
  onStartResearch: (id: Id<'contentBriefs'>) => void;
  onReject: (id: Id<'contentBriefs'>) => void;
}) {
  return (
    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-white">{b.title}</h4>
            <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor[b.status]}`}>
              {statusLabel[b.status]}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">{b.suggestedAngle}</p>
          <div className="flex items-center flex-wrap gap-1 mt-2">
            {b.keywords.slice(0, 5).map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300"
              >
                <Tag className="w-3 h-3" />
                {kw}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {b.status === 'completed' && b.blogPostSlug ? (
            <a
              href={`/blog/${b.blogPostSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              View post
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : b.status === 'sent_to_pipeline' && b.articleWorkflowId ? (
            <a
              href={`/admin/content?tab=pipeline#workflow=${b.articleWorkflowId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              View Workflow
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : b.status === 'rejected' ? null : (
            <button
              onClick={() => onStartResearch(b._id)}
              disabled={triggeringId === b._id}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50"
            >
              {triggeringId === b._id ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  Start Research
                </>
              )}
            </button>
          )}
          {b.status === 'generated' && (
            <button
              onClick={() => onReject(b._id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <XCircle className="w-3 h-3" />
              Reject
            </button>
          )}
          {b.status === 'rejected' && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-red-500/10 text-red-400">
              <XCircle className="w-3 h-3" />
              Rejected
            </span>
          )}
          {b.status === 'approved' && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              Approved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 rounded bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-teal-500';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

export { PodsAdminInner as PodsAdminContent };

export default function PodsAdmin() {
  return (
    <ConvexClientProvider>
      <PodsAdminInner />
    </ConvexClientProvider>
  );
}
