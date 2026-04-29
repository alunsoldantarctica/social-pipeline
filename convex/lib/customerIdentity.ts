import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function resolveOrCreateCustomer(
  ctx: MutationCtx,
  _email: string,
): Promise<string | null> {
  return null;
}

export async function resolveCustomerByEmail(
  ctx: QueryCtx,
  _email: string,
): Promise<string | null> {
  return null;
}
