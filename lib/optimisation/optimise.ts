import type { EntityType } from "@/lib/domains";
import type { Weights } from "@/lib/schemas";

export const POOL_LIMIT = 40;
/** Declared fallback when either candidate has no tags. This estimates redundancy, not audience overlap. */
export const SAME_CATEGORY_TAG_FALLBACK = 0.5;

export type OptimiseCandidate = {
  id: string;
  name: string;
  domain: EntityType;
  tags: string[];
  affinity: number | null;
  planningCost: number;
  costKind: "quote" | "allocation";
};

export type OptimiseInput = {
  candidates: OptimiseCandidate[];
  partnerCount: number;
  minCategories: number;
  maxPerCategory: number;
  pinnedIds: string[];
  excludedIds: string[];
  blockedIds: string[];
  budget: number;
  weights: Weights;
};

export type OptimiseResult = {
  feasibility: "feasible" | "infeasible";
  selectedIds: string[];
  objectiveComponents: { fit: number; variety: number; similarity: number; cost: number; total: number };
  planningTotal: number;
  contingencyTotal: number;
  assumptions: string[];
  bindingIssues: string[];
  adjustments: string[];
  optimalWithinPool: boolean;
  poolIds: string[];
  heldBackIds: string[];
  combinationsConsidered: number;
};

const EMPTY_SCORE = { fit: 0, variety: 0, similarity: 0, cost: 0, total: 0 };

function compareAffinity(a: OptimiseCandidate, b: OptimiseCandidate): number {
  if (a.affinity == null && b.affinity == null) return a.id.localeCompare(b.id);
  if (a.affinity == null) return 1;
  if (b.affinity == null) return -1;
  if (a.affinity !== b.affinity) return b.affinity - a.affinity;
  return a.id.localeCompare(b.id);
}

export function rankUtilities(candidates: Pick<OptimiseCandidate, "id" | "domain" | "affinity">[]): Map<string, number> {
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const list = groups.get(candidate.domain) ?? [];
    list.push(candidate);
    groups.set(candidate.domain, list);
  }
  const utilities = new Map<string, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      if (a.affinity == null && b.affinity == null) return a.id.localeCompare(b.id);
      if (a.affinity == null) return 1;
      if (b.affinity == null) return -1;
      if (a.affinity !== b.affinity) return b.affinity - a.affinity;
      return a.id.localeCompare(b.id);
    });
    const count = sorted.length;
    let index = 0;
    while (index < count) {
      let end = index;
      while (end < count && sorted[end].affinity === sorted[index].affinity) end += 1;
      const averageRank = (index + 1 + end) / 2;
      const utility = (count - averageRank + 1) / count;
      for (let cursor = index; cursor < end; cursor += 1) utilities.set(sorted[cursor].id, utility);
      index = end;
    }
  }
  return utilities;
}

export function pairSimilarity(a: Pick<OptimiseCandidate, "domain" | "tags">, b: Pick<OptimiseCandidate, "domain" | "tags">): number {
  if (!a.tags.length || !b.tags.length) return a.domain === b.domain ? SAME_CATEGORY_TAG_FALLBACK : 0;
  const left = new Set(a.tags);
  const right = new Set(b.tags);
  let intersection = 0;
  for (const tag of left) if (right.has(tag)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function scoreSet(selected: OptimiseCandidate[], utilities: Map<string, number>, budget: number, weights: Weights) {
  const fit = selected.reduce((sum, candidate) => sum + (utilities.get(candidate.id) ?? 0), 0);
  const variety = new Set(selected.map((candidate) => candidate.domain)).size;
  let similarity = 0;
  let pairs = 0;
  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) {
      similarity += pairSimilarity(selected[i], selected[j]);
      pairs += 1;
    }
  }
  if (pairs) similarity /= pairs;
  const planning = selected.reduce((sum, candidate) => sum + candidate.planningCost, 0);
  const cost = budget > 0 ? planning / budget : planning > 0 ? Number.POSITIVE_INFINITY : 0;
  const total = weights.fit * fit + weights.variety * variety - weights.similarity * similarity - weights.cost * cost;
  return { fit, variety, similarity, cost, total, planning };
}

