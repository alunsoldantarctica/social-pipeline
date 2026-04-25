import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { ChevronRight, Loader2, Activity } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Action group type from backend
 */
interface ActionGroup {
  customerId: string;
  customerName: string;
  quoteId?: string;
  conversationId: string;
  spaceId: string;
  lastActionAt: number;
  actionCount: number;
  actions: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: number;
    isRead: boolean;
    navigationTarget: {
      type: "abandoned_quote" | "conversation" | "quote_detail";
      url: string;
    };
  }>;
}

/**
 * Format timestamp as relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Get icon for action type
 */
function getActionIcon(type: string): React.ReactNode {
  const iconClass = "w-3 h-3";
  
  switch (type) {
    case "message":
      return <span className={cn(iconClass, "text-blue-400")}>📧</span>;
    case "reply":
      return <span className={cn(iconClass, "text-green-400")}>↩️</span>;
    case "note":
      return <span className={cn(iconClass, "text-yellow-400")}>📝</span>;
    case "status_change":
    case "quote_status_change":
      return <span className={cn(iconClass, "text-purple-400")}>🔄</span>;
    case "contract_step":
      return <span className={cn(iconClass, "text-teal-400")}>📋</span>;
    case "quote_abandoned":
      return <span className={cn(iconClass, "text-red-400")}>🚫</span>;
    case "payment_received":
      return <span className={cn(iconClass, "text-green-400")}>💳</span>;
    case "policy_issued":
      return <span className={cn(iconClass, "text-emerald-400")}>✅</span>;
    default:
      return <span className={cn(iconClass, "text-slate-400")}>•</span>;
  }
}

/**
 * Customer action group component
 */
interface CustomerActionGroupProps {
  group: ActionGroup;
  isExpanded: boolean;
  onToggle: () => void;
}

function CustomerActionGroup({ group, isExpanded, onToggle }: CustomerActionGroupProps) {
  const latestAction = group.actions[0];

  return (
    <div className="border-b border-slate-800/50 last:border-0">
      {/* Group header - always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-800/30 transition-colors text-left"
      >
        <ChevronRight className={cn(
          "w-4 h-4 text-slate-500 transition-transform flex-shrink-0",
          isExpanded && "rotate-90"
        )} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white truncate">{group.customerName}</span>
            <span className="text-xs text-slate-500 flex-shrink-0">
              {group.actionCount} action{group.actionCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-sm text-slate-400 truncate flex items-center gap-2">
            {getActionIcon(latestAction.type)}
            <span>{latestAction.description}</span>
            <span className="text-slate-600">·</span>
            <span>{formatRelativeTime(latestAction.timestamp)}</span>
          </div>
        </div>
        
        {!latestAction.isRead && (
          <div className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
        )}
      </button>

      {/* Expanded action list */}
      {isExpanded && (
        <div className="pl-10 pr-3 pb-2 space-y-1">
          {group.actions.map(action => (
            <a
              key={action.id}
              href={action.navigationTarget.url}
              className="block py-2 px-3 rounded hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {getActionIcon(action.type)}
                <span className="text-sm text-slate-300 flex-1">{action.description}</span>
                <span className="ml-auto text-xs text-slate-500 flex-shrink-0">
                  {formatRelativeTime(action.timestamp)}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Action Log Widget - shows recent customer activity
 */
export function ActionLogWidget() {
  const actions = useQuery(api.admin.actionLog.getRecentActions, { limit: 50 });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (conversationId: string) => {
    const next = new Set(expandedGroups);
    if (next.has(conversationId)) {
      next.delete(conversationId);
    } else {
      next.add(conversationId);
    }
    setExpandedGroups(next);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-teal-400" />
          <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
        </div>
        <a 
          href="/admin/action-log" 
          className="text-sm text-teal-400 hover:text-teal-300 transition-colors"
        >
          View All →
        </a>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {actions === undefined ? (
          // Loading state
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
          </div>
        ) : actions.length === 0 ? (
          // Empty state
          <div className="text-center py-8 px-4">
            <Activity className="w-12 h-12 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No recent activity</p>
          </div>
        ) : (
          // Action groups
          actions.map(group => (
            <CustomerActionGroup
              key={group.conversationId}
              group={group}
              isExpanded={expandedGroups.has(group.conversationId)}
              onToggle={() => toggleGroup(group.conversationId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
