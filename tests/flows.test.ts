import { describe, expect, it } from "vitest";
import { runDiscovery } from "@/lib/agent/controller";
import { RunBudget } from "@/lib/agent/controller";
import { ProviderError, qlooInsights, qlooSearch } from "@/lib/providers/qloo";
import { CampaignBriefSchema, emptyDraft, type AgentEvent, type CampaignBrief } from "@/lib/schemas";
import { useCampaign } from "@/lib/store/campaign-store";

function brief(): CampaignBrief {
  const draft = emptyDraft(3);
  draft.brandName = "Running brand";
  draft.identity = "Movement. Curiosity. Community.";
  draft.objective = "Community run × cultural pop-up";
  draft.city = "New York";
  draft.country = "United States";
  draft.currency = "USD";
  draft.budget = 15000;
  draft.startDate = "2026-12-05";
  draft.endDate = "2026-12-06";
  draft.references = [
    { id: "1", label: "Khruangbin", entityType: "urn:entity:artist", qlooId: "seed-1", resolutionStatus: "confirmed", metadata: null },
    { id: "2", label: "Bookshop", entityType: "urn:entity:place", qlooId: "seed-2", resolutionStatus: "confirmed", metadata: null },
  ];
  return CampaignBriefSchema.parse(draft);
}

function entity(id: string, name: string, domain = "urn:entity:artist") {
  return {
    entity_id: id,
    name,
    subtype: domain,
    properties: {},
    tags: [{ name: "city" }],
    query: { affinity: 0.66, explainability: { entities: [{ entity_id: "seed-1", name: "Khruangbin" }] } },
  };
}

function fetchFrom(handler: (url: URL) => Response): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    return handler(url);
  }) as typeof fetch;
}

