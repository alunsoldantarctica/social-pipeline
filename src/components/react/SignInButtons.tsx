import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SignInButtonsProps {
  darkMode?: boolean;
  heading?: string;
  subheading?: string;
  onSuccess?: () => void;
}

export function SignInButtons({
  darkMode = false,
  heading = 'Sign in',
  subheading,
  onSuccess,
}: SignInButtonsProps) {
  const { signIn } = useAuthActions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGitHub = async () => {
    setLoading(true);
    setError('');
    try {
      await signIn('github', { redirectTo: window.location.pathname });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Check that AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are set in the Convex dashboard.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {heading && (
        <div className="text-center">
          <h2 className={cn('text-xl font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>
            {heading}
          </h2>
          {subheading && (
            <p className={cn('text-sm mt-1', darkMode ? 'text-slate-400' : 'text-slate-500')}>
              {subheading}
            </p>
          )}
        </div>
      )}
      <button
        onClick={handleGitHub}
        disabled={loading}
        className={cn(
          'w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border font-medium transition-colors disabled:opacity-50',
          darkMode
            ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
            : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800',
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        )}
        Continue with GitHub
      </button>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </div>
  );
}

export default SignInButtons;
