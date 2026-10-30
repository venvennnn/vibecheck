import { verifiedCandidates } from "@/lib/agent/controller";
import { allow, clientKey, jsonError, meta, readJson, validationError } from "@/lib/api/guard";
import { generateProposal, proposalContext } from "@/lib/providers/gemini";
import { ProviderError } from "@/lib/providers/qloo";
import { CampaignBriefSchema, CommercialEvidenceSchema, PortfolioSchema, ResearchLeadSchema, SignedEnvelopeSchema } from "@/lib/schemas";
import { z } from "zod";

export const maxDuration = 60;

const BodySchema = z.object({
  revision: z.number().int().nonnegative(),
  brief: CampaignBriefSchema,
  portfolio: PortfolioSchema,
  envelopes: z.array(SignedEnvelopeSchema).max(20),
  commercial: z.array(CommercialEvidenceSchema).max(40).default([]),
  research: z.array(ResearchLeadSchema).max(24).default([]),
});

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  if (!allow(`brief:${clientKey(request)}`, 8, 10 * 60 * 1000)) {
    return jsonError(429, "Too many proposal requests.", 0);
  }
  const body = await readJson(request, 500_000);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  if (parsed.data.portfolio.feasibility !== "feasible" || !parsed.data.portfolio.selectedIds.length) {
    return jsonError(400, "Generate prose only for a feasible portfolio.", parsed.data.revision);
  }
  const verified = verifiedCandidates(parsed.data.envelopes, process.env.EVIDENCE_SIGNING_SECRET ?? "");
  const byId = new Map(verified.candidates.map((candidate) => [candidate.id, candidate]));
  if (parsed.data.portfolio.selectedIds.some((id) => !byId.has(id))) {
    return jsonError(400, "Proposal partners must come from signed Qloo evidence.", parsed.data.revision, {
      warnings: verified.warnings,
    });
  }
  const selected = parsed.data.portfolio.selectedIds.map((id) => byId.get(id)!);
  const research = parsed.data.research.filter((lead) => parsed.data.portfolio.selectedIds.includes(lead.candidateId));
  const commercial = parsed.data.commercial.filter((item) => parsed.data.portfolio.selectedIds.includes(item.candidateId));
  try {
    const proposal = await generateProposal(
      proposalContext({
        brief: parsed.data.brief,
        candidates: selected,
        commercial,
        research,
        includeQloo: true,
      }),
    );
    return Response.json({
      ...meta(parsed.data.revision, crypto.randomUUID(), startedAt, [
        ...verified.warnings,
        "Review the proposal. Citation checks do not prove the prose is right.",
      ]),
      proposal,
    });
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : "Proposal generation failed.";
    const status = error instanceof ProviderError && error.kind === "config" ? 503 : 502;
    return jsonError(status, message, parsed.data.revision);
  }
}
