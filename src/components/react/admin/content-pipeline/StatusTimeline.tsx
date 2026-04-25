import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { type WorkflowStatus } from './types';

export function StatusTimeline({ status }: { status: WorkflowStatus }) {
  const stages = [
    { key: 'research', label: 'Research', shortLabel: 'Res' },
    { key: 'outline', label: 'Outline', shortLabel: 'Out' },
    { key: 'draft', label: 'Draft', shortLabel: 'Dft' },
    { key: 'published', label: 'Published', shortLabel: 'Pub' },
  ];

  const getCurrentStageIndex = () => {
    if (status === 'rejected') return -1;
    if (status === 'completed') return 3;
    if (status.startsWith('draft')) return 2;
    if (status.startsWith('outline')) return 1;
    return 0;
  };

  const currentIndex = getCurrentStageIndex();

  return (
    <div className="flex items-center justify-between mb-6 overflow-x-auto pb-2">
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex items-center flex-shrink-0">
          <div className="flex flex-col items-center sm:flex-row">
            <div
              className={cn(
                'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium flex-shrink-0',
                i < currentIndex ? 'bg-teal-600 text-white' :
                i === currentIndex ? 'bg-teal-500/30 text-teal-400 ring-2 ring-teal-500' :
                'bg-slate-800 text-slate-500'
              )}
            >
              {i < currentIndex ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : i + 1}
            </div>
            <span className={cn(
              'mt-1 sm:mt-0 sm:ml-2 text-xs sm:text-sm whitespace-nowrap',
              i <= currentIndex ? 'text-slate-200' : 'text-slate-500'
            )}>
              <span className="hidden sm:inline">{stage.label}</span>
              <span className="sm:hidden">{stage.shortLabel}</span>
            </span>
          </div>
          {i < stages.length - 1 && (
            <div className={cn(
              'w-4 sm:w-8 h-0.5 mx-1 sm:mx-2 flex-shrink-0',
              i < currentIndex ? 'bg-teal-600' : 'bg-slate-700'
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
