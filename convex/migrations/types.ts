export type MigrationHandler = (ctx: MutationCtx) => Promise<string>;
export type MutationCtx = any; // matches existing usage

export interface Migration {
  /** Unique, immutable name. Convention: YYYY-MM-DD_short-description */
  name: string;
  /** Idempotent handler — safe to run multiple times */
  handler: MigrationHandler;
}
