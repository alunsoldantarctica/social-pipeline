import { cn } from '../../../lib/utils';

export interface TabDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface AdminTabsProps {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function AdminTabs({ tabs, activeTab, onTabChange }: AdminTabsProps) {
  return (
    <div className="shrink-0 border-b border-slate-800 bg-slate-900/30 px-4 sm:px-6 lg:px-8">
      <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-none" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              'flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              activeTab === tab.key
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600',
            )}
          >
            <span className="w-4 h-4 shrink-0">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge != null && tab.badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-medium min-w-[20px] text-center bg-amber-500/20 text-amber-400">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
