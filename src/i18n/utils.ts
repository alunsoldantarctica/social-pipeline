import type { Locale } from "./types";
import { DEFAULT_LOCALE } from "./types";

export function localePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return `/${locale}${path}`;
}