export function selectPool(candidates: OptimiseCandidate[], pinnedIds: string[], limit = POOL_LIMIT) {
  const pinSet = new Set(pinnedIds);
  const pins = candidates.filter((candidate) => pinSet.has(candidate.id));
  const groups = new Map<string, OptimiseCandidate[]>();
  for (const candidate of candidates) {
    if (pinSet.has(candidate.id)) continue;
    const list = groups.get(candidate.domain) ?? [];
    list.push(candidate);
    groups.set(candidate.domain, list);
  }
  for (const list of groups.values()) list.sort(compareAffinity);
  const domains = [...groups.keys()].sort();
  const rest: OptimiseCandidate[] = [];
  let progressed = true;
  while (pins.length + rest.length < limit && progressed) {
    progressed = false;
    for (const domain of domains) {
      const list = groups.get(domain);
      if (!list?.length) continue;
      rest.push(list.shift()!);
      progressed = true;
      if (pins.length + rest.length === limit) break;
    }
  }
  return {
    pool: [...pins, ...rest],
    heldBack: [...groups.values()].flat(),
  };
}

function categoryCounts(selected: OptimiseCandidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of selected) counts.set(candidate.domain, (counts.get(candidate.domain) ?? 0) + 1);
  return counts;
}

function respectsMax(selected: OptimiseCandidate[], maxPerCategory: number): boolean {
  for (const count of categoryCounts(selected).values()) if (count > maxPerCategory) return false;
  return true;
}

function eachCombination(items: OptimiseCandidate[], count: number, visit: (combo: OptimiseCandidate[]) => void) {
  const size = items.length;
  if (count === 0) {
    visit([]);
    return;
  }
  if (count > size) return;
  const index = Array.from({ length: count }, (_, i) => i);
  while (true) {
    visit(index.map((item) => items[item]));
    let pointer = count - 1;
    while (pointer >= 0 && index[pointer] === size - count + pointer) pointer -= 1;
    if (pointer < 0) break;
    index[pointer] += 1;
    for (let next = pointer + 1; next < count; next += 1) index[next] = index[next - 1] + 1;
  }
}

function baseAssumptions(heldBack: number, pool: number): string[] {
  return [
    "Rank utility is an average-tie rank inside each domain. It is a product heuristic, not a cross-domain probability.",
    `Tag overlap is mean pairwise Jaccard. When tags are missing, same-category pairs use ${SAME_CATEGORY_TAG_FALLBACK}; other pairs use 0. This estimates redundancy, not audience overlap.`,
    "Qloo affinity is not a match percentage, a price, or predicted lift.",
    heldBack
      ? `Optimality is only inside this pool of ${pool}. ${heldBack} other discoveries stay in the expandable list.`
      : `Optimality is only inside this pool of ${pool}.`,
  ];
}

