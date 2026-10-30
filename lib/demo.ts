import { emptyDraft, type BriefDraft, type Reference } from "@/lib/schemas";

export const DEMO_REFERENCE_SEEDS: { label: string; entityType: Reference["entityType"] }[] = [
  { label: "Khruangbin", entityType: "urn:entity:artist" },
  { label: "Independent bookshops", entityType: "urn:entity:place" },
  { label: "Coffee culture", entityType: "urn:entity:place" },
];

export function demoDraft(revision = 1): BriefDraft {
  const draft = emptyDraft(revision);
  draft.brandName = "Running brand";
  draft.identity = "Movement. Curiosity. Community.";
  draft.objective = "Community run × cultural pop-up";
  draft.city = "New York";
  draft.country = "United States";
  draft.currency = "USD";
  draft.budget = 15000;
  draft.startDate = "2026-12-05";
  draft.endDate = "2026-12-06";
  draft.audience = "People who show up for the city — runners, readers, and regulars.";
  draft.references = DEMO_REFERENCE_SEEDS.map((seed, index) => ({
    id: `demo-ref-${index + 1}`,
    label: seed.label,
    entityType: seed.entityType,
    qlooId: null,
    resolutionStatus: "unresolved" as const,
    metadata: null,
  }));
  return draft;
}
