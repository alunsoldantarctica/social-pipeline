/**
 * Pure cost helpers — used by catalog queries, pipeline runner, and admin UI.
 *
 * Token prices on modelCatalog rows are stored as USD per 1M tokens.
 * Web search price is stored as USD per 1k searches.
 */

import type { PipelineStep } from "./eligibility";

export interface CostAssumption {
  step: PipelineStep;
  inputTokens: number;
  outputTokens: number;
  webSearches?: number;
  revisions?: number;
}

export interface PriceModel {
  promptPrice: number; // USD per 1M tokens
  completionPrice: number;
  webSearchPrice?: number; // USD per 1k searches
}

export function estimateStepCost(
  model: PriceModel,
  assumption: CostAssumption,
): number {
  const input = (assumption.inputTokens / 1_000_000) * model.promptPrice;
  const output = (assumption.outputTokens / 1_000_000) * model.completionPrice;
  const search =
    assumption.webSearches && model.webSearchPrice
      ? (assumption.webSearches / 1000) * model.webSearchPrice
      : 0;
  const perCall = input + output + search;
  // Revisions apply only to draft in the default assumptions; treat as a
  // multiplier of perCall (1 revision => runs twice).
  const runs = (assumption.revisions ?? 0) + 1;
  return perCall * runs;
}

/**
 * Compute realised cost from actual token usage (per-call).
 * usage matches the shape returned by @ai-sdk Vercel AI SDK:
 *   { promptTokens, completionTokens }
 * webSearches is optional and only billed for models with webSearchPrice.
 */
export function actualCallCost(
  model: PriceModel,
  usage: { promptTokens: number; completionTokens: number },
  webSearches = 0,
): number {
  const input = (usage.promptTokens / 1_000_000) * model.promptPrice;
  const output =
    (usage.completionTokens / 1_000_000) * model.completionPrice;
  const search =
    webSearches && model.webSearchPrice
      ? (webSearches / 1000) * model.webSearchPrice
      : 0;
  return input + output + search;
}

/**
 * Color bucket used by the workflow detail "actual vs estimate" chip.
 *   actual <= estimate       → green
 *   actual <= 1.5 * estimate → yellow
 *   otherwise                → red
 */
export function costBucket(
  actual: number,
  estimate: number,
): "green" | "yellow" | "red" {
  if (estimate <= 0) return "yellow";
  const ratio = actual / estimate;
  if (ratio <= 1) return "green";
  if (ratio <= 1.5) return "yellow";
  return "red";
}
