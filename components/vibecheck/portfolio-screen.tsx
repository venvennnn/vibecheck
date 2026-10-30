"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CategoryArt } from "@/components/vibecheck/category-art";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { affinityText, domainLabel, money, when } from "@/components/vibecheck/format";
import { useOptimiser } from "@/components/vibecheck/use-optimiser";
import { portfolioFromResult, toOptimiseInput } from "@/lib/optimisation/prepare";
import { postJson } from "@/lib/client/stream";
import { commercialStatus } from "@/lib/evidence/commercial";
import { parseCommercialCsv } from "@/lib/exports/csv";
import { buildProposalDocument, proposalCsv } from "@/lib/exports/proposal";
import { CampaignBriefSchema, type CampaignProposal, type Weights } from "@/lib/schemas";
import { useCampaign } from "@/lib/store/campaign-store";

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PortfolioScreen() {
  const state = useCampaign();
  const ready = CampaignBriefSchema.safeParse(state.brief);
  const optimise = useOptimiser();
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const tune = useRef(0);

  function applyWeight(patch: Partial<Weights>) {
    state.setWeights(patch);
    const ticket = ++tune.current;
    const current = useCampaign.getState();
    const parsed = CampaignBriefSchema.safeParse(current.brief);
    if (!parsed.success || current.candidates.length === 0) return;
    void optimise(toOptimiseInput(current.candidates, current.commercial, parsed.data, current.weights)).then((result) => {
      if (ticket !== tune.current) return;
      const latest = useCampaign.getState();
      latest.setPortfolio(portfolioFromResult(result, latest.candidates));
    });
  }

  function proposalDocument() {
    return buildProposalDocument({
      brief: state.brief,
      candidates: state.candidates,
      commercial: state.commercial,
      research: state.research,
      portfolio: state.portfolio,
      prose: state.prose,
      proseStale: state.proseStale,
      generatedAt: new Date().toISOString(),
    });
  }
  const selected = (state.portfolio?.selectedIds ?? [])
    .map((id) => state.candidates.find((candidate) => candidate.id === id))
    .filter((candidate) => Boolean(candidate));

  async function writeProposal() {
    if (!ready.success || !state.portfolio) return;
    setWriting(true);
    setError(null);
    try {
      const response = await postJson<{ proposal: CampaignProposal }>("/api/brief", {
        revision: ready.data.revision,
        brief: ready.data,
        portfolio: state.portfolio,
        envelopes: state.envelopes,
        commercial: state.commercial,
        research: state.research,
      });
      state.setProse(response.proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The proposal could not be written.");
    } finally {
      setWriting(false);
    }
  }

  if (!state.portfolio || !ready.success) {
    return (
      <main className="mx-auto max-w-[900px] px-5 py-16 md:px-12">
        <p className="text-[12px] tracking-[0.16em] text-[#626262]">03 / CAMPAIGN PROPOSAL</p>
        <h1 className="display-title mt-4">Nothing selected yet.</h1>
        <p className="mt-4 max-w-[460px] text-[18px]">Finish a brief and a feasible mix on the canvas. This page will not invent partners.</p>
        <Button className="mt-8" asChild>
          <Link href="/canvas">Back to the canvas</Link>
        </Button>
      </main>
    );
  }

  const spent = state.portfolio.contingencyTotal;
  const cap = ready.data.budget;
  const usedRatio = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  return (
    <main className="bg-white" data-testid="optimizer-screen">
      <section className="border-b border-[#DEDEDE] bg-[#F6F3F2] px-5 py-3 text-[13px] text-[#626262] md:px-12">
        Pool of {state.portfolio.poolIds.length} eligible candidates · {state.portfolio.combinationsConsidered.toLocaleString("en-US")} combinations in this pool
        {state.portfolio.optimalWithinPool && state.portfolio.feasibility === "feasible" ? " · optimal only inside this pool" : ""}
      </section>
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-12 lg:grid-cols-12 md:px-12">
        <div className="lg:col-span-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#F05A36] uppercase">Calibration</p>
          <h2 className="mt-2 text-[22px] font-semibold">Target weights</h2>
          <div className="mt-6 space-y-4">
            <Weight label="Cultural fit" value={state.weights.fit} max={2} onChange={(fit) => applyWeight({ fit })} />
            <Weight label="Variety" value={state.weights.variety} max={2} onChange={(variety) => applyWeight({ variety })} />
            <Weight label="Cost" value={state.weights.cost} max={2} onChange={(cost) => applyWeight({ cost })} />
            <Weight label="Similarity penalty" value={state.weights.similarity} max={2} onChange={(similarity) => applyWeight({ similarity })} />
          </div>
          <p className="mt-4 text-[13px] text-[#626262]">Changing a weight recomputes locally and marks campaign prose stale.</p>
          <Link href="/canvas" className="mt-4 inline-flex min-h-11 items-center text-[14px] underline">
            Plans change
          </Link>
        </div>
        <div className="lg:col-span-8">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#626262] uppercase">Optimizer</p>
          <h1 className="display-title mt-3">{ready.data.brandName} in good company.</h1>
          <p className="mt-4 text-[18px]">
            {ready.data.city}, {ready.data.country} · {ready.data.startDate} to {ready.data.endDate} · {money(ready.data.budget, ready.data.currency)}
          </p>
          <div className="mt-6">
            <div className="flex justify-between text-[12px] text-[#626262]">
              <span>Planning total with contingency</span>
              <span>{money(spent, ready.data.currency)} of {money(cap, ready.data.currency)}</span>
            </div>
            <div className="mt-2 h-2 bg-[#F3F3F3]">
              <div className="h-full bg-[#2144ED]" style={{ width: `${usedRatio}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-[#626262]">Allocations are not quotes.</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {selected.map((candidate) =>
              candidate ? (
                <article key={candidate.id} className="border border-[#DEDEDE] bg-white">
                  <div className="aspect-[4/3]">
                    {candidate.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={candidate.imageUrl} alt={candidate.name} className="h-full w-full object-cover" />
                    ) : (
                      <CategoryArt type={candidate.entityType} />
                    )}
                  </div>
                  <div className="px-3 py-3">
                    <p className="text-[11px] font-semibold tracking-[0.12em] text-[#626262] uppercase">{domainLabel(candidate.entityType)}</p>
                    <h2 className="mt-1 text-[18px] font-semibold">{candidate.name}</h2>
                    <p className="mt-2 text-[13px]">Qloo affinity {affinityText(candidate.affinity)}</p>
                  </div>
                </article>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[980px] px-5 pb-12 md:px-12">
      {state.proseStale && (
        <p className="border border-[#DEDEDE] px-4 py-3 text-[15px]">The mix changed. Regenerate the proposal before you treat the prose as current.</p>
      )}

      <section className="mt-12 border-t border-[#DEDEDE] pt-8">
        <h2 className="font-tight text-[28px] font-bold tracking-[-0.03em]">The mix</h2>
        <ul className="mt-4 divide-y divide-[#DEDEDE] border-y border-[#DEDEDE]">
          {selected.map((candidate) => {
            if (!candidate) return null;
            const evidence = state.commercial.find((item) => item.candidateId === candidate.id);
            const status = commercialStatus(evidence, ready.data);
            return (
              <li key={candidate.id} className="grid gap-2 py-4 sm:grid-cols-[1.4fr_1fr_1fr]">
                <div>
                  <p className="text-[16px]">{candidate.name}</p>
                  <p className="text-[13px] text-[#626262]">{candidate.category}</p>
                </div>
                <p className="text-[14px]">Qloo affinity {affinityText(candidate.affinity)}</p>
                <p className="text-[14px]">
                  {status === "quote"
                    ? `Quote ${money(evidence?.priceHigh, evidence?.currency ?? ready.data.currency)}`
                    : status === "allocation"
                      ? `Allocation, not quote ${money(evidence?.allocation, ready.data.currency)}`
                      : status === "blocked"
                        ? "Blocked"
                        : "No commercial check"}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[14px] text-[#626262]">
          Planning total with contingency {money(state.portfolio.contingencyTotal, ready.data.currency)}. Optimal only inside {state.portfolio.poolIds.length} displayed candidates.
        </p>
      </section>

      <section className="mt-12 border-t border-[#DEDEDE] pt-8">
        <h2 className="font-tight text-[28px] font-bold tracking-[-0.03em]">Proposal</h2>
        {state.prose ? (
          <div className="mt-4 space-y-4">
            {state.prose.concepts.map((concept) => (
              <article key={concept.title}>
                <h3 className="text-[18px]">{concept.title}</h3>
                <p className="mt-2">{concept.summary}</p>
                <ul className="mt-2 list-disc pl-5 text-[15px]">
                  {concept.deliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
            <p className="whitespace-pre-wrap text-[16px]">{state.prose.prose}</p>
            <div>
              <h3 className="text-[16px]">Pilot · {state.prose.pilot.name}</h3>
              <ol className="mt-2 list-decimal pl-5">
                {state.prose.pilot.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="mt-2 text-[14px] text-[#626262]">{state.prose.pilot.successSignal}</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-[16px]">Campaign prose comes from Gemini, grounded in the evidence you supply. Deterministic code still owns the constraints and the prices.</p>
        )}
        <Button className="mt-6" onClick={() => void writeProposal()} disabled={writing || state.portfolio.feasibility !== "feasible"}>
          {writing ? "Writing…" : state.prose ? "Regenerate proposal" : "Write the proposal"}
        </Button>
        {error && <p className="mt-3 text-[14px] text-[#F05A36]">{error}</p>}
      </section>

      <section className="mt-12 border-t border-[#DEDEDE] pt-8">
        <h2 className="font-tight text-[28px] font-bold tracking-[-0.03em]">Assumptions and open checks</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px]">
          {state.portfolio.assumptions.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {state.portfolio.unresolvedChecks.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {state.prose?.unresolvedChecks.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {state.prose?.openQuestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-4 text-[14px] text-[#626262]">Commercial checks on file are user-attested. Last retrieval {when(state.candidates[0]?.retrievedAt)}.</p>
      </section>

      <section className="no-print mt-12 border-t border-[#DEDEDE] pt-8">
        <h2 className="font-tight text-[28px] font-bold tracking-[-0.03em]">Review, then export</h2>
        <p className="mt-3 max-w-[640px] text-[15px]">
          Source checks stop invented citations. They do not prove the prose is right. Affinity does not establish availability, sponsorship price, or business lift.
        </p>
        <label className="mt-4 flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" className="size-4" checked={state.reviewed} onChange={(event) => state.setReviewed(event.target.checked)} />
          I have reviewed this proposal.
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            data-testid="export-json"
            disabled={!state.reviewed}
            onClick={() => download("vibecheck-proposal.json", JSON.stringify(proposalDocument(), null, 2), "application/json")}
          >
            JSON
          </Button>
          <Button data-testid="export-csv" variant="outline" disabled={!state.reviewed} onClick={() => download("vibecheck-proposal.csv", proposalCsv(proposalDocument()), "text/csv")}>
            CSV
          </Button>
          <Button variant="outline" disabled={!state.reviewed} onClick={() => window.print()}>
            Print
          </Button>
          <Link href="/compare" className="inline-flex min-h-11 items-center text-[14px] underline">
            Optional comparison
          </Link>
        </div>
        <label className="mt-6 block text-[14px]">
          Import commercial CSV
          <input
            className="mt-2 block w-full text-[14px]"
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const parsed = parseCommercialCsv(await file.text());
              if (parsed.rows.length) state.mergeCommercial(parsed.rows);
              if (parsed.errors.length) setError(parsed.errors[0]);
            }}
          />
        </label>
      </section>
      </div>
    </main>
  );
}

function Weight({
  label,
  value,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[13px]">
      <span className="mb-1 flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-[#2144ED]">{value.toFixed(2)}</span>
      </span>
      <Slider aria-label={label} min={0} max={max} step={step} value={[value]} onValueChange={([next]) => onChange(next)} />
    </label>
  );
}
