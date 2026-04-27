import { useState, useEffect } from 'react';
import { useConvexAuth, useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { ConvexClientProvider } from '../ConvexClientProvider';
import { SignInButtons } from '../SignInButtons';
import { Loader2, Check, Building2, Compass, Send, Mail, Users, Rss } from 'lucide-react';
import { cn } from '../../../lib/utils';

type Step = 'channels' | 'workspace' | 'niche' | 'publishing' | 'invite' | 'done';

interface Channels {
  social: boolean;
  newsletter: boolean;
}

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'channels', label: 'Channels', icon: <Rss className="w-4 h-4" /> },
  { key: 'workspace', label: 'Workspace', icon: <Building2 className="w-4 h-4" /> },
  { key: 'niche', label: 'Niche', icon: <Compass className="w-4 h-4" /> },
  { key: 'publishing', label: 'Publishing', icon: <Send className="w-4 h-4" /> },
  { key: 'invite', label: 'Invite', icon: <Users className="w-4 h-4" /> },
];

// ===== Step 0: Channels =====

function ChannelsStep({ onNext }: { onNext: (channels: Channels) => void }) {
  const [social, setSocial] = useState(false);
  const [newsletter, setNewsletter] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">What do you want to publish?</h2>
        <p className="text-slate-400 text-sm">You can add channels later from workspace settings.</p>
      </div>
      <div className="space-y-3">
        {/* Blog always on */}
        <label className="flex items-start gap-3 p-4 bg-teal-600/10 border border-teal-600/30 rounded-lg cursor-default">
          <div className="w-5 h-5 mt-0.5 rounded bg-teal-600 flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-white" />
          </div>
          <div>
            <p className="text-white font-medium">Blog posts</p>
            <p className="text-slate-400 text-sm">Publish long-form content to your public blog — no extra service needed.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-slate-600 transition-colors">
          <input
            type="checkbox"
            checked={social}
            onChange={(e) => setSocial(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-teal-500 flex-shrink-0"
          />
          <div>
            <p className="text-white font-medium">Social media</p>
            <p className="text-slate-400 text-sm">Post threads, articles, and updates to Twitter/X, LinkedIn, Threads, and more via Zernio.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:border-slate-600 transition-colors">
          <input
            type="checkbox"
            checked={newsletter}
            onChange={(e) => setNewsletter(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-teal-500 flex-shrink-0"
          />
          <div>
            <p className="text-white font-medium">Email newsletter</p>
            <p className="text-slate-400 text-sm">Send newsletter issues to your subscriber list via Resend.</p>
          </div>
        </label>
      </div>
      <button
        onClick={() => onNext({ social, newsletter })}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors font-medium"
      >
        Continue →
      </button>
    </div>
  );
}

// ===== Step 1: Workspace =====

function WorkspaceStep({ onNext }: { onNext: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const suggestedSlug = useQuery(api.workspaces.suggestSlug, name.trim() ? { name } : 'skip');
  const slugCheck = useQuery(
    api.workspaces.checkSlugAvailable,
    slug.trim() ? { slug } : 'skip',
  );
  const createWorkspace = useMutation(api.workspaces.createWorkspace);

  useEffect(() => {
    if (!slugEdited && suggestedSlug) setSlug(suggestedSlug);
  }, [suggestedSlug, slugEdited]);

  const slugOk = slugCheck?.available === true;
  const slugInvalid = slug.trim() && slugCheck?.available === false;

  async function handleCreate() {
    setError('');
    if (!name.trim()) { setError('Workspace name is required'); return; }
    if (!slugOk) { setError('Fix the slug before continuing'); return; }
    setBusy(true);
    try {
      await createWorkspace({ name: name.trim(), slug });
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-1">Create your workspace</h2>
        <p className="text-slate-400">This is the hub for your content pipeline.</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Workspace name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">URL slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
            placeholder="acme-corp"
            className={cn(
              'w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none',
              slugInvalid ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-teal-500',
            )}
          />
          {slug && (
            <p className={cn('mt-1 text-xs', slugOk ? 'text-teal-400' : slugInvalid ? 'text-red-400' : 'text-slate-500')}>
              {slugOk ? '✓ Available' : slugInvalid ? (slugCheck?.reason === 'taken' ? 'Already taken' : 'Invalid format') : 'Checking…'}
            </p>
          )}
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
      <button
        onClick={handleCreate}
        disabled={busy || !slugOk}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Create workspace →
      </button>
    </div>
  );
}

// ===== Step 2: Niche =====

function NicheStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('');
  const [busy, setBusy] = useState<'save' | 'generate' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const generatePrompts = useAction(api.admin.nicheGenerator.generatePrompts);
  const applyPrompts = useAction(api.admin.nicheGenerator.applyGeneratedPrompts);
  const saveNiche = useMutation(api.admin.nicheGenerator.saveNicheConfig);

  async function handleGenerate() {
    setError('');
    if (!description.trim()) { setError('Description is required'); return; }
    if (!audience.trim()) { setError('Audience is required'); return; }
    setBusy('generate');
    try {
      await saveNiche({ websiteUrl: websiteUrl || undefined, description, audience });
      const result = await generatePrompts({ websiteUrl: websiteUrl || undefined, description, audience });
      await applyPrompts({ prompts: result.generated, force: false });
      setSuccess('Prompts generated and applied!');
      setTimeout(onNext, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveAndNext() {
    setError('');
    if (!description.trim() || !audience.trim()) { onNext(); return; }
    setBusy('save');
    try {
      await saveNiche({ websiteUrl: websiteUrl || undefined, description, audience });
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-1">Tell us about your niche</h2>
        <p className="text-slate-400">We'll tailor the AI pipeline prompts to your audience.</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Website URL <span className="text-slate-500">(optional)</span></label>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yoursite.com"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">What do you write about?</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="e.g. B2B SaaS growth, expedition travel insurance, sustainable fashion…"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Who's reading?</label>
          <textarea
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            rows={3}
            placeholder="e.g. Series A founders, adventure travelers over 40, eco-conscious millennials…"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-teal-400 text-sm">{success}</p>}
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleGenerate}
          disabled={!!busy}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50 transition-colors font-medium"
        >
          {busy === 'generate' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Generate prompts →
        </button>
        <button
          onClick={onSkip}
          disabled={!!busy}
          className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm"
        >
          Skip
        </button>
      </div>
      <button
        onClick={handleSaveAndNext}
        disabled={!!busy}
        className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        Save & continue without generating →
      </button>
    </div>
  );
}

// ===== Step 3: Publishing =====

function PublishingStep({ onNext, onSkip, channels }: { onNext: () => void; onSkip: () => void; channels: Channels }) {
  const [audienceId, setAudienceId] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const updateConfig = useMutation(api.admin.resendNewsletter.updateResendConfig);
  const testConnection = useAction(api.admin.resendNewsletter.testResendConnection);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({});
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!audienceId.trim() || !fromAddress.trim()) { onNext(); return; }
    setBusy(true);
    setError('');
    try {
      await updateConfig({
        autoSend: false,
        audienceId: audienceId.trim(),
        fromAddress: fromAddress.trim(),
        replyTo: replyTo.trim() || undefined,
      });
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-1">Connect publishing</h2>
        <p className="text-slate-400">
          {channels.newsletter && channels.social
            ? 'Configure Resend for newsletters and Zernio for social media.'
            : channels.newsletter
            ? 'Configure Resend to send newsletter issues to your audience.'
            : 'Configure Zernio to publish to social media.'}
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Resend audience ID</label>
          <input
            type="text"
            value={audienceId}
            onChange={(e) => setAudienceId(e.target.value)}
            placeholder="aud_xxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">From address</label>
          <input
            type="email"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder="newsletter@yourdomain.com"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Reply-to <span className="text-slate-500">(optional)</span></label>
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="hello@yourdomain.com"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
          Test Resend connection
        </button>
        {testResult && (
          <p className={cn('text-sm', testResult.ok ? 'text-teal-400' : 'text-red-400')}>
            {testResult.ok ? '✓ Connected' : `✗ ${testResult.error}`}
          </p>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50 transition-colors font-medium"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save & continue →
        </button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ===== Step 4: Invite =====

function InviteStep({ workspaceId, onNext }: { workspaceId: string; onNext: () => void }) {
  const [emailsRaw, setEmailsRaw] = useState('');
  const [role, setRole] = useState<'admin' | 'editor'>('editor');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<{ email: string; status: string }> | null>(null);
  const [error, setError] = useState('');

  const inviteMembers = useAction(api.workspaceMembers.inviteMembers);

  async function handleInvite() {
    const emails = emailsRaw
      .split(/[\n,]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!emails.length) { onNext(); return; }
    setBusy(true);
    setError('');
    try {
      const res = await inviteMembers({ workspaceId: workspaceId as any, emails, role });
      setResults(res);
      setTimeout(onNext, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-1">Invite teammates</h2>
        <p className="text-slate-400">They'll get an email with an invite link (valid for 7 days).</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Email addresses (one per line or comma-separated)</label>
          <textarea
            value={emailsRaw}
            onChange={(e) => setEmailsRaw(e.target.value)}
            rows={4}
            placeholder="alice@example.com&#10;bob@example.com"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Role</label>
          <div className="flex gap-3">
            {(['admin', 'editor'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg text-sm border transition-colors capitalize',
                  role === r
                    ? 'bg-teal-600/20 border-teal-500 text-teal-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {results && (
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.email} className={cn('text-sm', r.status === 'invited' ? 'text-teal-400' : 'text-red-400')}>
                {r.status === 'invited' ? '✓' : '✗'} {r.email}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleInvite}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50 transition-colors font-medium"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Send invites →
        </button>
        <button
          onClick={onNext}
          disabled={busy}
          className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ===== Done =====

function DoneStep() {
  return (
    <div className="text-center space-y-6 py-4">
      <div className="w-20 h-20 bg-teal-600/20 rounded-full flex items-center justify-center mx-auto">
        <Check className="w-10 h-10 text-teal-400" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold text-white mb-2">You're all set!</h2>
        <p className="text-slate-400">Your workspace is ready. Let's start shipping content.</p>
      </div>
      <a
        href="/admin"
        className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors font-medium"
      >
        Go to dashboard →
      </a>
    </div>
  );
}

// ===== Progress bar =====

function StepProgress({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                done ? 'bg-teal-600/30 text-teal-400' :
                active ? 'bg-teal-600 text-white' :
                'bg-slate-800 text-slate-500',
              )}
            >
              {done ? <Check className="w-3 h-3" /> : step.icon}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('h-px w-4 flex-shrink-0', done ? 'bg-teal-600' : 'bg-slate-700')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===== Main wizard =====

function OnboardingWizardInner() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const activeWorkspace = useQuery(api.workspaces.getActiveWorkspace);
  const [step, setStep] = useState<Step>('channels');
  const [channels, setChannels] = useState<Channels>({ social: false, newsletter: false });

  // If already has workspace, jump to done (or redirect)
  useEffect(() => {
    if (activeWorkspace) {
      setStep('done');
    }
  }, [activeWorkspace]);

  if (isLoading || (isAuthenticated && currentUser === undefined)) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !currentUser) {
    return (
      <div className="max-w-md mx-auto">
        <SignInButtons
          darkMode={true}
          heading="Sign in to get started"
          subheading="Create your workspace and configure your content pipeline"
        />
      </div>
    );
  }

  const workspaceId = activeWorkspace?._id;

  const needsPublishing = channels.social || channels.newsletter;
  const afterNiche = needsPublishing ? 'publishing' : 'invite';

  return (
    <div className="w-full max-w-lg mx-auto">
      {step !== 'done' && <StepProgress current={step} />}
      {step === 'channels' && (
        <ChannelsStep onNext={(ch) => { setChannels(ch); setStep('workspace'); }} />
      )}
      {step === 'workspace' && (
        <WorkspaceStep onNext={() => setStep('niche')} />
      )}
      {step === 'niche' && (
        <NicheStep
          onNext={() => setStep(afterNiche)}
          onSkip={() => setStep(afterNiche)}
        />
      )}
      {step === 'publishing' && (
        <PublishingStep
          channels={channels}
          onNext={() => setStep('invite')}
          onSkip={() => setStep('invite')}
        />
      )}
      {step === 'invite' && workspaceId && (
        <InviteStep workspaceId={workspaceId} onNext={() => setStep('done')} />
      )}
      {step === 'invite' && !workspaceId && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      )}
      {step === 'done' && <DoneStep />}
    </div>
  );
}

export function OnboardingWizard() {
  return (
    <ConvexClientProvider>
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to Social Pipeline</h1>
            <p className="text-slate-400">Let's get your content pipeline ready in a few steps.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8">
            <OnboardingWizardInner />
          </div>
        </div>
      </div>
    </ConvexClientProvider>
  );
}

export default OnboardingWizard;
