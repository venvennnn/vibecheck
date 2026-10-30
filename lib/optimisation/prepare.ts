import { confirmedGates, defaultAllocation, isBlocked } from "@/lib/evidence/commercial";
import type { CampaignBrief, Candidate, CommercialEvidence, Portfolio, Weights } from "@/lib/schemas";
import { optimise, type OptimiseCandidate, type OptimiseInput, type OptimiseResult } from "@/lib/optimisation/optimise";

export function toOptimiseInput(
  candidates: Candidate[],
  commercial: CommercialEvidence[],
  brief: Pick<CampaignBrief, "budget" | "currency" | "startDate" | "endDate" | "constraints" | "excludedPartnerIds">,
  weights: Weights,
  extraExcluded: string[] = [],
  now = Date.now(),
): OptimiseInput {
  const byId = new Map(commercial.map((item) => [item.candidateId, item]));
  const allocation = defaultAllocation(brief.budget, brief.constraints.partnerCount, weights.contingency);
  const blockedIds: string[] = [];
  const prepared: OptimiseCandidate[] = candidates.map((candidate) => {
    const evidence = byId.get(candidate.id);
    if (isBlocked(evidence)) blockedIds.push(candidate.id);
    const quote =
      evidence && confirmedGates(evidence, brief, now).ok && evidence.priceHigh != null
        ? evidence.priceHigh
        : null;
    const declared = evidence?.allocation ?? null;
    return {
      id: candidate.id,
      name: candidate.name,
      domain: candidate.entityType,
      tags: candidate.tags,
      affinity: candidate.affinity,
      planningCost: quote ?? declared ?? allocation,
      costKind: quote != null ? "quote" : "allocation",
    };
  });
  return {
    candidates: prepared,
    partnerCount: brief.constraints.partnerCount,
    minCategories: brief.constraints.minCategories,
    maxPerCategory: brief.constraints.maxPerCategory,
    pinnedIds: brief.constraints.pinnedIds,
    excludedIds: [...brief.excludedPartnerIds, ...extraExcluded],
    blockedIds,
    budget: brief.budget,
    weights,
  };
}

export function portfolioFromResult(result: OptimiseResult, candidates: Candidate[]): Portfolio {
  const names = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));
  const unresolved = result.selectedIds
    .filter((id) => {
      const candidate = candidates.find((item) => item.id === id);
      return candidate?.affinity == null;
    })
    .map((id) => `Qloo affinity is unavailable for ${names.get(id) ?? id}.`);
  return {
    selectedIds: result.selectedIds,
    objectiveComponents: result.objectiveComponents,
    planningTotal: result.planningTotal,
    contingencyTotal: result.contingencyTotal,
    assumptions: result.assumptions,
    unresolvedChecks: unresolved,
    feasibility: result.feasibility,
    bindingIssues: result.bindingIssues,
    adjustments: result.adjustments,
    optimalWithinPool: result.optimalWithinPool,
    poolIds: result.poolIds,
    heldBackIds: result.heldBackIds,
    combinationsConsidered: result.combinationsConsidered,
  };
}

export function optimisePortfolio(
  candidates: Candidate[],
  commercial: CommercialEvidence[],
  brief: CampaignBrief,
  weights: Weights,
  extraExcluded: string[] = [],
  now = Date.now(),
): Portfolio {
  const result = optimise(toOptimiseInput(candidates, commercial, brief, weights, extraExcluded, now));
  const portfolio = portfolioFromResult(result, candidates);
  const missingCommercial = result.selectedIds.filter((id) => {
    const evidence = commercial.find((item) => item.candidateId === id);
    return !evidence || !confirmedGates(evidence, brief, now).ok;
  });
  portfolio.unresolvedChecks = [
    ...portfolio.unresolvedChecks,
    ...missingCommercial.map((id) => {
      const name = candidates.find((candidate) => candidate.id === id)?.name ?? id;
      return `Commercial check still open for ${name}.`;
    }),
  ];
  return portfolio;
}
