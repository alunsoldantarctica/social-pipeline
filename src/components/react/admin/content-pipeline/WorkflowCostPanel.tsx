import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { cn } from '../../../../lib/utils';
import { Loader2 } from 'lucide-react';
import {
  type PipelineStep,
  PIPELINE_STEPS,
  PIPELINE_STEP_LABEL,
  modelOptionsForStep,
} from '../modelCatalogUtils';

type Step = PipelineStep;
const STEPS = PIPELINE_STEPS;
const STEP_LABEL = PIPELINE_STEP_LABEL;

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function bucket(actual: number, estimate: number): 'green' | 'yellow' | 'red' {
  if (estimate <= 0) return 'yellow';
  const r = actual / estimate;
  if (r <= 1) return 'green';
  if (r <= 1.5) return 'yellow';
  return 'red';
}

export function WorkflowCostPanel({
  workflowId,
}: {
  workflowId: Id<'articleWorkflows'>;
}) {
  const data = useQuery(api.catalog.workflow.estimateForWorkflow, {
    workflowRecordId: workflowId,
  });
  const catalog = useQuery(api.catalog.queries.list, { enabledOnly: true });
  const setOverride = useMutation(api.catalog.workflow.setModelOverride);

  if (data === undefined || catalog === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading cost…
      </div>
    );
  }

  const optionsForStep = (s: Step) => modelOptionsForStep(catalog, s);

  const totalEst = data.totalEstimate;
  const actual = data.actualCostUsd;
  const ran = actual > 0;
  const color = ran ? bucket(actual, totalEst) : null;

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Pipeline cost
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-300">
            Est: <span className="tabular-nums text-slate-100">{fmtUsd(totalEst)}</span>
          </span>
          {ran && (
            <span
              className={cn(
                'px-2 py-0.5 rounded tabular-nums',
                color === 'green' && 'bg-emerald-900/40 text-emerald-300',
                color === 'yellow' && 'bg-amber-900/40 text-amber-300',
                color === 'red' && 'bg-red-900/40 text-red-300',
              )}
            >
              Actual: {fmtUsd(actual)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {STEPS.map((s) => {
          const per = data.perStep[s];
          const actualStep = (data.stepCosts as any)?.[s];
          const options = optionsForStep(s);
          return (
            <div
              key={s}
              className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 uppercase tracking-wide">
                  {STEP_LABEL[s]}
                </span>
                <span className="tabular-nums text-slate-300">
                  {fmtUsd(per.estimate)}
                  {actualStep != null && (
                    <span className="text-slate-500">
                      {' '}
                      / {fmtUsd(actualStep)}
                    </span>
                  )}
                </span>
              </div>
              <select
                value={per.modelId ?? ''}
                onChange={async (e) => {
                  await setOverride({
                    workflowRecordId: workflowId,
                    step: s,
                    modelId: e.target.value || null,
                  });
                }}
                className="w-full text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 px-2 py-1"
              >
                <option value="">— use default —</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
