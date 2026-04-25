import { ConvexError } from "convex/values";

/**
 * Standardized error codes for Convex functions.
 * Use ConvexError (not plain Error) so the admin UI can parse structured error data.
 */
export type ErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "REFERENCE_CONSTRAINT"
  | "INVALID_STATE"
  | "INVALID_INPUT"
  | "EXTERNAL_SERVICE";

export interface AppErrorData {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Create a structured ConvexError with an error code. */
export function appError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new ConvexError<AppErrorData>({ code, message, details });
}

/**
 * Type-narrowing assertion that throws NOT_FOUND if the value is null/undefined.
 *
 * @example
 * const carrier = await ctx.db.get(id);
 * assertExists(carrier, "Carrier"); // narrows to non-null
 */
export function assertExists<T>(
  doc: T | null | undefined,
  entityName: string,
): asserts doc is T {
  if (doc === null || doc === undefined) {
    throw new ConvexError<AppErrorData>({
      code: "NOT_FOUND",
      message: `${entityName} not found`,
    });
  }
}

/**
 * Throws REFERENCE_CONSTRAINT if refCount > 0.
 *
 * @example
 * const planRefs = allPlans.filter(p => p.carrierId === id);
 * assertNoReferences(planRefs.length, "insurance plan", "carrier");
 */
export function assertNoReferences(
  refCount: number,
  refEntityName: string,
  targetEntityName: string,
): void {
  if (refCount > 0) {
    throw new ConvexError<AppErrorData>({
      code: "REFERENCE_CONSTRAINT",
      message: `Cannot delete: ${refCount} ${refEntityName}(s) reference this ${targetEntityName}`,
      details: { refCount, refEntityName, targetEntityName },
    });
  }
}
