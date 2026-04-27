import { useState, useEffect } from 'react';
import { useConvexAuth, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { ConvexClientProvider } from '../ConvexClientProvider';
import { SignInButtons } from '../SignInButtons';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

type State = 'idle' | 'loading' | 'success' | 'error' | 'no-token';

function AcceptInviteInner({ token }: { token: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const accept = useMutation(api.workspaceMembers.acceptInvite);
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setState('no-token');
      return;
    }
    if (!isAuthenticated || isLoading) return;

    setState('loading');
    accept({ token })
      .then(() => setState('success'))
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setState('error');
      });
  }, [isAuthenticated, isLoading, token]);

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <XCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-xl font-semibold text-white">Invalid link</h2>
        <p className="text-slate-400">This invite link is missing a token. Check your email for the correct link.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto">
        <p className="text-slate-400 text-center mb-6">Sign in to accept your workspace invitation.</p>
        <SignInButtons
          darkMode={true}
          heading="Sign in to accept invite"
          subheading="You'll be added to the workspace once you sign in"
        />
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="text-center space-y-3">
        <Loader2 className="w-10 h-10 text-teal-500 animate-spin mx-auto" />
        <p className="text-slate-400">Accepting invitation…</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="text-center space-y-4">
        <CheckCircle className="w-14 h-14 text-teal-400 mx-auto" />
        <h2 className="text-2xl font-semibold text-white">You're in!</h2>
        <p className="text-slate-400">You've joined the workspace. Ready to get started?</p>
        <a
          href="/admin"
          className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors font-medium"
        >
          Go to dashboard →
        </a>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="text-center space-y-4">
        <XCircle className="w-14 h-14 text-red-400 mx-auto" />
        <h2 className="text-2xl font-semibold text-white">Invite failed</h2>
        <p className="text-slate-400">{errorMsg || 'Something went wrong. The link may be expired or already used.'}</p>
        <a
          href="/admin"
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium"
        >
          Go to dashboard
        </a>
      </div>
    );
  }

  return null;
}

export function AcceptInvite({ token }: { token: string }) {
  return (
    <ConvexClientProvider>
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Workspace Invitation</h1>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8">
            <AcceptInviteInner token={token} />
          </div>
        </div>
      </div>
    </ConvexClientProvider>
  );
}

export default AcceptInvite;
