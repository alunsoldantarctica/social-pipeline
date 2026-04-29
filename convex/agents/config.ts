import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { buildGatewayBaseUrl, buildGatewayHeaders, GATEWAY_HOST } from "../lib/aiGateway";

export type GatewayProvider = "openrouter" | "workers-ai";

function getGatewayConfig() {
  const accountId = process.env.CF_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const gatewayName = process.env.CF_AI_GATEWAY_NAME ?? process.env.CLOUDFLARE_AI_GATEWAY_NAME ?? "social-pipeline";
  const token = process.env.CLOUDFLARE_AI_GATEWAY_TOKEN ?? process.env.CF_AI_GATEWAY_TOKEN ?? "";
  return { accountId, gatewayName, token };
}

export function createModelFromConfig(provider: GatewayProvider, modelId: string) {
  const cfg = getGatewayConfig();
  const baseURL =
    provider === "workers-ai"
      ? `https://${GATEWAY_HOST}/v1/${cfg.accountId}/${cfg.gatewayName}/workers-ai`
      : buildGatewayBaseUrl(cfg as any);

  const openrouter = createOpenAICompatible({
    name: provider,
    baseURL,
    headers: buildGatewayHeaders(cfg as any),
  });
  return openrouter(modelId);
}

// Default per-stage agent configs seeded by the init migration
export const defaultConfigs = [
  {
    key: "research",
    provider: "openrouter" as GatewayProvider,
    model: "perplexity/sonar-pro",
    description: "Research agent — web-grounded deep research",
    createdAt: Date.now(),
  },
  {
    key: "outline",
    provider: "openrouter" as GatewayProvider,
    model: "google/gemini-2.5-flash-preview",
    description: "Outline agent — structure and planning",
    createdAt: Date.now(),
  },
  {
    key: "draft",
    provider: "openrouter" as GatewayProvider,
    model: "anthropic/claude-sonnet-4-5",
    description: "Draft agent — full content generation",
    createdAt: Date.now(),
  },
];

// Seed catalog for the availableModels table
export const availableModelsSeed = [
  {
    provider: "openrouter",
    modelId: "perplexity/sonar-pro",
    displayName: "Perplexity Sonar Pro",
    description: "Best for research — real-time web search",
    gatewayEndpoint: "openrouter",
    category: "chat" as const,
    isRecommended: true,
    order: 1,
    inputCostPerMillionTokens: 3,
    outputCostPerMillionTokens: 15,
    createdAt: Date.now(),
  },
  {
    provider: "openrouter",
    modelId: "anthropic/claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    description: "High quality drafts with strong instruction following",
    gatewayEndpoint: "openrouter",
    category: "chat" as const,
    isRecommended: true,
    order: 2,
    inputCostPerMillionTokens: 3,
    outputCostPerMillionTokens: 15,
    createdAt: Date.now(),
  },
  {
    provider: "openrouter",
    modelId: "google/gemini-2.5-flash-preview",
    displayName: "Gemini 2.5 Flash",
    description: "Fast and cheap — good for outlines and structured tasks",
    gatewayEndpoint: "openrouter",
    category: "chat" as const,
    isRecommended: true,
    order: 3,
    inputCostPerMillionTokens: 0.15,
    outputCostPerMillionTokens: 0.6,
    createdAt: Date.now(),
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-4o",
    displayName: "GPT-4o",
    description: "OpenAI flagship model",
    gatewayEndpoint: "openrouter",
    category: "chat" as const,
    isRecommended: false,
    order: 4,
    inputCostPerMillionTokens: 2.5,
    outputCostPerMillionTokens: 10,
    createdAt: Date.now(),
  },
];
