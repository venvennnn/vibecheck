import type { BriefDraft, CampaignProposal, Candidate, CommercialEvidence, Portfolio, ResearchLead } from "@/lib/schemas";
import { commercialStatus } from "@/lib/evidence/commercial";
import { toCsv } from "@/lib/exports/csv";

export function buildProposalDocument(input: {
  brief: BriefDraft;
  candidates: Candidate[];
  commercial: CommercialEvidence[];
  research: ResearchLead[];
  portfolio: Portfolio | null;
  prose: CampaignProposal | null;
  proseStale: boolean;
  generatedAt: string;
}) {
  const selected = (input.portfolio?.selectedIds ?? [])
    .map((id) => input.candidates.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  return {
    schemaVersion: 1,
    revision: input.brief.revision,
    generatedAt: input.generatedAt,
    review: {
      proseStale: input.proseStale,
      note: "Source checks stop invented citations. They do not prove the prose is accurate. Affinity is not availability, price, or lift.",
    },
    brief: input.brief,
    portfolio: input.portfolio,
    prose: input.prose,
    partners: selected.map((candidate) => {
      const commercial = input.commercial.find((item) => item.candidateId === candidate.id);
      const status = commercialStatus(commercial, input.brief);
      return {
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
        affinity: candidate.affinity,
        affinityLabel: "Qloo affinity",
        imageUrl: candidate.imageUrl,
        costKind: status === "quote" ? "quote" : "allocation",
        planningCost: status === "quote" ? commercial?.priceHigh ?? null : commercial?.allocation ?? null,
        currency: commercial?.currency ?? input.brief.currency,
        evidence: {
          qloo: `qloo:${candidate.id}`,
          research: input.research.filter((lead) => lead.candidateId === candidate.id).map((lead) => lead.id),
          commercial: commercial ? `commercial:${candidate.id}` : null,
        },
      };
    }),
    limitations: [
      "Qloo affinity is a cultural signal. It does not establish availability, sponsorship price, or business lift.",
      "Search snippets are external research leads. They do not confirm a quote, a right, or a date.",
      "User-entered commercial details stay user-attested.",
      "A book or artist connection identifies an IP or reference opportunity. The rights-holder still needs a check.",
      "The mix is optimal only inside the displayed pool of at most 40 candidates.",
    ],
  };
}

export type ProposalDocument = ReturnType<typeof buildProposalDocument>;

export function proposalCsv(document: ProposalDocument): string {
  return toCsv(
    document.partners.map((partner) => ({
      name: partner.name,
      category: partner.category,
      qlooAffinity: partner.affinity ?? "",
      costKind: partner.costKind,
      planningCost: partner.planningCost ?? "",
      currency: partner.currency,
    })),
  );
}
