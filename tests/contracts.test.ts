import { describe, expect, it } from "vitest";
import { confirmedGates } from "@/lib/evidence/commercial";
import { explainLines } from "@/lib/evidence/explain";
import { signEnvelope, verifyEnvelope } from "@/lib/evidence/sign";
import { escapeCsvCell, parseCommercialCsv } from "@/lib/exports/csv";
import { buildInsightsParams, buildSearchParams } from "@/lib/providers/qloo";
import { normaliseInsights, normaliseSearch, QlooSchemaError } from "@/lib/providers/qloo-normalise";
import { validateProposal } from "@/lib/providers/gemini";
import {
  CampaignBriefSchema,
  emptyDraft,
  SCHEMA_VERSION,
  type CommercialEvidence,
  type EvidencePayload,
} from "@/lib/schemas";

const retrievedAt = "2026-10-30T12:00:00.000Z";

function entity(id: string, name: string, affinity?: number | null) {
  return {
    entity_id: id,
    name,
    subtype: "urn:entity:artist",
    properties: { description: "A real description", image: { url: "https://images.example/a.jpg" } },
    tags: [{ name: "night" }],
    query: affinity === undefined ? {} : { affinity, explainability: affinity == null ? null : { entities: [{ entity_id: "seed", name: "Khruangbin" }] } },
  };
}

describe("Qloo envelopes", () => {
  it("reads results.entities and a top-level results array", () => {
    const nested = normaliseInsights(
      { success: true, results: { entities: [entity("a", "Alpha", 0.42)] }, query: { id: "q-1" } },
      "urn:entity:artist",
      retrievedAt,
    );
    const flat = normaliseInsights(
      { results: [entity("b", "Beta", 0.2)] },
      "urn:entity:artist",
      retrievedAt,
    );
    expect(nested.shape).toBe("results.entities");
    expect(nested.candidates[0]).toMatchObject({ id: "a", affinity: 0.42, queryId: "q-1" });
    expect(flat.shape).toBe("results");
    expect(flat.candidates[0].id).toBe("b");
  });

  it("keeps a missing affinity as null and does not invent explainability", () => {
    const normalised = normaliseInsights(
      { results: { entities: [entity("a", "Alpha", null)] } },
      "urn:entity:artist",
      retrievedAt,
    );
    expect(normalised.candidates[0].affinity).toBeNull();
    expect(normalised.candidates[0].explainabilityAvailable).toBe(false);
    expect(explainLines(null).available).toBe(false);
  });

  it("rejects an unexpected shape instead of treating it as an empty success", () => {
    expect(() => normaliseInsights({ success: true, results: { tags: [] } }, "urn:entity:artist", retrievedAt)).toThrow(QlooSchemaError);
    expect(() => normaliseSearch({ success: false, message: "no" })).toThrow(QlooSchemaError);
  });

  it("does not invent an id when search is empty, and flags ambiguity", () => {
    expect(normaliseSearch({ results: { entities: [] } }).options).toEqual([]);
    const many = normaliseSearch({
      results: {
        entities: [
          { entity_id: "1", name: "Khruangbin", subtype: "urn:entity:artist", popularity: 0.8 },
          { entity_id: "2", name: "Khruangbin Tribute", subtype: "urn:entity:artist" },
        ],
      },
    });
    expect(many.options).toHaveLength(2);
    expect(many.options[0].metadata).toContain("popularity");
  });

  it("whitelists insight parameters and keeps place locality tight", () => {
    const places = buildInsightsParams({
      domain: "urn:entity:place",
      signalIds: ["seed-a", "seed-b"],
      excludeIds: ["seed-a", "old"],
      take: 8,
      city: "New York",
      country: "United States",
    });
    expect(places.get("filter.type")).toBe("urn:entity:place");
    expect(places.get("signal.interests.entities")).toBe("seed-a,seed-b");
    expect(places.get("filter.exclude.entities")).toBe("seed-a,old");
    expect(places.get("feature.explainability")).toBe("true");
    expect(places.get("filter.location.query")).toBe("New York, United States");
    expect(places.get("filter.location.radius")).toBe("0");
    const music = buildInsightsParams({
      domain: "urn:entity:artist",
      signalIds: ["seed-a"],
      excludeIds: [],
      take: 8,
      city: "New York",
      country: "United States",
    });
    expect(music.get("filter.location.query")).toBeNull();
    expect(buildSearchParams("Khruangbin", "urn:entity:artist", 6).toString()).toBe(
      "query=Khruangbin&types=urn%3Aentity%3Aartist&take=6",
    );
  });
});

describe("brief schema", () => {
  it("rejects duplicate ids, invalid dates, negative budgets, and short reference lists", () => {
    const draft = emptyDraft();
    draft.brandName = "Running brand";
    draft.identity = "Movement";
    draft.objective = "Pop-up";
    draft.city = "New York";
    draft.country = "United States";
    draft.currency = "USD";
    draft.budget = 15000;
    draft.startDate = "2026-12-05";
    draft.endDate = "2026-12-06";
    draft.references = [
      { id: "1", label: "A", entityType: "urn:entity:artist", qlooId: "qa", resolutionStatus: "confirmed", metadata: null },
      { id: "2", label: "B", entityType: "urn:entity:book", qlooId: "qb", resolutionStatus: "confirmed", metadata: null },
    ];
    expect(CampaignBriefSchema.safeParse(draft).success).toBe(true);
    expect(CampaignBriefSchema.safeParse({ ...draft, budget: -1 }).success).toBe(false);
    expect(CampaignBriefSchema.safeParse({ ...draft, endDate: "2026-02-31" }).success).toBe(false);
    expect(CampaignBriefSchema.safeParse({ ...draft, endDate: "2026-12-01" }).success).toBe(false);
    expect(CampaignBriefSchema.safeParse({ ...draft, references: [draft.references[0]] }).success).toBe(false);
    expect(
      CampaignBriefSchema.safeParse({
        ...draft,
        references: [
          draft.references[0],
          { ...draft.references[1], qlooId: "qa" },
        ],
      }).success,
    ).toBe(false);
    expect(CampaignBriefSchema.safeParse({ ...draft, brandName: "x".repeat(200) }).success).toBe(false);
  });
});

