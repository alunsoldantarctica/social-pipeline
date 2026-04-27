import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Shield,
  Sparkles,
  Wand2,
  Globe,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { cn } from '../../../lib/utils';
import { ConvexClientProvider } from './ConvexClientProvider';
import { SignInButtons } from './SignInButtons';

type Stage = 'research' | 'outline' | 'draft';
type Format = 'twitter_thread' | 'linkedin_article' | 'newsletter_issue';
type SlotKey =
  | 'research'
  | 'outline'
  | 'draft'
  | 'twitter_thread'
  | 'linkedin_article'
  | 'newsletter_issue';

type SlotPreview = {
  stage: Stage;
  format?: Format;
  key: SlotKey;
  newBody: string;
  currentBody: string;
  isLocked: boolean;
  isOverridden: boolean;
};

type GeneratedSet = Record<SlotKey, string>;

type Preview = {
  generated: GeneratedSet;
  slots: SlotPreview[];
  sourceModel: string;
  websiteSummaryUsed: boolean;
};

const SLOT_LABELS: Record<SlotKey, { label: string; description: string }> = {
  research: { label: 'Research', description: 'How the research agent gathers and synthesizes sources' },
  outline: { label: 'Outline', description: 'How the outline agent shapes article structure' },
  draft: { label: 'Draft', description: 'How the draft agent writes the article body' },
  twitter_thread: { label: 'Twitter / X thread', description: 'Format adapter — appended to draft for X threads' },
  linkedin_article: { label: 'LinkedIn article', description: 'Format adapter — appended to draft for LinkedIn' },
  newsletter_issue: { label: 'Newsletter issue', description: 'Format adapter — appended to draft for newsletters' },
};