describe("discovery flow", () => {
  it("runs five domains, signs evidence, and keeps a partial result on cancel", async () => {
    const calls: string[] = [];
    const events: AgentEvent[] = [];
    const deps = {
      env: { QLOO_API_KEY: "test-key", QLOO_BASE_URL: "https://hackathon.api.qloo.com", EVIDENCE_SIGNING_SECRET: "secret" },
      delay: async () => {},
      fetch: fetchFrom((url) => {
        calls.push(url.pathname + url.search);
        const domain = url.searchParams.get("filter.type") ?? "urn:entity:artist";
        return Response.json({
          success: true,
          results: { entities: [entity(`${domain}-1`, `Partner ${domain}`, domain)] },
          query: { id: "query-1", locality: domain.endsWith("place") ? { label: "New York" } : null },
        });
      }),
    };
    const result = await runDiscovery(
      { brief: brief(), requestId: "req-1", runId: "run-1", research: false },
      (event) => events.push(event),
      { deps },
    );
    expect(calls).toHaveLength(5);
    expect(calls.every((call) => call.includes("feature.explainability=true"))).toBe(true);
    expect(result.candidates).toHaveLength(5);
    expect(events.some((event) => event.type === "candidates_received" && event.envelope)).toBe(true);
    expect(events.at(-1)?.type).toBe("run_completed");
    expect(events.every((event) => event.revision === 3)).toBe(true);

    const controller = new AbortController();
    controller.abort();
    const stopped = await runDiscovery(
      { brief: brief(), requestId: "req-2", runId: "run-2", research: false },
      () => {},
      { deps, signal: controller.signal },
    );
    expect(stopped.incomplete).toBe(true);
  });

  it("does a single wider round when coverage is sparse, and only one round when replacing", async () => {
    const takes: string[] = [];
    const deps = {
      env: { QLOO_API_KEY: "test-key", QLOO_BASE_URL: "https://hackathon.api.qloo.com", EVIDENCE_SIGNING_SECRET: "secret" },
      delay: async () => {},
      fetch: fetchFrom((url) => {
        const take = url.searchParams.get("take") ?? "";
        takes.push(take);
        const entities = take === "16" ? [entity(`wide-${takes.length}`, "Wide")] : [];
        return Response.json({ success: true, results: { entities }, query: {} });
      }),
    };
    const discovered = await runDiscovery(
      { brief: brief(), requestId: "req", runId: "run", research: false },
      () => {},
      { deps },
    );
    expect(takes.filter((take) => take === "8")).toHaveLength(5);
    expect(takes.filter((take) => take === "16")).toHaveLength(5);
    expect(discovered.candidates.length).toBeGreaterThan(0);

    takes.length = 0;
    await runDiscovery(
      { brief: brief(), mode: "replace", excludeIds: ["gone"], requestId: "req", runId: "run", research: false },
      () => {},
      { deps },
    );
    expect(takes).toEqual(["8", "8", "8", "8", "8"]);
    expect(takes.some((take) => take === "16")).toBe(false);
  });

  it("reports authentication failure without inventing candidates", async () => {
    const events: AgentEvent[] = [];
    const deps = {
      env: { QLOO_API_KEY: "bad", QLOO_BASE_URL: "https://hackathon.api.qloo.com" },
      delay: async () => {},
      retries: 0,
      fetch: fetchFrom(() => new Response("unauthorized", { status: 401 })),
    };
    const result = await runDiscovery(
      { brief: brief(), requestId: "req", runId: "run", research: false },
      (event) => events.push(event),
      { deps },
    );
    expect(result.candidates).toHaveLength(0);
    expect(events.some((event) => event.type === "error")).toBe(true);
  });

  it("stops at the run limit and keeps candidates already received", async () => {
    let count = 0;
    const deps = {
      env: { QLOO_API_KEY: "test-key", QLOO_BASE_URL: "https://hackathon.api.qloo.com", EVIDENCE_SIGNING_SECRET: "secret" },
      delay: async () => {},
      fetch: fetchFrom((url) => {
        count += 1;
        const domain = url.searchParams.get("filter.type") ?? "x";
        return Response.json({ success: true, results: { entities: [entity(`${domain}-${count}`, `N${count}`)] }, query: {} });
      }),
    };
    const result = await runDiscovery(
      { brief: brief(), requestId: "req", runId: "run", research: false },
      () => {},
      { deps, budget: new RunBudget({ qloo: 2, search: 8, gemini: 6 }) },
    );
    expect(result.incomplete).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThanOrEqual(2);
  });

  it("retries a 429 once and does not invent a search id", async () => {
    let attempts = 0;
    const fetchImpl = fetchFrom(() => {
      attempts += 1;
      if (attempts === 1) return new Response("slow", { status: 429, headers: { "retry-after": "0" } });
      return Response.json({ results: { entities: [{ entity_id: "real", name: "Khruangbin", subtype: "urn:entity:artist" }] } });
    });
    const found = await qlooSearch("Khruangbin", "urn:entity:artist", {
      env: { QLOO_API_KEY: "k", QLOO_BASE_URL: "https://hackathon.api.qloo.com" },
      fetch: fetchImpl,
      delay: async () => {},
    });
    expect(attempts).toBe(2);
    expect(found.options[0].qlooId).toBe("real");
    expect(found.ambiguous).toBe(false);
    const empty = await qlooSearch("Not a real company", "urn:entity:brand", {
      env: { QLOO_API_KEY: "k", QLOO_BASE_URL: "https://hackathon.api.qloo.com" },
      fetch: fetchFrom(() => Response.json({ results: { entities: [] } })),
      delay: async () => {},
    });
    expect(empty.notInQloo).toBe(true);
    expect(empty.options).toEqual([]);
    await expect(
      qlooInsights(
        {
          domain: "urn:entity:artist",
          signalIds: ["a"],
          excludeIds: [],
          take: 8,
          revision: 1,
        },
        {
          env: { QLOO_API_KEY: "k", QLOO_BASE_URL: "https://evil.example" },
          fetch: fetchImpl,
        },
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("session revision", () => {
  it("ignores a late event from an older revision and does not duplicate cards", () => {
    useCampaign.getState().clearSession();
    useCampaign.setState({ revision: 4, candidates: [] });
    const event = (revision: number, id: string): AgentEvent => ({
      runId: "run",
      stageId: "stage",
      type: "candidates_received",
      action: "Music results",
      toolSummary: null,
      timestamp: "2026-10-30T12:00:00.000Z",
      error: null,
      status: "ok",
      revision,
      requestId: "req",
      candidates: [
        {
          id,
          name: id,
          entityType: "urn:entity:artist",
          category: "Music",
          imageUrl: null,
          description: null,
          tags: [],
          affinity: 0.2,
          queryId: null,
          explainability: null,
          explainabilityAvailable: false,
          retrievedAt: "2026-10-30T12:00:00.000Z",
          locality: null,
        },
      ],
    });
    useCampaign.getState().applyEvent(event(3, "late"));
    expect(useCampaign.getState().candidates).toHaveLength(0);
    useCampaign.getState().applyEvent(event(4, "live"));
    useCampaign.getState().applyEvent(event(4, "live"));
    expect(useCampaign.getState().candidates.map((candidate) => candidate.id)).toEqual(["live"]);
  });

  it("keeps discoveries when the budget changes and drops them when the city changes", () => {
    useCampaign.getState().clearSession();
    const live = {
      id: "live",
      name: "Night Radio",
      entityType: "urn:entity:artist" as const,
      category: "Music",
      imageUrl: null,
      description: null,
      tags: [],
      affinity: 0.81,
      queryId: null,
      explainability: null,
      explainabilityAvailable: false,
      retrievedAt: "2026-10-30T12:00:00.000Z",
      locality: null,
    };
    useCampaign.setState({ candidates: [live], prose: null });
    const current = useCampaign.getState().brief;
    useCampaign.getState().replaceBrief({ ...current, budget: 9000, brandName: "Harbour Club" });
    expect(useCampaign.getState().brief.budget).toBe(9000);
    expect(useCampaign.getState().candidates.map((candidate) => candidate.id)).toEqual(["live"]);
    expect(useCampaign.getState().revision).toBe(current.revision);
    useCampaign.getState().replaceBrief({ ...useCampaign.getState().brief, city: "Chicago" });
    expect(useCampaign.getState().candidates).toHaveLength(0);
    expect(useCampaign.getState().revision).toBe(current.revision + 1);
  });
});