describe("commercial gates and exports", () => {
  const brief = { currency: "USD", startDate: "2026-12-05", endDate: "2026-12-06" };
  const now = Date.parse("2026-12-01T00:00:00.000Z");

  function evidence(patch: Partial<CommercialEvidence> = {}): CommercialEvidence {
    return {
      candidateId: "c1",
      deliverableScope: "One night",
      priceLow: 1000,
      priceHigh: 2000,
      currency: "USD",
      sourceUrls: ["https://example.com/offer"],
      availabilityStart: "2026-12-01",
      availabilityEnd: "2026-12-20",
      rightsStatus: "cleared",
      geographyStatus: "applicable",
      availabilityStatus: "available",
      checkedAt: "2026-11-20T00:00:00.000Z",
      allocation: null,
      attested: true,
      ...patch,
    };
  }

  it("accepts a same-currency covering quote and refuses a silent currency change", () => {
    expect(confirmedGates(evidence(), brief, now).ok).toBe(true);
    const euro = confirmedGates(evidence({ currency: "EUR" }), brief, now);
    expect(euro.ok).toBe(false);
    expect(euro.reasons.join(" ")).toMatch(/not converted/i);
    expect(confirmedGates(evidence({ checkedAt: "2026-01-01T00:00:00.000Z" }), brief, now).ok).toBe(false);
    expect(confirmedGates(evidence({ availabilityEnd: "2026-12-05" }), brief, now).ok).toBe(false);
    expect(confirmedGates(evidence({ rightsStatus: "blocked" }), brief, now).ok).toBe(false);
  });

  it("escapes CSV formula injection and round-trips a commercial row", () => {
    expect(escapeCsvCell("=CMD()")).toBe("'=CMD()");
    expect(escapeCsvCell("=1,2")).toBe(`"'=1,2"`);
    const csv = "candidateId,allocation,currency\nc1,500,USD\n";
    const parsed = parseCommercialCsv(csv);
    expect(parsed.rows[0]).toMatchObject({ candidateId: "c1", allocation: 500, currency: "USD", attested: true });
  });
});

describe("evidence signatures and proposal citations", () => {
  const payload: EvidencePayload = {
    schemaVersion: SCHEMA_VERSION,
    kind: "qloo",
    revision: 1,
    domain: "urn:entity:artist",
    request: { path: "/v2/insights", params: { "filter.type": "urn:entity:artist" } },
    retrievedAt,
    queryEnvelope: { id: "q" },
    locality: null,
    candidates: [
      {
        id: "artist-1",
        name: "Alpha",
        entityType: "urn:entity:artist",
        category: "Music",
        imageUrl: null,
        description: null,
        tags: [],
        affinity: 0.5,
        queryId: "q",
        explainability: null,
        explainabilityAvailable: false,
        retrievedAt,
        locality: null,
      },
    ],
  };

  it("rejects a tampered or expired envelope", () => {
    const signed = signEnvelope(payload, "secret", Date.parse(retrievedAt));
    expect(verifyEnvelope(signed, "secret", Date.parse(retrievedAt)).ok).toBe(true);
    expect(verifyEnvelope({ ...signed, exp: Date.parse(retrievedAt) - 1 }, "secret", Date.parse(retrievedAt)).ok).toBe(false);
    const tampered = { ...signed, payload: { ...signed.payload, revision: 2 } };
    expect(verifyEnvelope(tampered, "secret", Date.parse(retrievedAt)).ok).toBe(false);
  });

  it("rejects unknown partner and evidence ids", () => {
    const good = {
      selectedEntityIds: ["artist-1"],
      concepts: [
        {
          title: "Night run",
          partnerIds: ["artist-1"],
          deliverables: ["One set"],
          evidenceIds: ["qloo:artist-1"],
          summary: "A short set beside the route.",
        },
      ],
      unresolvedChecks: ["Rights"],
      pilot: { name: "Saturday", steps: ["Meet"], successSignal: "People stay" },
      prose: "A careful proposal.",
      openQuestions: ["Who holds the rights?"],
    };
    expect(validateProposal(good, ["artist-1"], ["qloo:artist-1"]).prose).toContain("careful");
    expect(() => validateProposal({ ...good, selectedEntityIds: ["nope"] }, ["artist-1"], ["qloo:artist-1"])).toThrow(/partner/i);
    expect(() =>
      validateProposal(
        { ...good, concepts: [{ ...good.concepts[0], evidenceIds: ["made-up"] }] },
        ["artist-1"],
        ["qloo:artist-1"],
      ),
    ).toThrow(/evidence/i);
  });
});