function NicheSetupInner() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const config = useQuery(api.admin.nicheGenerator.getNicheConfig);
  const saveConfig = useMutation(api.admin.nicheGenerator.saveNicheConfig);
  const generate = useAction(api.admin.nicheGenerator.generatePrompts);
  const apply = useAction(api.admin.nicheGenerator.applyGeneratedPrompts);

  const [websiteUrl, setWebsiteUrl] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('');
  const [busy, setBusy] = useState<'save' | 'generate' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<SlotKey>>(new Set());
  const [forceOverride, setForceOverride] = useState(false);
  const [expanded, setExpanded] = useState<SlotKey | null>(null);

  // Hydrate the form from saved config on first load.
  useEffect(() => {
    if (config && !preview) {
      setWebsiteUrl(config.websiteUrl ?? '');
      setDescription(config.description ?? '');
      setAudience(config.audience ?? '');
    }
  }, [config, preview]);

  const flashError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 8000);
  };
  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
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

  const handleSave = async () => {
    if (!description.trim() || !audience.trim()) {
      flashError('Niche description and audience are both required');
      return;
    }
    setBusy('save');
    try {
      await saveConfig({
        websiteUrl: websiteUrl.trim() || undefined,
        description: description.trim(),
        audience: audience.trim(),
      });
      flashSuccess('Niche profile saved');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to save niche');
    } finally {
      setBusy(null);
    }
  };

  const handleGenerate = async () => {
    if (!description.trim() || !audience.trim()) {
      flashError('Niche description and audience are both required');
      return;
    }
    setBusy('generate');
    setPreview(null);
    try {
      const result = (await generate({
        websiteUrl: websiteUrl.trim() || undefined,
        description: description.trim(),
        audience: audience.trim(),
      })) as Preview;
      setPreview(result);
      // Default selection: every slot that isn't currently locked.
      const next = new Set<SlotKey>();
      for (const slot of result.slots) {
        if (!slot.isLocked) next.add(slot.key);
      }
      setSelected(next);
      flashSuccess(
        `Generated 6 prompts via ${result.sourceModel}${result.websiteSummaryUsed ? ' (with website context)' : ''}`,
      );
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to generate prompts');
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    if (selected.size === 0) {
      flashError('Select at least one prompt to apply');
      return;
    }
    setBusy('apply');
    try {
      const result = (await apply({
        prompts: preview.generated,
        force: forceOverride,
        only: Array.from(selected),
      })) as { written: string[]; skipped: string[] };
      flashSuccess(
        `Wrote ${result.written.length} prompt${result.written.length === 1 ? '' : 's'}; skipped ${result.skipped.length} (locked)`,
      );
      // Clear preview after successful apply so the operator sees fresh state next time.
      setPreview(null);
      setSelected(new Set());
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Failed to apply prompts');
    } finally {
      setBusy(null);
    }
  };

  const toggleSelected = (key: SlotKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const lastGenerated = config?.lastGeneratedAt
    ? new Date(config.lastGeneratedAt).toLocaleString()
    : null;
  const formIsDirty = useMemo(() => {
    if (!config) return Boolean(description || audience || websiteUrl);
    return (
      (config.websiteUrl ?? '') !== websiteUrl ||
      (config.description ?? '') !== description ||
      (config.audience ?? '') !== audience
    );
  }, [config, websiteUrl, description, audience]);

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

      {/* Intro / status */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-teal-500" />
          Niche setup
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Tell the system who you write for. The generator scrapes your site (if you give one),
          runs a meta-prompt against your configured draft model, and tailors all six agent
          prompts. You preview the output before it lands in the <strong>Prompts</strong> tab —
          custom edits there are <em>locked by default</em> so a regenerate won't clobber them.
        </p>
        {lastGenerated && (
          <p className="text-xs text-slate-500 mt-3">
            Last generated {lastGenerated} via {config?.lastSourceModel ?? 'unknown model'}
          </p>
        )}
      </div>

      {/* Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Website URL <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <input
            type="url"
            placeholder="https://example.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white placeholder:text-slate-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            We'll scrape your homepage for brand voice, products, and CTAs.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Niche description <span className="text-rose-400">*</span>
          </label>
          <textarea
            placeholder="What do you write about? e.g. 'Travel insurance for adventure travelers heading to polar regions and remote destinations.'"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white placeholder:text-slate-500 resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Target audience <span className="text-rose-400">*</span>
          </label>
          <textarea
            placeholder="Who's reading? e.g. 'Affluent expedition travelers spending $5k–$50k per trip, sophisticated about insurance basics, want depth over basics.'"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white placeholder:text-slate-500 resize-y"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={busy !== null || !formIsDirty}
            className="px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 disabled:opacity-40"
          >
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Save profile'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={busy !== null || !description.trim() || !audience.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-40"
          >
            {busy === 'generate' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate prompts
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="space-y-3">
          <div className="bg-slate-900 border border-teal-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white">
              Preview — {preview.slots.length} prompts ready
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Generated by <strong>{preview.sourceModel}</strong>. Locked rows (you've previously
              customized them) are skipped unless you tick <em>Override custom edits</em>.
            </p>
          </div>

          {preview.slots.map((slot) => {
            const isSelected = selected.has(slot.key);
            const isExpanded = expanded === slot.key;
            const meta = SLOT_LABELS[slot.key];
            const isDraftFormat = slot.format != null;
            return (
              <div
                key={slot.key}
                className={cn(
                  'bg-slate-900 border rounded-lg',
                  isSelected ? 'border-teal-700' : 'border-slate-800',
                  slot.isLocked && !forceOverride && 'opacity-60',
                  isDraftFormat && 'ml-6',
                )}
              >
                <div className="p-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={slot.isLocked && !forceOverride}
                    onChange={() => toggleSelected(slot.key)}
                    className="mt-1 w-4 h-4 accent-teal-500 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : slot.key)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-white">{meta.label}</h4>
                      {slot.isLocked ? (
                        <span className="px-2 py-0.5 text-xs rounded-full border bg-amber-900/40 text-amber-300 border-amber-800 inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Locked (custom)
                        </span>
                      ) : slot.isOverridden ? (
                        <span className="px-2 py-0.5 text-xs rounded-full border bg-teal-900/40 text-teal-300 border-teal-800 inline-flex items-center gap-1">
                          <Unlock className="w-3 h-3" /> Custom
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full border bg-slate-800 text-slate-400 border-slate-700">
                          Default
                        </span>
                      )}
                      <span className="text-xs text-slate-500 ml-auto inline-flex items-center gap-1">
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {slot.newBody.length.toLocaleString()} chars
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{meta.description}</p>
                  </button>
                </div>
                {isExpanded && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 px-4 pb-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">
                        Current
                      </p>
                      <pre className="text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-md p-3 overflow-auto max-h-96 whitespace-pre-wrap">
                        {slot.currentBody}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs text-teal-400 mb-1 uppercase tracking-wider">
                        Proposed
                      </p>
                      <pre className="text-xs text-slate-200 bg-slate-950 border border-teal-800/50 rounded-md p-3 overflow-auto max-h-96 whitespace-pre-wrap">
                        {slot.newBody}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Apply controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={forceOverride}
                onChange={(e) => setForceOverride(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              Override custom edits (re-enable locked rows)
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPreview(null);
                  setSelected(new Set());
                }}
                className="px-3 py-2 text-slate-400 hover:text-white"
              >
                Discard
              </button>
              <button
                onClick={handleApply}
                disabled={busy !== null || selected.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-40"
              >
                {busy === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Apply {selected.size} prompt{selected.size === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { NicheSetupInner as NicheSetupAdminContent };

export default function NicheSetupAdmin() {
  return (
    <ConvexClientProvider>
      <NicheSetupInner />
    </ConvexClientProvider>
  );
}
