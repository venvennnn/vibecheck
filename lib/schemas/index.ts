import { z } from "zod";
import { ENTITY_TYPES } from "@/lib/domains";
import { isIsoDate } from "@/lib/text";

export const SCHEMA_VERSION = 1 as const;

export const EntityTypeSchema = z.enum(ENTITY_TYPES);

const idSchema = z.string().min(1).max(200);
const labelSchema = z.string().min(1).max(160);

export const ReferenceSchema = z.object({
  id: z.string().min(1).max(80),
  label: labelSchema,
  entityType: EntityTypeSchema.nullable(),
  qlooId: idSchema.nullable(),
  resolutionStatus: z.enum(["unresolved", "ambiguous", "confirmed", "not_in_qloo"]),
  metadata: z.string().max(400).nullable(),
});

export const ConstraintsSchema = z.object({
  partnerCount: z.number().int().min(1).max(4),
  minCategories: z.number().int().min(1).max(5),
  maxPerCategory: z.number().int().min(1).max(4),
  pinnedIds: z.array(idSchema).max(4),
});

const briefFields = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  brandName: z.string().max(120),
  identity: z.string().max(600),
  objective: z.string().max(400),
  city: z.string().max(80),
  country: z.string().max(80),
  currency: z.string().max(3),
  budget: z.number().nonnegative().max(1_000_000_000),
  startDate: z.string().max(10).nullable(),
  endDate: z.string().max(10).nullable(),
  audience: z.string().max(600),
  references: z.array(ReferenceSchema).max(12),
  existingPartnerIds: z.array(idSchema).max(40),
  excludedPartnerIds: z.array(idSchema).max(40),
  constraints: ConstraintsSchema,
};

function addIssue(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) {
  ctx.addIssue({ code: "custom", path, message });
}

function rejectDuplicateIds(
  ctx: z.RefinementCtx,
  values: string[],
  path: (string | number)[],
  label: string,
) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      addIssue(ctx, path, `Duplicate ${label}: ${value}`);
      return;
    }
    seen.add(value);
  }
}

function refineShared(
  value: z.infer<z.ZodObject<typeof briefFields>>,
  ctx: z.RefinementCtx,
) {
  rejectDuplicateIds(
    ctx,
    value.references.map((reference) => reference.id),
    ["references"],
    "reference id",
  );
  const confirmed = value.references
    .map((reference) => reference.qlooId)
    .filter((id): id is string => Boolean(id));
  rejectDuplicateIds(ctx, confirmed, ["references"], "confirmed Qloo id");
  rejectDuplicateIds(ctx, value.existingPartnerIds, ["existingPartnerIds"], "partner id");
  rejectDuplicateIds(ctx, value.excludedPartnerIds, ["excludedPartnerIds"], "partner id");
  rejectDuplicateIds(ctx, value.constraints.pinnedIds, ["constraints", "pinnedIds"], "pinned id");
  const excluded = new Set(value.excludedPartnerIds);
  for (const id of value.existingPartnerIds) {
    if (excluded.has(id)) {
      addIssue(ctx, ["existingPartnerIds"], "An existing partner is also excluded.");
    }
  }
  for (const id of value.constraints.pinnedIds) {
    if (excluded.has(id)) {
      addIssue(ctx, ["constraints", "pinnedIds"], "A pinned partner is excluded.");
    }
  }
  if (value.currency && !/^[A-Z]{3}$/.test(value.currency)) {
    addIssue(ctx, ["currency"], "Currency must be a three-letter ISO code.");
  }
  if (value.startDate && !isIsoDate(value.startDate)) {
    addIssue(ctx, ["startDate"], "Start date must be a real YYYY-MM-DD date.");
  }
  if (value.endDate && !isIsoDate(value.endDate)) {
    addIssue(ctx, ["endDate"], "End date must be a real YYYY-MM-DD date.");
  }
  if (
    value.startDate &&
    value.endDate &&
    isIsoDate(value.startDate) &&
    isIsoDate(value.endDate) &&
    value.endDate < value.startDate
  ) {
    addIssue(ctx, ["endDate"], "End date is before the start date.");
  }
  if (value.constraints.minCategories > value.constraints.partnerCount) {
    addIssue(
      ctx,
      ["constraints", "minCategories"],
      "Minimum categories cannot exceed the partner count.",
    );
  }
}

export const BriefDraftSchema = z.object(briefFields).superRefine(refineShared);

