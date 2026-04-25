import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { AdminShell } from '../AdminShell';

const STATUS_OPTIONS = ['all', 'delivered', 'retrying', 'exhausted', 'removed'] as const;

const STATUS_STYLES: Record<string, string> = {
  delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  retrying: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  exhausted: 'bg-red-500/10 text-red-400 border-red-500/20',
  removed: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PushLogPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const stats = useQuery(api.pushNotifications.getPushLogStats, {});
  const entries = useQuery(api.pushNotifications.listPushLog, {
    limit: 100,
    statusFilter: statusFilter === 'all' ? undefined : statusFilter,
  });

  return (
    <AdminShell
      title="Push Log"
      subtitle="Push notification delivery history (24h stats)"
      currentPath="/admin/push-log"
    >
      <div className="space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Delivered" count={stats?.delivered ?? 0} color="text-emerald-400" />
          <StatCard label="Retrying" count={stats?.retrying ?? 0} color="text-amber-400" />
          <StatCard label="Exhausted" count={stats?.exhausted ?? 0} color="text-red-400" />
          <StatCard label="Removed" count={stats?.removed ?? 0} color="text-zinc-400" />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Status:</span>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-transparent text-zinc-500 border-zinc-700 hover:border-zinc-500'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Log table */}
        {entries === undefined ? (
          <div className="text-center text-zinc-500 py-12">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">
            No push notification logs yet.
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Time</th>
                  <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Title</th>
                  <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Endpoint</th>
                  <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Attempt</th>
                  <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry._id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/30"
                  >
                    <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">
                      {timeAgo(entry.attemptedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-200 max-w-[200px] truncate">
                      {entry.title}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs max-w-[200px] truncate">
                      {entry.endpointShort}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[entry.status] ?? ''}`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {entry.attempt}/{entry.maxAttempts}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs max-w-[250px] truncate">
                      {entry.statusCode ? `${entry.statusCode}: ` : ''}
                      {entry.errorMessage ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3">
      <div className={`text-2xl font-semibold ${color}`}>{count}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{label} (24h)</div>
    </div>
  );
}
