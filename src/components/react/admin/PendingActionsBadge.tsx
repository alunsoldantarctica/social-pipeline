import { CloudOff } from 'lucide-react';
import { useStore } from '@nanostores/react';
import { $pendingActionCount } from '../../../lib/stores';

export function PendingActionsBadge() {
  const count = useStore($pendingActionCount);

  if (count === 0) return null;

  return (
    <span
      className="relative p-2 text-amber-400"
      title={`${count} pending action${count !== 1 ? 's' : ''}`}
    >
      <CloudOff className="w-5 h-5" />
      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-amber-500 text-white text-[10px] font-bold rounded-full px-1">
        {count > 99 ? '99+' : count}
      </span>
    </span>
  );
}
