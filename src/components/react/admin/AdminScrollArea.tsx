import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

interface AdminScrollAreaProps {
  children: ReactNode;
  className?: string;
}

export function AdminScrollArea({ children, className }: AdminScrollAreaProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8', className)}>
      {children}
    </div>
  );
}
