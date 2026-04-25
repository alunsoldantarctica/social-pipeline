import { Loader2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { type WorkflowStatus, STATUS_CONFIG, isInProgress } from './types';

export function StatusBadge({ status }: { status: WorkflowStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={cn('px-2 py-1 rounded-full text-xs font-medium', config.bgColor, config.color)}>
      {isInProgress(status) && <Loader2 className="w-3 h-3 inline-block mr-1 animate-spin" />}
      {config.label}
    </span>
  );
}
