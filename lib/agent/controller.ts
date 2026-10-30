import { DOMAIN_LABEL, DOMAIN_ORDER, type EntityType } from "@/lib/domains";
import { verifyEnvelope } from "@/lib/evidence/sign";
import { optimisePortfolio } from "@/lib/optimisation/prepare";
import { providerEnv, qlooInsights, type InsightsOutcome, type QlooDeps } from "@/lib/providers/qloo";
import { tavilySearch } from "@/lib/providers/tavily";
import {
  type AgentEvent,
  type CampaignBrief,
  type Candidate,
  type CommercialEvidence,
  type Portfolio,
  type ResearchLead,
  type SignedEnvelope,
  type Weights,
  DEFAULT_WEIGHTS,
} from "@/lib/schemas";
import { uniqueStrings } from "@/lib/text";

export class RunBudget {
  qloo = 0;
  search = 0;
  gemini = 0;
  constructor(
    private readonly limits = { qloo: 30, search: 8, gemini: 6 },
  ) {}

  take(kind: "qloo" | "search" | "gemini") {
    if (this[kind] >= this.limits[kind]) {
      const error = new Error(`This run reached its ${kind} call limit.`);
      error.name = "LimitError";
      throw error;
    }
    this[kind] += 1;
  }
}

const STAGE_COPY: Record<EntityType, string> = {
  "urn:entity:artist": "Checking music",
  "urn:entity:book": "Checking books",
  "urn:entity:podcast": "Checking podcasts",
  "urn:entity:place": "Checking local places",
  "urn:entity:brand": "Checking brands",
};

export type DiscoveryMode = "discover" | "replace";

export type DiscoveryInput = {
  brief: CampaignBrief;
  mode?: DiscoveryMode;
  excludeIds?: string[];
  research?: boolean;
  weights?: Weights;
  commercial?: CommercialEvidence[];
  requestId: string;
  runId: string;
};

export type Emit = (event: AgentEvent) => void;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>, signal?: AbortSignal) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      if (signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /cancel/i.test(error.message));
}

