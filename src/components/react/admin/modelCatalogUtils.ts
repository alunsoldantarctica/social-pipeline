export type PipelineStep = "research" | "outline" | "draft";

export const PIPELINE_STEPS: PipelineStep[] = ["research", "outline", "draft"];

export const PIPELINE_STEP_LABEL: Record<PipelineStep, string> = {
  research: "Research",
  outline: "Outline",
  draft: "Draft",
};

export interface ModelOption {
  id: string;
  displayName: string;
  provider: string;
}

export function modelOptionsForStep(
  models: Array<{ id: string; displayName: string; provider?: string; recommendedFor: string[] }>,
  step: PipelineStep,
): ModelOption[] {
  return models
    .filter((m) => m.recommendedFor.includes(step))
    .map((m) => ({ id: m.id, displayName: m.displayName, provider: m.provider ?? "openrouter" }));
}
