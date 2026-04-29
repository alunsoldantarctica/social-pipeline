export type PipelineStep = "research" | "outline" | "draft";

export const ALL_STEPS: PipelineStep[] = ["research", "outline", "draft"];

export function isEligibleForStep(
  recommendedFor: PipelineStep[],
  step: PipelineStep,
): boolean {
  return recommendedFor.includes(step);
}
