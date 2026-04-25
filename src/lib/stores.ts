import { atom } from 'nanostores';

// Cross-island state for CoverageGapAnalyzer modal
export const isGapAnalyzerOpen = atom(false);

// Offline state — shared across admin islands
export const $isOnline = atom(
  typeof navigator !== 'undefined' ? navigator.onLine : true,
);
export const $pendingActionCount = atom(0);
export const $lastSyncAt = atom<number | null>(null);
