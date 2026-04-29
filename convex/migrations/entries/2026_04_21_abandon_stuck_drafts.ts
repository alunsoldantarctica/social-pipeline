import type { MutationCtx } from "../types";

// No-op: referenced `quotes` table from original project, not present in this scaffold.
export async function handler(_ctx: MutationCtx): Promise<string> {
  return "skipped — quotes table not present in this deployment";
}