export function optimise(input: OptimiseInput): OptimiseResult {
  const excluded = new Set([...input.excludedIds, ...input.blockedIds]);
  const eligible = input.candidates.filter((candidate) => !excluded.has(candidate.id));
  const pins = input.pinnedIds.map((id) => eligible.find((candidate) => candidate.id === id) ?? null);
  const assumptions = ["Allocations are not quotes unless a sourced upper bound passed the commercial checks."];
  const fail = (issues: string[], adjustments: string[], poolIds: string[] = [], heldBackIds: string[] = []): OptimiseResult => ({
    feasibility: "infeasible",
    selectedIds: input.pinnedIds.filter((id) => eligible.some((candidate) => candidate.id === id)),
    objectiveComponents: EMPTY_SCORE,
    planningTotal: 0,
    contingencyTotal: 0,
    assumptions,
    bindingIssues: issues,
    adjustments,
    optimalWithinPool: false,
    poolIds,
    heldBackIds,
    combinationsConsidered: 0,
  });

  if (pins.some((pin) => !pin)) {
    return fail(
      ["A pinned partner is excluded, blocked, or missing from the discovered pool."],
      ["Unpin that partner, or clear the commercial block if the check was wrong."],
    );
  }
  const pinned = pins.filter((pin): pin is OptimiseCandidate => Boolean(pin));
  if (pinned.length > input.partnerCount) {
    return fail(
      ["Pinned partners exceed the exact partner count."],
      ["Raise the partner count or unpin one partner."],
    );
  }
  if (!respectsMax(pinned, input.maxPerCategory)) {
    return fail(
      ["Pinned partners already exceed the maximum per category."],
      ["Raise the per-category maximum or unpin a partner in that category."],
    );
  }
  const { pool, heldBack } = selectPool(eligible, input.pinnedIds);
  assumptions.push(...baseAssumptions(heldBack.length, pool.length));
  const pinIds = new Set(pinned.map((pin) => pin.id));
  const rest = pool.filter((candidate) => !pinIds.has(candidate.id));
  const slots = input.partnerCount - pinned.length;
  if (rest.length < slots) {
    return fail(
      [`Need ${input.partnerCount} eligible partners. The pool has ${pinned.length + rest.length}.`],
      ["Run another discovery, lower the partner count, or remove a commercial block."],
      pool.map((candidate) => candidate.id),
      heldBack.map((candidate) => candidate.id),
    );
  }

  const utilities = rankUtilities(pool);
  const bestBox: {
    value: { selected: OptimiseCandidate[]; score: ReturnType<typeof scoreSet>; key: string } | null;
  } = { value: null };
  let considered = 0;
  let passMax = 0;
  let passMinAndMax = 0;
  let passBudget = 0;
  eachCombination(rest, slots, (combo) => {
    const selected = [...pinned, ...combo];
    considered += 1;
    const maxOk = respectsMax(selected, input.maxPerCategory);
    if (maxOk) passMax += 1;
    const minOk = new Set(selected.map((candidate) => candidate.domain)).size >= input.minCategories;
    if (maxOk && minOk) passMinAndMax += 1;
    const planning = selected.reduce((sum, candidate) => sum + candidate.planningCost, 0);
    const contingencyTotal = planning * (1 + input.weights.contingency);
    const budgetOk = contingencyTotal <= input.budget + 1e-6;
    if (budgetOk) passBudget += 1;
    if (!maxOk || !minOk || !budgetOk) return;
    const score = scoreSet(selected, utilities, input.budget, input.weights);
    const key = selected.map((candidate) => candidate.id).sort().join("|");
    const current = bestBox.value;
    if (!current || score.total > current.score.total + 1e-9 || (Math.abs(score.total - current.score.total) <= 1e-9 && key < current.key)) {
      bestBox.value = { selected, score, key };
    }
  });

  const best = bestBox.value;
  if (!best) {
    const issues: string[] = [];
    const adjustments: string[] = [];
    if (passMax === 0) {
      issues.push("Every combination breaks the maximum partners per category.");
      adjustments.push("Raise the per-category maximum.");
    } else if (passMinAndMax === 0) {
      issues.push("No combination covers the minimum number of categories.");
      adjustments.push("Lower the minimum categories, or discover another domain.");
    } else {
      issues.push("No combination stays inside the budget once contingency is included.");
      adjustments.push("Raise the budget, lower contingency, or replace a sourced quote with an exploratory allocation.");
    }
    if (passBudget === 0 && passMinAndMax > 0) {
      issues.push("Cost is binding inside the category rules.");
    }
    return fail(issues, adjustments, pool.map((candidate) => candidate.id), heldBack.map((candidate) => candidate.id));
  }

  const chosen = best.selected;
  const planningTotal = chosen.reduce((sum, candidate) => sum + candidate.planningCost, 0);
  if (chosen.some((candidate) => candidate.costKind === "allocation")) {
    assumptions.push("At least one planning figure is an allocation, not a quote.");
  }
  return {
    feasibility: "feasible",
    selectedIds: chosen.map((candidate) => candidate.id),
    objectiveComponents: {
      fit: best.score.fit,
      variety: best.score.variety,
      similarity: best.score.similarity,
      cost: best.score.cost,
      total: best.score.total,
    },
    planningTotal,
    contingencyTotal: planningTotal * (1 + input.weights.contingency),
    assumptions,
    bindingIssues: [],
    adjustments: [],
    optimalWithinPool: true,
    poolIds: pool.map((candidate) => candidate.id),
    heldBackIds: heldBack.map((candidate) => candidate.id),
    combinationsConsidered: considered,
  };
}
