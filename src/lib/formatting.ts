/**
 * Unified formatting utilities for the entire frontend.
 *
 * Consolidates currency, date, and coverage formatters that were previously
 * duplicated across React components and Astro pages.
 */

import type { Locale } from '../i18n/types';

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
};

// ===== Currency =====

export function formatCurrency(
  amount: number | undefined | null,
  opts: {
    currency?: string;
    compact?: boolean;
    nullValue?: string;
  } = {},
): string {
  const { currency = 'USD', compact = false, nullValue = '—' } = opts;

  if (amount == null) return nullValue;

  if (compact && amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a cent amount as a dollar string.
 *
 * @param cents  Amount in cents (e.g. 1999 → "$19.99")
 * @param opts.decimals  Fraction digits (default 2). Use 0 for whole-dollar display.
 */
export function formatCents(
  cents: number,
  opts: { decimals?: number } = {},
): string {
  const { decimals = 2 } = opts;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(cents / 100);
}

// ===== Coverage =====

/**
 * Format a dollar coverage amount in compact form ($100K, $1M).
 *
 * @param amount  Dollar amount (e.g. 100000 → "$100K", 1000000 → "$1M")
 * @param opts.fallback  Value for falsy amounts (default "—")
 */
export function formatCoverage(
  amount: number | undefined | null,
  opts: { fallback?: string } = {},
): string {
  const { fallback = '—' } = opts;
  if (!amount) return fallback;
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return m % 1 === 0 ? `$${m}M` : `$${m.toFixed(1)}M`;
  }
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

// ===== Date Ranges =====

const SHORT_MONTH: Intl.DateTimeFormatOptions = { month: 'short' };
const SHORT_MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/**
 * Format a start date + duration as a human-readable date range.
 *
 * @param startDate  ISO date string (e.g. "2026-11-26") or falsy
 * @param durationDays  Trip duration in days (departure + return both count)
 * @returns  "Nov 26 – Dec 12, 2026" or "Dec 28, 2026 – Jan 14, 2027", or null if startDate is falsy
 */
export function formatDateRange(
  startDate: string | undefined | null,
  durationDays: number,
): string | null {
  if (!startDate) return null;

  const start = new Date(startDate.includes('T') ? startDate : startDate + 'T00:00:00');
  if (isNaN(start.getTime())) return null;

  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-US', opts);

  if (start.getFullYear() !== end.getFullYear()) {
    // Cross-year: "Dec 28, 2026 – Jan 14, 2027"
    return `${fmt(start, { ...SHORT_MONTH_DAY, year: 'numeric' })} – ${fmt(end, { ...SHORT_MONTH_DAY, year: 'numeric' })}`;
  }
  // Same year: "Nov 26 – Dec 12, 2026"
  return `${fmt(start, SHORT_MONTH_DAY)} – ${fmt(end, { ...SHORT_MONTH_DAY, year: 'numeric' })}`;
}

// ===== Dates =====

/**
 * Format a date for display. Handles timestamps (number), date strings, and
 * "YYYY-MM" month strings.
 *
 * @param input  Timestamp (ms), date string, or "YYYY-MM"
 * @param opts.month   Intl month style — "short" (default) or "long"
 * @param opts.includeDay  Show day of month (default true). Set false for "Mon YYYY".
 * @param opts.locale  Locale shortcode or full BCP-47 tag (default "en")
 * @param opts.fallback  Return value for falsy/zero input (default "TBD")
 */
export function formatDate(
  input: number | string | undefined | null,
  opts: {
    month?: 'short' | 'long';
    includeDay?: boolean;
    locale?: Locale | string;
    fallback?: string;
  } = {},
): string {
  const {
    month = 'short',
    includeDay = true,
    locale = 'en',
    fallback = 'TBD',
  } = opts;

  if (input == null || input === 0 || input === '') return fallback;

  // Pass-through for pre-formatted strings (e.g. "Jan 15, 2025")
  if (typeof input === 'string' && !/^\d{4}-/.test(input) && !/^\d+$/.test(input)) {
    return input;
  }

  let date: Date;
  if (typeof input === 'number') {
    date = new Date(input);
  } else if (/^\d{4}-\d{2}$/.test(input)) {
    // "YYYY-MM" → first of month in UTC
    const [y, m] = input.split('-');
    date = new Date(Date.UTC(parseInt(y!), parseInt(m!) - 1, 1));
  } else {
    // Date string — append time to avoid timezone shift
    date = new Date(input.includes('T') ? input : input + 'T00:00:00');
  }

  const intlLocale = LOCALE_MAP[locale] || locale;
  const options: Intl.DateTimeFormatOptions = {
    month,
    year: 'numeric',
  };
  if (includeDay) {
    options.day = 'numeric';
  }

  return date.toLocaleDateString(intlLocale, options);
}

/**
 * Format a timestamp as a relative time string for inbox/list UIs.
 *
 * Returns "3m ago", "2h ago", "Yesterday", or "Mon DD" (same year) / "Mon DD, YYYY".
 *
 * @param timestamp  Unix timestamp in milliseconds
 * @param opts.suffix  Append " ago" to minute/hour values (default true).
 *                     Set false for compact display ("3m", "2h").
 */
export function formatRelativeDate(
  timestamp: number,
  opts: { suffix?: boolean } = {},
): string {
  const { suffix = true } = opts;

  if (!timestamp || timestamp === 0) return 'TBD';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const ago = suffix ? ' ago' : '';

  if (diffHours < 1) return `${Math.floor(diffMs / (1000 * 60))}m${ago}`;
  if (diffHours < 24) return `${Math.floor(diffHours)}h${ago}`;
  if (diffHours < 48) return 'Yesterday';

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
