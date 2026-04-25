import { RefreshCw } from 'lucide-react';

interface Props {
  cachedAt: number | null;
  isCached: boolean;
  onRefresh?: () => void;
}

/**
 * Small badge showing cache age with an optional refresh button.
 * Only renders when data is being served from cache.
 */
export function CacheFreshnessTag({ cachedAt, isCached, onRefresh }: Props) {
  if (!isCached || !cachedAt) return null;

  const age = Date.now() - cachedAt;
  const label = formatAge(age);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-400/80">
      <span>Cached {label}</span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="hover:text-amber-300 transition-colors"
          title="Refresh data"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
