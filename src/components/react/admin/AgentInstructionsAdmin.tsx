import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Shield,
  Sparkles,
  RefreshCw,
  Save,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { cn } from '../../../lib/utils';
import { ConvexClientProvider } from './ConvexClientProvider';
import { SignInButtons } from './SignInButtons';

type Stage = 'research' | 'outline' | 'draft';
type Format = 'twitter_thread' | 'linkedin_article' | 'newsletter_issue';

type Slot = {
  stage: Stage;
  format?: Format;
  body: string;
  defaultBody: string;
  useDefault: boolean;
  isOverridden: boolean;
  updatedAt: number | null;
};

const STAGE_META: Record<Stage, { label: string; description: string }> = {
  research: {
    label: 'Research',
    description: 'How the research agent gathers, evaluates, and structures source material before the outline runs.',
  },
  outline: {
    label: 'Outline',
    description: 'How the outline agent shapes article structure, headings, and word-count targets.',
  },
  draft: {
    label: 'Draft',
    description: 'How the draft agent writes the article. Format adapters below override this for non-blog outputs.',
  },
};

const FORMAT_META: Record<Format, { label: string; description: string }> = {
  twitter_thread: {
    label: 'Twitter / X thread',
    description: 'Appended to the draft prompt when outputFormat = twitter_thread.',
  },
  linkedin_article: {
    label: 'LinkedIn article',
    description: 'Appended to the draft prompt when outputFormat = linkedin_article.',
  },
  newsletter_issue: {
    label: 'Newsletter issue',
    description: 'Appended to the draft prompt when outputFormat = newsletter_issue.',
  },
};

function slotKey(stage: Stage, format?: Format) {
  return `${stage}::${format ?? ''}`;
}

function PromptCard({
  slot,
  onSave,
  onReset,
  busy,
  indented = false,
}: {
  slot: Slot;
  onSave: (body: string) => Promise<void>;
  onReset: () => Promise<void>;
  busy: boolean;
  indented?: boolean;
}) {
  const [expanded, setExpanded] = useState(slot.isOverridden);
  const [draft, setDraft] = useState(slot.body);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(slot.body);
  }, [slot.body, dirty]);

  const meta = slot.format
    ? FORMAT_META[slot.format]
    : STAGE_META[slot.stage];

  const isCustom = slot.isOverridden;
  const updated = slot.updatedAt
    ? new Date(slot.updatedAt).toLocaleString()
    : null;

  const handleSave = async () => {
    await onSave(draft);
    setDirty(false);
  };

  const handleReset = async () => {
    if (!window.confirm('Reset this prompt to the bundled default? Your custom version will be lost.')) return;
    await onReset();
    setDirty(false);
  };

  return (
    <div
      className={cn(
        'bg-slate-900 border rounded-lg',
        isCustom ? 'border-teal-700' : 'border-slate-800',
        indented && 'ml-6',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-800/30 transition-colors rounded-lg"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white">{meta.label}</h3>
            <span
              className={cn(
                'px-2 py-0.5 text-xs rounded-full border',
                isCustom
                  ? 'bg-teal-900/40 text-teal-300 border-teal-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700',
              )}
            >
              {isCustom ? 'Custom' : 'Default'}
            </span>
            {updated && isCustom && (
              <span className="text-xs text-slate-500">edited {updated}</span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">{meta.description}</p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-800 p-4 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            rows={20}
            spellCheck={false}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 font-mono resize-y focus:border-teal-600 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-slate-500">
              {draft.length.toLocaleString()} characters
              {dirty && <span className="ml-2 text-amber-400">• unsaved changes</span>}
            </div>
            <div className="flex items-center gap-2">
              {isCustom && (
                <button
                  onClick={handleReset}
                  disabled={busy}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset to default
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={busy || !dirty || draft.trim().length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentInstructionsInner() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const slots = useQuery(api.admin.agentInstructions.list) as Slot[] | undefined;
  const upsert = useMutation(api.admin.agentInstructions.upsert);
  const reset = useMutation(api.admin.agentInstructions.resetToDefault);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flashError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  };
  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const grouped = useMemo(() => {
    if (!slots) return null;
    const stages: Record<Stage, { base: Slot | null; formats: Slot[] }> = {
      research: { base: null, formats: [] },
      outline: { base: null, formats: [] },
      draft: { base: null, formats: [] },
    };
    for (const s of slots) {
      if (!s.format) {
        stages[s.stage].base = s;
      } else {
        stages[s.stage].formats.push(s);
      }
    }
    return stages;
  }, [slots]);

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

  const handleSave = async (slot: Slot, body: string) => {
    const key = slotKey(slot.stage, slot.format);
    setBusyKey(key);
    try {
      await upsert({
        stage: slot.stage,
        format: slot.format,
        body,
        useDefault: false,
      });
      flashSuccess(`${slot.format ?? slot.stage} prompt saved`);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to save prompt');
    } finally {
      setBusyKey(null);
    }
  };

  const handleReset = async (slot: Slot) => {
    const key = slotKey(slot.stage, slot.format);
    setBusyKey(key);
    try {
      await reset({ stage: slot.stage, format: slot.format });
      flashSuccess(`${slot.format ?? slot.stage} reset to default`);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to reset prompt');
    } finally {
      setBusyKey(null);
    }
  };

  const customCount = slots?.filter((s) => s.isOverridden).length ?? 0;

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

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-teal-500" />
          Agent Prompts ({customCount} custom / {slots?.length ?? 0} total)
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          The system prompts each pipeline stage uses. Edits take effect on the next agent run — no deploy needed. Format adapters under <strong>Draft</strong> are appended to the base draft prompt when a workflow targets that platform.
        </p>
      </div>

      {!grouped && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      )}

      {grouped && (
        <div className="space-y-4">
          {(['research', 'outline', 'draft'] as Stage[]).map((stage) => {
            const group = grouped[stage];
            if (!group.base) return null;
            return (
              <div key={stage} className="space-y-2">
                <PromptCard
                  slot={group.base}
                  busy={busyKey === slotKey(stage)}
                  onSave={(body) => handleSave(group.base!, body)}
                  onReset={() => handleReset(group.base!)}
                />
                {stage === 'draft' && group.formats.length > 0 && (
                  <div className="space-y-2">
                    {group.formats
                      .slice()
                      .sort((a, b) => (a.format ?? '').localeCompare(b.format ?? ''))
                      .map((s) => (
                        <PromptCard
                          key={slotKey(s.stage, s.format)}
                          slot={s}
                          busy={busyKey === slotKey(s.stage, s.format)}
                          indented
                          onSave={(body) => handleSave(s, body)}
                          onReset={() => handleReset(s)}
                        />
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { AgentInstructionsInner as AgentInstructionsAdminContent };

export default function AgentInstructionsAdmin() {
  return (
    <ConvexClientProvider>
      <AgentInstructionsInner />
    </ConvexClientProvider>
  );
}