export const CampaignBriefSchema = BriefDraftSchema.superRefine((value, ctx) => {
  if (!value.brandName.trim()) addIssue(ctx, ["brandName"], "Brand name is required.");
  if (!value.identity.trim()) addIssue(ctx, ["identity"], "Say what the brand stands for.");
  if (!value.objective.trim()) addIssue(ctx, ["objective"], "Campaign objective is required.");
  if (!value.city.trim()) addIssue(ctx, ["city"], "City is required.");
  if (!value.country.trim()) addIssue(ctx, ["country"], "Country is required.");
  if (!/^[A-Z]{3}$/.test(value.currency)) {
    addIssue(ctx, ["currency"], "Currency must be a three-letter ISO code.");
  }
  if (!value.startDate || !isIsoDate(value.startDate)) {
    addIssue(ctx, ["startDate"], "Start date is required.");
  }
  if (!value.endDate || !isIsoDate(value.endDate)) {
    addIssue(ctx, ["endDate"], "End date is required.");
  }
  const confirmed = value.references.filter(
    (reference) => reference.resolutionStatus === "confirmed" && reference.qlooId && reference.entityType,
  );
  const distinct = new Set(confirmed.map((reference) => reference.qlooId));
  if (distinct.size < 2) {
    addIssue(ctx, ["references"], "Confirm two distinct Qloo references before discovery.");
  }
  for (const reference of confirmed) {
    if (!reference.qlooId) {
      addIssue(ctx, ["references"], "A confirmed reference is missing its Qloo id.");
    }
  }
});

export const CandidateSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200),
  entityType: EntityTypeSchema,
  category: z.string().min(1).max(80),
  imageUrl: z.string().url().nullable(),
  description: z.string().max(600).nullable(),
  tags: z.array(z.string().max(80)).max(40),
  affinity: z.number().nullable(),
  queryId: z.string().max(200).nullable(),
  explainability: z.unknown().nullable(),
  explainabilityAvailable: z.boolean(),
  retrievedAt: z.string().min(10).max(40),
  locality: z.unknown().nullable(),
});

export const EvidencePayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.literal("qloo"),
  revision: z.number().int().nonnegative(),
  domain: EntityTypeSchema,
  request: z.object({
    path: z.string().max(80),
    params: z.record(z.string(), z.string().max(2000)).refine(
      (params) => Object.keys(params).length <= 20,
      "Too many request parameters.",
    ),
  }),
  retrievedAt: z.string().min(10).max(40),
  queryEnvelope: z.unknown().nullable(),
  locality: z.unknown().nullable(),
  candidates: z.array(CandidateSchema).max(40),
});

export const SignedEnvelopeSchema = z.object({
  payload: EvidencePayloadSchema,
  exp: z.number().int().positive(),
  sig: z.string().min(16).max(200),
});

export const CommercialEvidenceSchema = z.object({
  candidateId: idSchema,
  deliverableScope: z.string().max(400).nullable(),
  priceLow: z.number().nonnegative().nullable(),
  priceHigh: z.number().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  sourceUrls: z.array(z.string().url()).max(8),
  availabilityStart: z.string().nullable(),
  availabilityEnd: z.string().nullable(),
  rightsStatus: z.enum(["unknown", "cleared", "blocked", "investigating"]),
  geographyStatus: z.enum(["unknown", "applicable", "unsuitable"]),
  availabilityStatus: z.enum(["unknown", "available", "unavailable"]),
  checkedAt: z.string().nullable(),
  allocation: z.number().nonnegative().nullable(),
  attested: z.literal(true),
});

export const ResearchLeadSchema = z.object({
  id: z.string().min(1).max(80),
  candidateId: idSchema,
  query: z.string().max(300),
  url: z.string().url(),
  title: z.string().max(200),
  snippet: z.string().max(500),
  retrievedAt: z.string().min(10).max(40),
  provider: z.literal("tavily"),
});

export const WeightsSchema = z.object({
  fit: z.number().min(0).max(3),
  variety: z.number().min(0).max(3),
  similarity: z.number().min(0).max(3),
  cost: z.number().min(0).max(3),
  contingency: z.number().min(0).max(0.5),
});

export const ObjectiveComponentsSchema = z.object({
  fit: z.number(),
  variety: z.number(),
  similarity: z.number(),
  cost: z.number(),
  total: z.number(),
});

