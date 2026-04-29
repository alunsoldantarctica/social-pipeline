import type { Locale } from "./types";
import { translations } from "./translations";

export function t(locale: Locale, key: string, vars?: Record<string, string>): string {
  const dict = translations[locale] ?? translations["en"] ?? {};
  let val = dict[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      val = val.replace(`{${k}}`, v);
    }
  }
  return val;
}

export type { Locale };