export async function runDiscovery(
  input: DiscoveryInput,
  emit: Emit,
  options?: {
    deps?: QlooDeps;
    budget?: RunBudget;
    signal?: AbortSignal;
    now?: () => Date;
    researchFn?: typeof tavilySearch;
  },
): Promise<{ candidates: Candidate[]; portfolio: Portfolio | null; incomplete: boolean }> {
  const deps = options?.deps ?? {};
  const budget = options?.budget ?? new RunBudget();
  const now = options?.now ?? (() => new Date());
  const signal = options?.signal;
  const mode = input.mode ?? "discover";
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const commercial = input.commercial ?? [];
  const candidates = new Map<string, Candidate>();
  const envelopes: SignedEnvelope[] = [];
  const research: ResearchLead[] = [];
  let incomplete = false;

  const base = {
    runId: input.runId,
    requestId: input.requestId,
    revision: input.brief.revision,
  };

  const send = (event: {
    type: AgentEvent["type"];
    action: string;
    status: string;
    stageId?: string;
    toolSummary?: string | null;
    error?: string | null;
    domain?: AgentEvent["domain"];
    candidates?: AgentEvent["candidates"];
    envelope?: AgentEvent["envelope"];
    research?: AgentEvent["research"];
    portfolio?: AgentEvent["portfolio"];
    warnings?: string[];
  }) => {
    emit({
      ...base,
      timestamp: now().toISOString(),
      stageId: event.stageId ?? input.runId,
      type: event.type,
      action: event.action,
      status: event.status,
      toolSummary: event.toolSummary ?? null,
      error: event.error ?? null,
      domain: event.domain,
      candidates: event.candidates,
      envelope: event.envelope,
      research: event.research,
      portfolio: event.portfolio,
      warnings: event.warnings,
    });
  };

  const signalIds = uniqueStrings(
    input.brief.references
      .filter((reference) => reference.resolutionStatus === "confirmed" && reference.qlooId)
      .map((reference) => reference.qlooId as string),
  );
  const excludeIds = uniqueStrings([
    ...signalIds,
    ...input.brief.existingPartnerIds,
    ...input.brief.excludedPartnerIds,
    ...(input.excludeIds ?? []),
  ]);

  const finishIncomplete = (action: string) => {
    incomplete = true;
    const portfolio = candidates.size
      ? optimisePortfolio([...candidates.values()], commercial, input.brief, weights, input.excludeIds ?? [])
      : null;
    send({
      type: "run_completed",
      stageId: "run",
      action,
      status: "incomplete",
      portfolio,
      warnings: ["The run stopped early. Candidates already received are kept."],
    });
    return { candidates: [...candidates.values()], portfolio, incomplete };
  };

  try {
    send({
      type: "stage_started",
      stageId: "validate",
      action: mode === "replace" ? "Searching for a substitute" : "Checking the brief",
      status: "running",
    });
    if (signalIds.length < 2) {
      send({
        type: "error",
        stageId: "validate",
        action: "Two confirmed references are required",
        status: "error",
        error: "Confirm two distinct Qloo references before discovery.",
      });
      return { candidates: [], portfolio: null, incomplete: false };
    }
    send({
      type: "stage_completed",
      stageId: "validate",
      action: "Brief accepted",
      toolSummary: `${signalIds.length} confirmed references`,
      status: "ok",
    });

    const runDomains = async (take: number, label: string) => {
      const errors: string[] = [];
      await mapLimit(DOMAIN_ORDER, 2, async (domain) => {
        if (signal?.aborted) return;
        const stageId = `${label}-${domain}`;
        send({
          type: "stage_started",
          stageId,
          domain,
          action: label === "again" ? `Looking again at ${DOMAIN_LABEL[domain].toLowerCase()}` : STAGE_COPY[domain],
          status: "running",
        });
        try {
          budget.take("qloo");
          const outcome: InsightsOutcome = await qlooInsights(
            {
              domain,
              signalIds,
              excludeIds: [...excludeIds, ...candidates.keys()],
              take,
              city: input.brief.city,
              country: input.brief.country,
              revision: input.brief.revision,
            },
            deps,
            signal,
          );
          for (const candidate of outcome.candidates) {
            if (!candidates.has(candidate.id)) candidates.set(candidate.id, candidate);
          }
          if (outcome.envelope) envelopes.push(outcome.envelope);
          send({
            type: "candidates_received",
            stageId,
            domain,
            action: `${DOMAIN_LABEL[domain]} results`,
            toolSummary: `${outcome.candidates.length} candidates`,
            status: outcome.empty ? "empty" : "ok",
            candidates: outcome.candidates,
            envelope: outcome.envelope,
            warnings: outcome.warnings,
          });
          for (const warning of outcome.warnings) {
            send({ type: "warning", stageId, domain, action: warning, status: "warning" });
          }
          send({
            type: "stage_completed",
            stageId,
            domain,
            action: `${DOMAIN_LABEL[domain]} checked`,
            toolSummary: `${outcome.candidates.length} kept`,
            status: "ok",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Discovery failed.";
          errors.push(message);
          const limit = error instanceof Error && error.name === "LimitError";
          send({
            type: limit ? "error" : "warning",
            stageId,
            domain,
            action: limit ? "Run limit reached" : `${DOMAIN_LABEL[domain]} could not be checked`,
            status: limit ? "error" : "warning",
            error: message,
          });
          if (limit) throw error;
        }
      }, signal);
      return errors;
    };

    const firstErrors = await runDomains(mode === "replace" ? 8 : 8, mode === "replace" ? "replace" : "first");
    if (signal?.aborted) return finishIncomplete("Stopped. Partial results kept.");

    const covered = new Set([...candidates.values()].map((candidate) => candidate.entityType));
    const sparse =
      mode === "discover" &&
      (covered.size < 4 || (candidates.size < 8 && covered.size < DOMAIN_ORDER.length));
    if (sparse) {
      send({
        type: "stage_started",
        stageId: "expand",
        action: "Looking once more where coverage is thin",
        toolSummary: "Locality filters stay in place",
        status: "running",
      });
      await runDomains(16, "again");
      send({
        type: "stage_completed",
        stageId: "expand",
        action: "Second discovery round finished",
        status: "ok",
      });
    }
    if (signal?.aborted) return finishIncomplete("Stopped. Partial results kept.");

    const wantResearch = input.research !== false && Boolean(providerEnv(deps.env).TAVILY_API_KEY);
    if (wantResearch && candidates.size) {
      const ranked = [...candidates.values()].sort((a, b) => (b.affinity ?? -1) - (a.affinity ?? -1)).slice(0, 6);
      send({
        type: "stage_started",
        stageId: "research",
        action: "Reading public partnership leads",
        toolSummary: "External search provider: Tavily",
        status: "running",
      });
      const researchFn = options?.researchFn ?? tavilySearch;
      for (const candidate of ranked) {
        if (signal?.aborted) return finishIncomplete("Stopped during research. Partial results kept.");
        try {
          const leads = await researchFn({
            candidateId: candidate.id,
            name: candidate.name,
            category: candidate.category,
            city: input.brief.city,
            country: input.brief.country,
            env: providerEnv(deps.env),
            fetch: deps.fetch,
            now,
            signal,
            delay: deps.delay,
          });
          research.push(...leads);
        } catch (error) {
          send({
            type: "warning",
            stageId: "research",
            action: `Research skipped for ${candidate.name}`,
            status: "warning",
            error: error instanceof Error ? error.message : "Research failed.",
          });
        }
      }
      send({
        type: "stage_completed",
        stageId: "research",
        action: "Public leads collected",
        toolSummary: `${research.length} leads. These do not confirm quotes, rights, or availability.`,
        status: "ok",
        research,
      });
    }

    const list = [...candidates.values()];
    const portfolio = list.length ? optimisePortfolio(list, commercial, input.brief, weights, input.excludeIds ?? []) : null;
    const authFailed = firstErrors.length === DOMAIN_ORDER.length && candidates.size === 0;
    if (authFailed) {
      send({
        type: "error",
        stageId: "run",
        action: "Discovery failed",
        status: "error",
        error: firstErrors[0] ?? "Qloo could not be reached.",
      });
      return { candidates: [], portfolio: null, incomplete: false };
    }
    send({
      type: "run_completed",
      stageId: "run",
      action: mode === "replace" ? "Substitute search finished" : "Discovery finished",
      toolSummary: `${list.length} candidates across ${new Set(list.map((candidate) => candidate.entityType)).size} categories`,
      status: list.length ? "complete" : "empty",
      portfolio,
      research,
    });
    return { candidates: list, portfolio, incomplete };
  } catch (error) {
    if (isAbort(error) || signal?.aborted) return finishIncomplete("Stopped. Partial results kept.");
    const limit = error instanceof Error && error.name === "LimitError";
    if (limit && candidates.size) return finishIncomplete(error instanceof Error ? error.message : "Run limit reached.");
    send({
      type: "error",
      stageId: "run",
      action: "Discovery stopped",
      status: "error",
      error: error instanceof Error ? error.message : "Discovery failed.",
    });
    return { candidates: [...candidates.values()], portfolio: null, incomplete: false };
  }
}

export function verifiedCandidates(envelopes: SignedEnvelope[], secret: string, now = Date.now()): { candidates: Candidate[]; warnings: string[] } {
  const candidates: Candidate[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const envelope of envelopes) {
    const verified = verifyEnvelope(envelope, secret, now);
    if (!verified.ok) {
      warnings.push(verified.reason);
      continue;
    }
    for (const candidate of verified.payload.candidates) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      candidates.push(candidate);
    }
  }
  return { candidates, warnings };
}