export const PortfolioSchema = z.object({
  selectedIds: z.array(idSchema).max(4),
  objectiveComponents: ObjectiveComponentsSchema,
  planningTotal: z.number().nonnegative(),
  contingencyTotal: z.number().nonnegative(),
  assumptions: z.array(z.string().max(400)).max(20),
  unresolvedChecks: z.array(z.string().max(300)).max(40),
  feasibility: z.enum(["feasible", "infeasible"]),
  bindingIssues: z.array(z.string().max(300)).max(12),
  adjustments: z.array(z.string().max(300)).max(12),
  optimalWithinPool: z.boolean(),
  poolIds: z.array(idSchema).max(40),
  heldBackIds: z.array(idSchema).max(80),
  combinationsConsidered: z.number().int().nonnegative(),
});

export const AgentEventSchema = z.object({
  runId: z.string().min(1).max(80),
  stageId: z.string().min(1).max(80),
  type: z.enum([
    "stage_started",
    "candidates_received",
    "warning",
    "stage_completed",
    "run_completed",
    "error",
  ]),
  action: z.string().max(180),
  toolSummary: z.string().max(400).nullable(),
  timestamp: z.string().min(10).max(40),
  error: z.string().max(400).nullable(),
  status: z.string().max(40),
  revision: z.number().int().nonnegative(),
  requestId: z.string().min(1).max(80),
  domain: EntityTypeSchema.nullable().optional(),
  candidates: z.array(CandidateSchema).max(40).optional(),
  envelope: SignedEnvelopeSchema.nullable().optional(),
  research: z.array(ResearchLeadSchema).max(24).optional(),
  portfolio: PortfolioSchema.nullable().optional(),
  warnings: z.array(z.string().max(300)).max(20).optional(),
});

export const ProposalConceptSchema = z.object({
  title: z.string().min(1).max(160),
  partnerIds: z.array(idSchema).max(4),
  deliverables: z.array(z.string().min(1).max(240)).max(8),
  evidenceIds: z.array(z.string().min(1).max(120)).max(16),
  summary: z.string().min(1).max(800),
});

export const CampaignProposalSchema = z.object({
  selectedEntityIds: z.array(idSchema).max(4),
  concepts: z.array(ProposalConceptSchema).max(6),
  unresolvedChecks: z.array(z.string().max(300)).max(20),
  pilot: z.object({
    name: z.string().min(1).max(160),
    steps: z.array(z.string().min(1).max(240)).min(1).max(8),
    successSignal: z.string().min(1).max(300),
  }),
  prose: z.string().min(1).max(4000),
  openQuestions: z.array(z.string().max(300)).max(12),
});

export const ApiMetaSchema = z.object({
  revision: z.number().int().nonnegative(),
  requestId: z.string().min(1).max(80),
  timestamps: z.object({
    startedAt: z.string(),
    finishedAt: z.string(),
  }),
  warnings: z.array(z.string().max(300)).max(20),
  status: z.enum(["ok", "partial", "error"]),
});

export type Reference = z.infer<typeof ReferenceSchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type BriefDraft = z.infer<typeof BriefDraftSchema>;
export type CampaignBrief = z.infer<typeof CampaignBriefSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type EvidencePayload = z.infer<typeof EvidencePayloadSchema>;
export type SignedEnvelope = z.infer<typeof SignedEnvelopeSchema>;
export type CommercialEvidence = z.infer<typeof CommercialEvidenceSchema>;
export type ResearchLead = z.infer<typeof ResearchLeadSchema>;
export type Weights = z.infer<typeof WeightsSchema>;
export type Portfolio = z.infer<typeof PortfolioSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type CampaignProposal = z.infer<typeof CampaignProposalSchema>;

export const DEFAULT_WEIGHTS: Weights = {
  fit: 1,
  variety: 0.8,
  similarity: 0.45,
  cost: 0.55,
  contingency: 0.1,
};

export const DEFAULT_CONSTRAINTS: Constraints = {
  partnerCount: 3,
  minCategories: 2,
  maxPerCategory: 2,
  pinnedIds: [],
};

export function emptyDraft(revision = 1): BriefDraft {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision,
    brandName: "",
    identity: "",
    objective: "",
    city: "",
    country: "",
    currency: "USD",
    budget: 15000,
    startDate: null,
    endDate: null,
    audience: "",
    references: [],
    existingPartnerIds: [],
    excludedPartnerIds: [],
    constraints: { ...DEFAULT_CONSTRAINTS, pinnedIds: [] },
  };
}

export function issueList(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 12).map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
