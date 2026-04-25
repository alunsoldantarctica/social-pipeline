import { useState } from 'react';
import {
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Shield,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { cn } from '../../../lib/utils';
import { ConvexClientProvider } from '../ConvexClientProvider';
import { SignInButtons } from '../SignInButtons';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';

type Rule = Doc<'editorialRules'>;
type Category = Rule['category'];

const CATEGORIES: Array<{ value: Category; label: string; color: string }> = [
  { value: 'commercial', label: 'Commercial', color: 'bg-teal-900/40 text-teal-300 border-teal-800' },
  { value: 'tone', label: 'Tone', color: 'bg-purple-900/40 text-purple-300 border-purple-800' },
  { value: 'legal', label: 'Legal', color: 'bg-amber-900/40 text-amber-300 border-amber-800' },
  { value: 'structure', label: 'Structure', color: 'bg-blue-900/40 text-blue-300 border-blue-800' },
];

const categoryMeta = (c: Category) => CATEGORIES.find((x) => x.value === c)!;

function EditorialRulesInner() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const rules = useQuery(api.admin.editorialRules.list);

  const createRule = useMutation(api.admin.editorialRules.create);
  const updateRule = useMutation(api.admin.editorialRules.update);
  const removeRule = useMutation(api.admin.editorialRules.remove);
  const toggleActive = useMutation(api.admin.editorialRules.toggleActive);
  const reorder = useMutation(api.admin.editorialRules.reorder);
  const seed = useMutation(api.admin.editorialRules.seed);

  const [editingId, setEditingId] = useState<Id<'editorialRules'> | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; body: string; category: Category }>({
    title: '',
    body: '',
    category: 'commercial',
  });
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<{ title: string; body: string; category: Category }>({
    title: '',
    body: '',
    category: 'commercial',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flashError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  };
  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <Shield className="w-12 h-12 text-teal-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white">Sign In Required</h2>
          </div>
          <SignInButtons darkMode={true} onSuccess={() => window.location.reload()} />
        </div>
      </div>
    );
  }

  const beginEdit = (rule: Rule) => {
    setEditingId(rule._id);
    setEditDraft({ title: rule.title, body: rule.body, category: rule.category });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: Id<'editorialRules'>) => {
    if (!editDraft.title.trim() || !editDraft.body.trim()) {
      flashError('Title and body are required');
      return;
    }
    setBusy(true);
    try {
      await updateRule({ id, patch: editDraft });
      flashSuccess('Rule updated');
      setEditingId(null);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to update rule');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!newDraft.title.trim() || !newDraft.body.trim()) {
      flashError('Title and body are required');
      return;
    }
    setBusy(true);
    try {
      await createRule(newDraft);
      flashSuccess('Rule added');
      setNewDraft({ title: '', body: '', category: 'commercial' });
      setAdding(false);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to create rule');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (rule: Rule) => {
    if (!window.confirm(`Delete rule "${rule.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await removeRule({ id: rule._id });
      flashSuccess('Rule deleted');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to delete rule');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (rule: Rule) => {
    try {
      await toggleActive({ id: rule._id });
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to toggle rule');
    }
  };

  const handleReorder = async (id: Id<'editorialRules'>, direction: 'up' | 'down') => {
    try {
      await reorder({ id, direction });
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to reorder rule');
    }
  };

  const handleSeed = async () => {
    setBusy(true);
    try {
      const result = await seed();
      flashSuccess(`Seed: ${result.inserted} inserted, ${result.skipped} skipped`);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to seed rules');
    } finally {
      setBusy(false);
    }
  };

  const activeCount = rules?.filter((r) => r.isActive).length ?? 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-900/30 border border-green-800 rounded-lg text-green-300">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-500" />
            Editorial Rules ({activeCount} active / {rules?.length ?? 0} total)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Injected as system prompt into every content-pipeline agent (research, outline, draft).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {rules && rules.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              Seed defaults
            </button>
          )}
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Rule</span>
          </button>
        </div>
      </div>

      {adding && (
        <div className="bg-slate-900 border border-teal-700 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">New rule</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <select
              value={newDraft.category}
              onChange={(e) => setNewDraft({ ...newDraft, category: e.target.value as Category })}
              className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Title (e.g. 'Never link to competitor marketplaces')"
              value={newDraft.title}
              onChange={(e) => setNewDraft({ ...newDraft, title: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-white placeholder:text-slate-500"
            />
          </div>
          <textarea
            placeholder="Full rule text (injected into every prompt)"
            value={newDraft.body}
            onChange={(e) => setNewDraft({ ...newDraft, body: e.target.value })}
            rows={4}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white placeholder:text-slate-500 resize-y"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => {
                setAdding(false);
                setNewDraft({ title: '', body: '', category: 'commercial' });
              }}
              className="px-3 py-2 text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {rules === undefined && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
          </div>
        )}

        {rules && rules.length === 0 && !adding && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-400">
            No rules yet. Click <strong>Seed defaults</strong> to load the starter set.
          </div>
        )}

        {rules?.map((rule, idx) => {
          const meta = categoryMeta(rule.category);
          const isEditing = editingId === rule._id;
          return (
            <div
              key={rule._id}
              className={cn(
                'bg-slate-900 border rounded-lg p-4',
                rule.isActive ? 'border-slate-800' : 'border-slate-800 opacity-60',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    onClick={() => handleReorder(rule._id, 'up')}
                    disabled={idx === 0}
                    className="text-slate-500 hover:text-white disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleReorder(rule._id, 'down')}
                    disabled={idx === rules.length - 1}
                    className="text-slate-500 hover:text-white disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
                        <select
                          value={editDraft.category}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, category: e.target.value as Category })
                          }
                          className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={editDraft.title}
                          onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                          className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                        />
                      </div>
                      <textarea
                        value={editDraft.body}
                        onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })}
                        rows={4}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white resize-y"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={cn(
                            'px-2 py-0.5 text-xs rounded-full border',
                            meta.color,
                          )}
                        >
                          {meta.label}
                        </span>
                        <h3 className="font-semibold text-white">{rule.title}</h3>
                      </div>
                      <p className="text-sm text-slate-400 whitespace-pre-wrap">{rule.body}</p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => saveEdit(rule._id)}
                        disabled={busy}
                        className="p-2 text-teal-400 hover:text-teal-300 disabled:opacity-50"
                        title="Save"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-2 text-slate-400 hover:text-white"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rule.isActive}
                          onChange={() => handleToggle(rule)}
                          className="w-4 h-4 accent-teal-500"
                        />
                        <span className="text-xs text-slate-400 hidden sm:inline">Active</span>
                      </label>
                      <button
                        onClick={() => beginEdit(rule)}
                        className="p-2 text-slate-400 hover:text-white"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule)}
                        className="p-2 text-red-400 hover:text-red-300"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { EditorialRulesInner as EditorialRulesAdminContent };

export default function EditorialRulesAdmin() {
  return (
    <ConvexClientProvider>
      <EditorialRulesInner />
    </ConvexClientProvider>
  );
}
