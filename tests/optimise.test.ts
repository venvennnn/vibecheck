import { describe, expect, it } from "vitest";
import { confirmedGates, defaultAllocation } from "@/lib/evidence/commercial";
import { optimise, rankUtilities, type OptimiseCandidate } from "@/lib/optimisation/optimise";
import { optimisePortfolio } from "@/lib/optimisation/prepare";
import { emptyDraft, type CampaignBrief, type Candidate, type Weights } from "@/lib/schemas";

const weights: Weights = { fit: 1, variety: 0, similarity: 0, cost: 0, contingency: 0 };

function candidate(id: string, affinity: number | null, domain: OptimiseCandidate["domain"] = "urn:entity:artist"): OptimiseCandidate {
  return { id, name: id, domain, tags: [], affinity, planningCost: 100, costKind: "allocation" };
}

describe("rank utility", () => {
  it("gives tied affinities the average rank", () => {
    const utilities = rankUtilities([
      candidate("A", 0.9),
      candidate("B", 0.5),
      candidate("C", 0.5),
    ]);
    expect(utilities.get("A")).toBeCloseTo(1);
    expect(utilities.get("B")).toBeCloseTo(0.5);
    expect(utilities.get("C")).toBeCloseTo(0.5);
  });
});

describe("optimiser", () => {
  const pool = [candidate("A", 0.9), candidate("B", 0.5), candidate("C", 0.5)];

  function run(patch: Partial<Parameters<typeof optimise>[0]> = {}) {
    return optimise({
      candidates: pool,
      partnerCount: 2,
      minCategories: 1,
      maxPerCategory: 2,
      pinnedIds: [],
      excludedIds: [],
      blockedIds: [],
      budget: 1000,
      weights,
      ...patch,
    });
  }

  it("picks the higher-affinity pair and reports optimality only inside the pool", () => {
    const result = run();
    expect(result.feasibility).toBe("feasible");
    expect(result.selectedIds).toContain("A");
    expect(result.selectedIds).toHaveLength(2);
    expect(result.optimalWithinPool).toBe(true);
    expect(result.combinationsConsidered).toBe(3);
  });

  it("honours pins and exclusions", () => {
    expect(run({ pinnedIds: ["B"] }).selectedIds).toEqual(expect.arrayContaining(["A", "B"]));
    expect(run({ excludedIds: ["A"] }).selectedIds).toEqual(["B", "C"]);
  });

  it("names the binding constraint when the mix is impossible", () => {
    const category = run({
      minCategories: 2,
      candidates: pool,
    });
    expect(category.feasibility).toBe("infeasible");
    expect(category.bindingIssues.join(" ")).toMatch(/categor/i);
    const budget = run({
      weights: { ...weights, contingency: 0 },
      budget: 50,
      candidates: pool.map((item) => ({ ...item, planningCost: 100 })),
    });
    expect(budget.feasibility).toBe("infeasible");
    expect(budget.bindingIssues.join(" ")).toMatch(/budget/i);
    expect(budget.adjustments.length).toBeGreaterThan(0);
  });

  it("enumerates a four-partner pool without exceeding the displayed set", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      candidate(`p${index}`, 1 - index / 100, index % 2 ? "urn:entity:book" : "urn:entity:artist"),
    );
    const result = optimise({
      candidates: many,
      partnerCount: 4,
      minCategories: 1,
      maxPerCategory: 4,
      pinnedIds: [],
      excludedIds: [],
      blockedIds: [],
      budget: 10000,
      weights,
    });
    expect(result.selectedIds).toHaveLength(4);
    expect(result.combinationsConsidered).toBe(495);
    expect(result.poolIds.length).toBeLessThanOrEqual(40);
  });
});

describe("portfolio preparation", () => {
  it("uses a quote only when the gates pass, otherwise an allocation", () => {
    const brief = emptyDraft() as CampaignBrief;
    brief.brandName = "Running brand";
    brief.identity = "Movement";
    brief.objective = "Pop-up";
    brief.city = "New York";
    brief.country = "United States";
    brief.currency = "USD";
    brief.budget = 1000;
    brief.startDate = "2026-12-05";
    brief.endDate = "2026-12-06";
    brief.constraints = { partnerCount: 1, minCategories: 1, maxPerCategory: 1, pinnedIds: ["a"] };
    brief.references = [
      { id: "1", label: "A", entityType: "urn:entity:artist", qlooId: "qa", resolutionStatus: "confirmed", metadata: null },
      { id: "2", label: "B", entityType: "urn:entity:book", qlooId: "qb", resolutionStatus: "confirmed", metadata: null },
    ];
    const candidate: Candidate = {
      id: "a",
      name: "Alpha",
      entityType: "urn:entity:artist",
      category: "Music",
      imageUrl: null,
      description: null,
      tags: ["night"],
      affinity: 0.4,
      queryId: null,
      explainability: null,
      explainabilityAvailable: false,
      retrievedAt: "2026-12-01T00:00:00.000Z",
      locality: null,
    };
    const quote = {
      candidateId: "a",
      deliverableScope: "Set",
      priceLow: 100,
      priceHigh: 400,
      currency: "USD",
      sourceUrls: ["https://example.com/a"],
      availabilityStart: "2026-12-01",
      availabilityEnd: "2026-12-20",
      rightsStatus: "cleared" as const,
      geographyStatus: "applicable" as const,
      availabilityStatus: "available" as const,
      checkedAt: "2026-10-20T00:00:00.000Z",
      allocation: 50,
      attested: true as const,
    };
    const now = Date.parse("2026-10-30T00:00:00.000Z");
    expect(confirmedGates(quote, brief, now).ok).toBe(true);
    const feasible = optimisePortfolio([candidate], [quote], brief, { ...weights, contingency: 0 }, [], now);
    expect(feasible.planningTotal).toBe(400);
    const blocked = optimisePortfolio(
      [candidate],
      [{ ...quote, rightsStatus: "blocked", priceHigh: null, currency: "EUR" }],
      brief,
      weights,
    );
    expect(blocked.feasibility).toBe("infeasible");
    expect(defaultAllocation(1000, 2, 0.1)).toBeCloseTo(454.55);
  });
});
