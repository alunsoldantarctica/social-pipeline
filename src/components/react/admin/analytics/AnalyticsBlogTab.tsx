import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { cn } from '../../../../lib/utils';
import { Loader2 } from 'lucide-react';

function formatDuration(ms: number): string {
  if (ms === 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function AnalyticsBlogTab() {
  const [days, setDays] = useState(90);
  const data = useQuery(api.admin.analytics.getBlogPerformance, { days });

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const maxViews = Math.max(...data.map((d) => d.views), 1);

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 w-fit">
        {[30, 90, 365].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              days === d ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            {d === 365 ? '1y' : `${d}d`}
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-medium text-slate-400 mb-4">Blog posts by views</h3>
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">No blog view data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 font-medium">Post</th>
                  <th className="text-right py-2 font-medium w-16">Views</th>
                  <th className="text-left py-2 font-medium w-32 pl-4">Distribution</th>
                  <th className="text-right py-2 font-medium w-20">Uniques</th>
                  <th className="text-right py-2 font-medium w-16">Dur.</th>
                  <th className="text-right py-2 font-medium w-20">Landings</th>
                </tr>
              </thead>
              <tbody>
                {data.map((post) => (
                  <tr key={post.slug} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2.5">
                      <div className="text-slate-200 font-medium truncate max-w-[280px]" title={post.title}>
                        {post.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate">/blog/{post.slug}</div>
                    </td>
                    <td className="py-2.5 text-right text-slate-200 font-medium">{post.views}</td>
                    <td className="py-2.5 pl-4">
                      <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full"
                          style={{ width: `${(post.views / maxViews) * 100}%`, opacity: 0.7 }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-slate-400">{post.uniqueVisitors}</td>
                    <td className="py-2.5 text-right text-slate-400">{formatDuration(post.avgDuration)}</td>
                    <td className="py-2.5 text-right text-slate-400">{post.landingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
