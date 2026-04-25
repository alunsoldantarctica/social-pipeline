import type { DatabaseReader } from "../_generated/server";

export type AgentKey =
  | "research"
  | "outline"
  | "draft"
  | "translate"
  | "competitor-tagger"
  | "brief-generator";

export type ModelProvider = "google" | "openrouter" | "workers-ai";

export interface StageTokenEstimate {
  inputTokens: number;
  outputTokens: number;
}

export interface StageCostEstimate extends StageTokenEstimate {
  stage: AgentKey;
  provider: ModelProvider;
  model: string;
  estimatedCostCents: number;
}

export interface WorkflowCostEstimate {
  stages: StageCostEstimate[];
  totalEstimatedCostCents: number;
  maxAllowedCostCents: number;
  maxBatchCostCents: number;
  currency: "USD";
}

const DEFAULT_STAGE_TOKENS: Record<AgentKey, StageTokenEstimate> = {
  research: { inputTokens: 4_000, outputTokens: 6_000 },
  outline: { inputTokens: 6_000, outputTokens: 3_000 },
  draft: { inputTokens: 10_000, outputTokens: 12_000 },
  translate: { inputTokens: 8_000, outputTokens: 8_000 },
  "competitor-tagger": { inputTokens: 6_000, outputTokens: 1_200 },
  "brief-generator": { inputTokens: 8_000, outputTokens: 3_000 },
};

const DEFAULT_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google:gemini-2.5-flash": { input: 0.30, output: 2.50 },
  "google:gemini-2.5-pro": { input: 1.25, output: 10.00 },
  "openrouter:perplexity/sonar": { input: 1.00, output: 1.00 },
  "workers-ai:@cf/meta/llama-3.1-8b-instruct-fast": { input: 0.03, output: 0.05 },
};

const DEFAULT_WORKFLOW_CAP_CENTS = 500;
const DEFAULT_BATCH_CAP_CENTS = 2_500;

function centsForTokens(
  inputTokens: number,
  outputTokens: number,
  inputCostPerMillionTokens: number,
  outputCostPerMillionTokens: number,
) {
  return Math.ceil(
    ((inputTokens / 1_000_000) * inputCostPerMillionTokens +
      (outputTokens / 1_000_000) * outputCostPerMillionTokens) *
      100,
  );
}

export async function getContentBudgetSettings(db: DatabaseReader) {
  const settings = await db
    .query("siteSettings")
    .withIndex("by_key", (q) => q.eq("key", "contentPipeline"))
    .first();

  return {
    maxWorkflowCostCents:
      settings?.contentMaxWorkflowCostCents ?? DEFAULT_WORKFLOW_CAP_CENTS,
    maxBatchCostCents:
      settings?.contentMaxBatchCostCents ?? DEFAULT_BATCH_CAP_CENTS,
    requireBudgetPreflight:
      settings?.contentRequireBudgetPreflight ?? true,
  };
}

async function getAgentConfig(db: DatabaseReader, key: AgentKey) {
  const config = await db
    .query("agentConfigs")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (config) {
    return {
      provider: config.provider as ModelProvider,
      model: config.model,
    };
  }

  const defaults: Record<AgentKey, { provider: ModelProvider; model: string }> = {
    research: { provider: "openrouter", model: "perplexity/sonar" },
    outline: { provider: "google", model: "gemini-2.5-flash" },
    draft: { provider: "google", model: "gemini-2.5-flash" },
    translate: { provider: "google", model: "gemini-2.5-flash" },
    "competitor-tagger": {
      provider: "workers-ai",
      model: "@cf/meta/llama-3.1-8b-instruct-fast",
    },
    "brief-generator": { provider: "google", model: "gemini-2.5-flash" },
  };
  return defaults[key];
}

export async function estimateAgentCost(
  db: DatabaseReader,
  stage: AgentKey,
  tokens = DEFAULT_STAGE_TOKENS[stage],
): Promise<StageCostEstimate> {
  const config = await getAgentConfig(db, stage);
  const model = await db
    .query("availableModels")
    .withIndex("by_provider_and_modelId", (q) =>
      q.eq("provider", config.provider).eq("modelId", config.model),
    )
    .first();

  const defaultPricing = DEFAULT_MODEL_PRICING[`${config.provider}:${config.model}`];
  const inputCostPerMillionTokens =
    model?.inputCostPerMillionTokens ?? defaultPricing?.input ?? 0;
  const outputCostPerMillionTokens =
    model?.outputCostPerMillionTokens ?? defaultPricing?.output ?? 0;

  return {
    stage,
    provider: config.provider,
    model: config.model,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    estimatedCostCents: centsForTokens(
      tokens.inputTokens,
      tokens.outputTokens,
      inputCostPerMillionTokens,
      outputCostPerMillionTokens,
    ),
  };
}

export async function estimateArticleWorkflowCost(
  db: DatabaseReader,
): Promise<WorkflowCostEstimate> {
  const settings = await getContentBudgetSettings(db);
  const stages = [
    await estimateAgentCost(db, "research"),
    await estimateAgentCost(db, "outline"),
    await estimateAgentCost(db, "draft"),
  ];
  return {
    stages,
    totalEstimatedCostCents: stages.reduce(
      (sum, stage) => sum + stage.estimatedCostCents,
      0,
    ),
    maxAllowedCostCents: settings.maxWorkflowCostCents,
    maxBatchCostCents: settings.maxBatchCostCents,
    currency: "USD",
  };
}

export function multiplyWorkflowEstimate(
  estimate: WorkflowCostEstimate,
  count: number,
) {
  return {
    ...estimate,
    workflowCount: count,
    batchEstimatedCostCents: estimate.totalEstimatedCostCents * count,
  };
}
