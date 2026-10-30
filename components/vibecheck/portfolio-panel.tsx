"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { money } from "@/components/vibecheck/format";
import type { CampaignBrief, Candidate, Portfolio, Weights } from "@/lib/schemas";

export function PortfolioPanel({
  brief,
  candidates,
  portfolio,
  weights,
  onWeights,
  onRemove,
  onBuild,
  busy,
}: {
  brief: CampaignBrief | { budget: number; currency: string; constraints: { partnerCount: number } };
  candidates: Candidate[];
  portfolio: Portfolio | null;
  weights: Weights;
  onWeights: (weights: Partial<Weights>) => void;
  onRemove: (id: string) => void;
  onBuild: () => void;
  busy?: boolean;
}) {
  const selected = portfolio?.selectedIds ?? [];
  const slots = Math.max(brief.constraints.partnerCount, selected.length);
  return (
    <div>
      <p className="text-[12px] uppercase tracking-[0.14em] text-[#626262]">Portfolio</p>
      <ul className="mt-4 space-y-3">
        {Array.from({ length: slots }, (_, index) => {
          const id = selected[index];
          const candidate = candidates.find((item) => item.id === id);
          if (!candidate) {
            return (
              <li key={`empty-${index}`} className="flex min-h-16 items-center border border-dashed border-[#DEDEDE] px-3 text-[14px] text-[#626262]">
                Unselected
              </li>
            );
          }
          return (
            <li key={candidate.id} className="flex min-h-16 items-center gap-3 border border-[#DEDEDE] bg-white px-2">
              <div className="size-12 shrink-0 bg-[#F3F3F3]">
                {candidate.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={candidate.imageUrl} alt="" className="size-12 object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{candidate.name}</p>
                <p className="text-[12px] uppercase tracking-[0.12em] text-[#626262]">{candidate.category}</p>
              </div>
              <button type="button" className="min-h-11 px-2 text-[13px]" data-testid="remove-partner" onClick={() => onRemove(candidate.id)}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 space-y-4">
        <Weight label="Cultural fit" value={weights.fit} max={2} onChange={(fit) => onWeights({ fit })} />
        <Weight label="Variety" value={weights.variety} max={2} onChange={(variety) => onWeights({ variety })} />
        <Weight label="Cost" value={weights.cost} max={2} onChange={(cost) => onWeights({ cost })} />
        <details>
          <summary className="min-h-11 cursor-pointer text-[14px]">Advanced similarity and contingency</summary>
          <div className="space-y-4 pt-3">
            <Weight label="Similarity penalty" value={weights.similarity} max={2} onChange={(similarity) => onWeights({ similarity })} />
            <Weight label="Contingency" value={weights.contingency} max={0.5} step={0.05} onChange={(contingency) => onWeights({ contingency })} />
          </div>
        </details>
      </div>
      <dl className="mt-6 border-t border-[#DEDEDE] pt-4 text-[14px]">
        <div className="flex justify-between gap-4">
          <dt className="text-[#626262]">Planning budget</dt>
          <dd>{money(brief.budget, brief.currency)}</dd>
        </div>
        <div className="mt-2 flex justify-between gap-4">
          <dt className="text-[#626262]">Planning total</dt>
          <dd>{portfolio ? money(portfolio.contingencyTotal, brief.currency) : "—"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[13px] text-[#626262]">Allocations are not quotes.</p>
      {portfolio?.feasibility === "infeasible" && (
        <div className="mt-4 border border-[#DEDEDE] p-3 text-[14px]">
          <p>This mix does not fit the hard constraints.</p>
          <ul className="mt-2 list-disc pl-4">
            {portfolio.bindingIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <ul className="mt-2">
            {portfolio.adjustments.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {portfolio?.optimalWithinPool && portfolio.feasibility === "feasible" && (
        <p className="mt-3 text-[13px] text-[#626262]">Optimal inside this pool of {portfolio.poolIds.length}. Not a claim about every possible partner.</p>
      )}
      <Button className="mt-6 w-full" onClick={onBuild} disabled={busy || portfolio?.feasibility !== "feasible"}>
        Build my portfolio
      </Button>
    </div>
  );
}

function Weight({
  label,
  value,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[13px]">
      <span className="mb-1 flex justify-between">
        <span>{label}</span>
        <span className="text-[#626262]">{value.toFixed(2)}</span>
      </span>
      <Slider aria-label={label} min={0} max={max} step={step} value={[value]} onValueChange={([next]) => onChange(next)} />
    </label>
  );
}
