import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { AdminShell } from '../AdminShell';
import { AdminScrollArea } from '../AdminScrollArea';
import {
  Loader2,
  Filter,
  X,
  ChevronRight,
  Activity,
  Calendar,
  Search,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';

/**
 * Action types for filtering
 */
const ACTION_TYPES = [
  { value: 'message', label: 'Customer Messages' },
  { value: 'reply', label: 'Admin Replies' },
  { value: 'note', label: 'Internal Notes' },
  { value: 'status_change', label: 'Status Changes' },
  { value: 'contract_step', label: 'Contract Steps' },
  { value: 'quote_status_change', label: 'Quote Status Changes' },
  { value: 'quote_abandoned', label: 'Abandoned Quotes' },
  { value: 'payment_received', label: 'Payments' },
  { value: 'policy_issued', label: 'Policies Issued' },
];

/**
 * Filters component
 */
interface FiltersProps {
  filters: {
    dateStart?: number;
    dateEnd?: number;
    actionTypes?: string[];
    customerEmail?: string;
  };
  onChange: (filters: any) => void;
}

function Filters({ filters, onChange }: FiltersProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [customerEmailInput, setCustomerEmailInput] = useState(filters.customerEmail || '');

  const toggleActionType = (type: string) => {
    const current = filters.actionTypes || [];
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    
    onChange({
      ...filters,
      actionTypes: updated.length > 0 ? updated : undefined,
    });
  };

  const clearFilters = () => {
    setCustomerEmailInput('');
    onChange({});
  };

  const hasActiveFilters = 
    filters.dateStart || 
    filters.dateEnd || 
    (filters.actionTypes && filters.actionTypes.length > 0) ||
    filters.customerEmail;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-teal-400" />
          <h3 className="text-lg font-semibold text-white">Filters</h3>
          {hasActiveFilters && (
            <span className="text-xs bg-teal-900/30 text-teal-400 px-2 py-1 rounded">
              Active
            </span>
          )}
        </div>
        <ChevronRight className={cn(
          "w-5 h-5 text-slate-500 transition-transform",
          isOpen && "rotate-90"
        )} />
      </button>

      {/* Filter content */}
      {isOpen && (
        <div className="p-4 pt-0 space-y-4">
          {/* Date range */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Date Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={filters.dateStart ? new Date(filters.dateStart).toISOString().split('T')[0] : ''}
                onChange={(e) => onChange({
                  ...filters,
                  dateStart: e.target.value ? new Date(e.target.value).getTime() : undefined,
                })}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                placeholder="Start date"
              />
              <input
                type="date"
                value={filters.dateEnd ? new Date(filters.dateEnd).toISOString().split('T')[0] : ''}
                onChange={(e) => onChange({
                  ...filters,
                  dateEnd: e.target.value ? new Date(e.target.value + 'T23:59:59').getTime() : undefined,
                })}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                placeholder="End date"
              />
            </div>
          </div>

          {/* Action types */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Action Types
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {ACTION_TYPES.map(type => (
                <label
                  key={type.value}
                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/30 p-2 rounded transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={(filters.actionTypes || []).includes(type.value)}
                    onChange={() => toggleActionType(type.value)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-teal-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-300">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Customer email search */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Customer Email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={customerEmailInput}
                onChange={(e) => setCustomerEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onChange({
                      ...filters,
                      customerEmail: customerEmailInput || undefined,
                    });
                  }
                }}
                placeholder="customer@example.com"
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
              />
              <button
                onClick={() => onChange({
                  ...filters,
                  customerEmail: customerEmailInput || undefined,
                })}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-sm transition-colors"
              >
                Search
              </button>
            </div>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors"
            >
              <X className="w-4 h-4" />
              Clear All Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
 * Customer action group (full page version - always expanded)
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
      type: string;
      url: string;
    };
  }>;
}

interface CustomerActionGroupProps {
  group: ActionGroup;
}

function CustomerActionGroup({ group }: CustomerActionGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const latestAction = group.actions[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg mb-4 overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/30 transition-colors text-left"
      >
        <ChevronRight className={cn(
          "w-5 h-5 text-slate-500 transition-transform flex-shrink-0",
          isExpanded && "rotate-90"
        )} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white">{group.customerName}</span>
            <span className="text-sm text-slate-500">
              {group.actionCount} action{group.actionCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-sm text-slate-400 flex items-center gap-2">
            {getActionIcon(latestAction.type)}
            <span>Latest: {latestAction.description}</span>
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
        <div className="border-t border-slate-800">
          {group.actions.map((action, index) => (
            <a
              key={action.id}
              href={action.navigationTarget.url}
              className={cn(
                "flex items-center gap-3 p-4 hover:bg-slate-800/50 transition-colors",
                index < group.actions.length - 1 && "border-b border-slate-800/50"
              )}
            >
              {getActionIcon(action.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300">{action.description}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(action.timestamp).toLocaleString()}
                </p>
              </div>
              <span className="text-xs text-slate-500 flex-shrink-0">
                {formatRelativeTime(action.timestamp)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inner component — rendered inside AdminShell which provides ConvexClientProvider */
function ActionLogPageContent() {
  const [filters, setFilters] = useState<any>({});
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [accumulatedGroups, setAccumulatedGroups] = useState<ActionGroup[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const result = useQuery(
    api.admin.actionLog.getPaginatedActions,
    { cursor, filters, pageSize: 50 }
  );

  // Accumulate groups as pages load
  useEffect(() => {
    if (result === undefined) return;

    if (cursor === undefined) {
      // Fresh load (initial or filter change)
      setAccumulatedGroups(result.groups);
    } else {
      // Load more — merge, deduplicating by conversationId
      setAccumulatedGroups(prev => {
        const merged = [...prev];
        for (const group of result.groups) {
          const existingIdx = merged.findIndex(
            g => g.conversationId === group.conversationId
          );
          if (existingIdx >= 0) {
            const existing = merged[existingIdx];
            const existingActionIds = new Set(existing.actions.map(a => a.id));
            const newActions = group.actions.filter(a => !existingActionIds.has(a.id));
            merged[existingIdx] = {
              ...existing,
              actionCount: existing.actionCount + newActions.length,
              actions: [...existing.actions, ...newActions],
            };
          } else {
            merged.push(group);
          }
        }
        return merged;
      });
    }
    setIsLoadingMore(false);
  }, [result, cursor]);

  // Reset when filters change
  useEffect(() => {
    setCursor(undefined);
    setAccumulatedGroups([]);
  }, [JSON.stringify(filters)]);

  const groups = accumulatedGroups;
  const hasMore = result?.hasMore ?? false;
  const isLoading = result === undefined && accumulatedGroups.length === 0;

  return (
    <AdminScrollArea>
      <div className="space-y-6">
        {/* Filters */}
        <Filters filters={filters} onChange={setFilters} />

        {/* Results */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-12 text-center">
              <Activity className="w-16 h-16 text-slate-700 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">No Activity Found</h3>
              <p className="text-slate-400">
                {Object.keys(filters).length > 0
                  ? 'Try adjusting your filters'
                  : 'No customer activity logged yet'}
              </p>
            </div>
          ) : (
            <>
              {/* Results count */}
              <div className="mb-4 text-sm text-slate-400">
                Showing {groups.length} customer{groups.length !== 1 ? 's' : ''}
                {hasMore && ' · Scroll for more'}
              </div>

              {/* Action groups */}
              <div>
                {groups.map((group: ActionGroup) => (
                  <CustomerActionGroup key={group.conversationId} group={group} />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="text-center mt-6">
                  <button
                    onClick={() => {
                      if (result?.nextCursor) {
                        setIsLoadingMore(true);
                        setCursor(result.nextCursor);
                      }
                    }}
                    disabled={isLoadingMore}
                    className="px-6 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors flex items-center gap-2 mx-auto"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>Load More</>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminScrollArea>
  );
}

/**
 * Action Log Page - Full page with filters and pagination
 */
export default function ActionLogPage() {
  return (
    <AdminShell title="Action Log" subtitle="Complete customer activity history" currentPath="/admin/action-log">
      <ActionLogPageContent />
    </AdminShell>
  );
}
