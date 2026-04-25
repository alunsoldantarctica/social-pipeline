import { useStore } from '@nanostores/react';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { $isOnline, $pendingActionCount } from '../../../lib/stores';

export function OfflineBanner() {
  const isOnline = useStore($isOnline);
  const pendingCount = useStore($pendingActionCount);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
          data-testid="offline-banner"
        >
          <div className="flex items-center gap-2 px-4 sm:px-6 lg:px-8 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-sm">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              You're offline — viewing cached data
              {pendingCount > 0 && (
                <span className="ml-1 text-amber-300">
                  ({pendingCount} pending action{pendingCount !== 1 ? 's' : ''}{' '}
                  will sync when reconnected)
                </span>
              )}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
