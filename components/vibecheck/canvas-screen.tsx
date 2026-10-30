"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { TextInput } from "@/components/ui/field";
import { CategoryArt } from "@/components/vibecheck/category-art";
import { EvidenceDrawer } from "@/components/vibecheck/evidence-drawer";
import { affinityText, domainLabel, money } from "@/components/vibecheck/format";
import { Note } from "@/components/vibecheck/notes";
import { PortfolioPanel } from "@/components/vibecheck/portfolio-panel";
import { BriefForm } from "@/components/vibecheck/brief-form";
import { useOptimiser } from "@/components/vibecheck/use-optimiser";
import { streamNdjson } from "@/lib/client/stream";
import { DOMAIN_ORDER } from "@/lib/domains";
import { explainLines } from "@/lib/evidence/explain";
import { commercialStatus } from "@/lib/evidence/commercial";
import { portfolioFromResult, toOptimiseInput } from "@/lib/optimisation/prepare";
import { CampaignBriefSchema, type CampaignBrief, type Candidate } from "@/lib/schemas";
import { useCampaign } from "@/lib/store/campaign-store";
import { cn } from "@/lib/utils";

const FILTERS = ["all", ...DOMAIN_ORDER] as const;

export function CanvasScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const state = useCampaign();
  const optimise = useOptimiser();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"affinity" | "name">("affinity");
  const [savedOnly, setSavedOnly] = useState(false);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const started = useRef(false);

  const ready = CampaignBriefSchema.safeParse(state.brief);

  useEffect(() => {
    if (!state.candidates.length || !ready.success) return;
    let cancelled = false;
    const input = toOptimiseInput(state.candidates, state.commercial, ready.data, state.weights);
    void optimise(input).then((result) => {
      if (!cancelled) state.setPortfolio(portfolioFromResult(result, state.candidates));
    });
    return () => {
      cancelled = true;
    };
    // Recompute locally whenever the mix inputs change. No provider call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.candidates,
    state.commercial,
    state.weights,
    state.brief.constraints,
    state.brief.excludedPartnerIds,
    state.brief.budget,
    state.brief.currency,
    state.brief.startDate,
    state.brief.endDate,
  ]);

  useEffect(() => {
    if (params.get("run") !== "1" || started.current || !state.hydrated) return;
    started.current = true;
    router.replace("/canvas");
    void discover("discover");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated]);

  async function discover(mode: "discover" | "replace") {
    const parsed = CampaignBriefSchema.safeParse(useCampaign.getState().brief);
    if (!parsed.success) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    state.beginRun();
    try {
      await streamNdjson(
        "/api/discover",
        {
          revision: parsed.data.revision,
          brief: parsed.data,
          mode,
          excludeIds: parsed.data.excludedPartnerIds,
          research: true,
          weights: useCampaign.getState().weights,
        },
        (event) => useCampaign.getState().applyEvent(event),
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted) {
        useCampaign.getState().applyEvent({
          runId: "local",
          stageId: "run",
          requestId: "local",
          type: "run_completed",
          action: "Stopped. Partial results kept.",
          toolSummary: null,
          timestamp: new Date().toISOString(),
          error: null,
          status: "incomplete",
          revision: useCampaign.getState().revision,
        });
        return;
      }
      useCampaign.getState().applyEvent({
        runId: "local",
        stageId: "run",
        requestId: "local",
        type: "error",
        action: "Discovery stopped",
        toolSummary: null,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Discovery failed.",
        status: "error",
        revision: useCampaign.getState().revision,
      });
    }
  }

  async function removePartner(id: string) {
    const current = useCampaign.getState();
    const name = current.candidates.find((candidate) => candidate.id === id)?.name ?? "Partner";
    const before = current.portfolio?.selectedIds ?? [];
    current.excludeCandidate(id);
    const parsed = CampaignBriefSchema.safeParse(useCampaign.getState().brief);
    if (!parsed.success) return;
    let portfolio = portfolioFromResult(
      await optimise(toOptimiseInput(current.candidates, current.commercial, parsed.data, current.weights)),
      current.candidates,
    );
    if (portfolio.feasibility === "infeasible") {
      current.setChangeNote(`Searching for a substitute after removing ${name}. Locality stays in place.`);
      await discover("replace");
      const next = useCampaign.getState();
      const again = CampaignBriefSchema.safeParse(next.brief);
      if (again.success) {
        portfolio = portfolioFromResult(
          await optimise(toOptimiseInput(next.candidates, next.commercial, again.data, next.weights)),
          next.candidates,
        );
      }
    }
    current.setPortfolio(portfolio);
    const afterNames = portfolio.selectedIds
      .map((selected) => current.candidates.find((candidate) => candidate.id === selected)?.name ?? selected)
      .join(", ");
    const same = before.join("|") === portfolio.selectedIds.join("|");
    current.setChangeNote(
      portfolio.feasibility === "infeasible"
        ? `${name} is out. No feasible mix yet. ${portfolio.bindingIssues[0] ?? ""}`
        : same
          ? `${name} is excluded. The remaining mix still fits.`
          : `${name} left the mix. It is now ${afterNames}.`,
    );
  }

  const visible = useMemo(() => {
    let list = [...state.candidates];
    if (filter !== "all") list = list.filter((candidate) => candidate.entityType === filter);
    if (savedOnly) list = list.filter((candidate) => state.bookmarks.includes(candidate.id));
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      list = list.filter((candidate) => candidate.name.toLowerCase().includes(needle));
    }
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.affinity ?? -1) - (a.affinity ?? -1) || a.name.localeCompare(b.name);
    });
    if (filter === "all" && sort === "affinity") {
      const spread: Candidate[] = [];
      const seen = new Set<string>();
      for (const domain of DOMAIN_ORDER) {
        const found = list.find((candidate) => candidate.entityType === domain);
        if (found) {
          spread.push(found);
          seen.add(found.id);
        }
      }
      for (const candidate of list) if (!seen.has(candidate.id)) spread.push(candidate);
      return spread;
    }
    return list;
  }, [filter, savedOnly, search, sort, state.bookmarks, state.candidates]);

  const preview = state.candidates.length === 0 && (state.runStatus === "idle" || state.runStatus === "running");
  const evidence = state.candidates.find((candidate) => candidate.id === evidenceId) ?? null;
  const brief = ready.success ? ready.data : null;

  return (
    <main className="mx-auto max-w-[1440px] px-5 py-8 md:px-12 md:py-10">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-[12px] tracking-[0.16em] text-[#626262]">DESIGN 02 / COLLABORATION CANVAS</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="display-title">
                Good company.
                <br />
                <span className="underline decoration-[#F05A36] decoration-[3px] underline-offset-[8px]">Better possibilities.</span>
              </h1>
              <p className="mt-4 text-[18px]">Discover cultural connections worth building on.</p>
            </div>
            <Metadata brief={state.brief} onEdit={() => setBriefOpen(true)} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <TextInput aria-label="Search discoveries" className="max-w-xs" placeholder="Search discoveries" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select aria-label="Sort discoveries" className="min-h-12 rounded-[4px] border border-[#DEDEDE] bg-white px-3" value={sort} onChange={(event) => setSort(event.target.value as "affinity" | "name")}>
              <option value="affinity">Sort by Qloo affinity</option>
              <option value="name">Sort by name</option>
            </select>
            <button type="button" className={cn("min-h-11 px-3 text-[14px]", savedOnly && "underline")} onClick={() => setSavedOnly((value) => !value)}>
              Bookmarks
            </button>
            {state.runStatus === "running" ? (
              <Button variant="outline" data-testid="stop-run" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void discover("discover")} disabled={!ready.success}>
                Run discovery
              </Button>
            )}
          </div>
          {state.runAction && <p className="mt-4 text-[15px]">{state.runAction}</p>}
          {state.runError && <p className="mt-2 text-[15px] text-[#F05A36]">{state.runError}</p>}
          {state.changeNote && <p className="mt-2 max-w-[640px] text-[15px]">{state.changeNote}</p>}
          {state.runStatus === "incomplete" && <p className="mt-2 text-[14px] text-[#626262]">This run is incomplete. Cards already received are kept.</p>}
          {state.runStatus === "empty" && <p className="mt-2 text-[15px]">Qloo returned no candidates for this brief.</p>}

          {preview ? (
            <PreviewBoard running={state.runStatus === "running"} />
          ) : (
            <CandidateBoard
              candidates={visible}
              pinned={state.brief.constraints.pinnedIds}
              bookmarks={state.bookmarks}
              brief={brief}
              commercial={state.commercial}
              onEvidence={setEvidenceId}
              onPin={state.togglePin}
              onBookmark={state.toggleBookmark}
            />
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-[14px]",
                    filter === item ? "border-[#111111] bg-[#111111] text-white" : "border-[#DEDEDE] bg-white",
                  )}
                  onClick={() => setFilter(item)}
                >
                  {item === "all" ? "All" : domainLabel(item)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {(state.portfolio?.selectedIds ?? []).slice(0, 4).map((id) => {
                  const candidate = state.candidates.find((item) => item.id === id);
                  return (
                    <span key={id} className="size-10 border border-[#DEDEDE] bg-[#F3F3F3]">
                      {candidate?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={candidate.imageUrl} alt="" className="size-10 object-cover" />
                      ) : null}
                    </span>
                  );
                })}
              </div>
              <button type="button" className="min-h-11 text-[14px] underline underline-offset-4" onClick={() => setPortfolioOpen(true)}>
                View portfolio
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-[#626262]">
            <button type="button" className="min-h-11 underline" onClick={() => visible[0] && setEvidenceId(visible[0].id)}>
              Explore the evidence
            </button>
            <Link href="/graph" className="inline-flex min-h-11 items-center text-[13px] underline">
              Cultural graph
            </Link>
            {preview && <span>Design preview · illustrative connections</span>}
            {state.portfolio && state.portfolio.heldBackIds.length > 0 && (
              <button type="button" className="min-h-11 underline" onClick={() => setHeldOpen((value) => !value)}>
                {state.portfolio.heldBackIds.length} more discoveries
              </button>
            )}
          </div>
          {heldOpen && (
            <ul className="mt-3 border border-[#DEDEDE]">
              {state.portfolio?.heldBackIds.map((id) => {
                const candidate = state.candidates.find((item) => item.id === id);
                if (!candidate) return null;
                return (
                  <li key={id} className="flex min-h-11 items-center justify-between border-b border-[#DEDEDE] px-3 last:border-b-0">
                    <span>{candidate.name}</span>
                    <span className="text-[13px] text-[#626262]">{domainLabel(candidate.entityType)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <aside className="hidden border-l border-[#DEDEDE] pl-8 lg:block">
          <PortfolioPanel
            brief={brief ?? state.brief}
            candidates={state.candidates}
            portfolio={state.portfolio}
            weights={state.weights}
            onWeights={state.setWeights}
            onRemove={(id) => void removePartner(id)}
            onBuild={() => router.push("/portfolio")}
            busy={state.runStatus === "running"}
          />
          <Button variant="ghost" className="mt-4" onClick={() => state.portfolio?.selectedIds[0] && void removePartner(state.portfolio.selectedIds[state.portfolio.selectedIds.length - 1])}>
            Plans change
          </Button>
        </aside>
      </div>

      <div className="no-print mt-6 lg:hidden">
        <Button variant="outline" onClick={() => setPortfolioOpen(true)}>
          Portfolio
        </Button>
      </div>

      <Sheet open={portfolioOpen} onOpenChange={setPortfolioOpen} title="Portfolio">
        <PortfolioPanel
          brief={brief ?? state.brief}
          candidates={state.candidates}
          portfolio={state.portfolio}
          weights={state.weights}
          onWeights={state.setWeights}
          onRemove={(id) => void removePartner(id)}
          onBuild={() => router.push("/portfolio")}
          busy={state.runStatus === "running"}
        />
        <Button variant="ghost" className="mt-4" onClick={() => state.portfolio?.selectedIds.at(-1) && void removePartner(state.portfolio.selectedIds.at(-1)!)}>
          Plans change
        </Button>
      </Sheet>
      <Sheet open={briefOpen} onOpenChange={setBriefOpen} title="Edit brief" wide>
        <BriefForm compact />
      </Sheet>
      <EvidenceDrawer
        candidate={evidence}
        candidates={state.candidates}
        brief={brief}
        research={state.research}
        commercial={state.commercial.find((item) => item.candidateId === evidence?.id) ?? null}
        envelopes={state.envelopes}
        onClose={() => setEvidenceId(null)}
        onSave={state.setCommercial}
      />
    </main>
  );
}

function Metadata({ brief, onEdit }: { brief: { brandName: string; city: string; country: string; budget: number; currency: string }; onEdit: () => void }) {
  return (
    <dl className="grid w-full max-w-[420px] grid-cols-[140px_1fr_auto] border border-[#DEDEDE] text-[14px]">
      <dt className="border-b border-[#DEDEDE] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-[#626262]">Running brand</dt>
      <dd className="border-b border-[#DEDEDE] px-3 py-3">{brief.brandName || "—"}</dd>
      <dd className="flex items-center justify-end border-b border-[#DEDEDE] px-3 py-3">
        <Image src="/collage/sneaker.jpg" alt="" width={28} height={28} className="size-7 object-cover" />
      </dd>
      <dt className="border-b border-[#DEDEDE] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-[#626262]">Location</dt>
      <dd className="border-b border-[#DEDEDE] px-3 py-3">{brief.city || "—"}</dd>
      <dd className="flex items-center border-b border-[#DEDEDE] px-3 py-3 text-[#626262]"><MapPin size={14} aria-hidden /> {brief.country}</dd>
      <dt className="px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-[#626262]">Planning budget</dt>
      <dd className="px-3 py-3">{brief.budget ? money(brief.budget, brief.currency || "USD") : "—"}</dd>
      <dd className="px-3 py-3">
        <button type="button" className="min-h-11 underline" onClick={onEdit}>Edit</button>
      </dd>
    </dl>
  );
}

function PreviewBoard({ running }: { running: boolean }) {
  return (
    <div className="relative mt-8 min-h-[280px] md:min-h-[640px]">
      <div className="grid gap-4 md:hidden">
        <Image src="/collage/cafe.jpg" alt="" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
        <Image src="/collage/books.jpg" alt="" width={600} height={800} className="aspect-[3/4] w-full object-cover" />
      </div>
      <div className="relative hidden min-h-[760px] overflow-hidden md:block">
        <figure className="absolute top-2 left-[7%] w-[34%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/cafe.jpg" alt="" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
          <figcaption className="px-3 py-2 text-[14px]">A listening café</figcaption>
        </figure>
        <figure className="absolute top-[54%] left-0 w-[28%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/runners.jpg" alt="" width={960} height={540} className="aspect-[16/10] w-full object-cover" />
          <figcaption className="px-3 py-2 text-[14px]">People in motion</figcaption>
        </figure>
        <div className="absolute top-[28%] left-[43%] w-[18%] bg-[#2144ED] p-3 text-white">
          <p className="font-tight text-[18px] font-extrabold">YOUR BRAND</p>
          <Image src="/collage/sneaker.jpg" alt="" width={400} height={400} className="mt-2 aspect-square w-full object-cover" />
        </div>
        <figure className="absolute top-0 right-[8%] w-[26%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/books.jpg" alt="" width={600} height={800} className="aspect-[3/4] w-full object-cover" />
          <figcaption className="px-3 py-2 text-[14px]">An independent bookshop</figcaption>
        </figure>
        <figure className="absolute top-[56%] left-[30%] w-[34%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/venue.jpg" alt="" width={960} height={540} className="aspect-video w-full object-cover" />
          <figcaption className="px-3 py-2 text-[14px]">A neighbourhood venue</figcaption>
        </figure>
        <figure className="absolute top-[50%] right-0 w-[26%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/studio.jpg" alt="" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
          <figcaption className="px-3 py-2 text-[14px]">A design studio</figcaption>
        </figure>
        <Note className="top-0 left-[38%] hidden w-36 xl:block" rotate={-3}>
          Movement people culture brighter cities
        </Note>
        <Note className="top-[18%] left-0 hidden w-32 xl:block" rotate={-2}>
          Shared audiences. Creative energy. IRL moments.
        </Note>
        <p className="pointer-events-none absolute top-[40%] left-[39%] font-note text-[22px] text-[#F05A36]">Music</p>
        <p className="pointer-events-none absolute top-[26%] left-[60%] font-note text-[22px] text-[#F05A36]">Books</p>
        <p className="pointer-events-none absolute top-[50%] left-[46%] font-note text-[22px] text-[#F05A36]">Local culture</p>
      </div>
      {running && <p className="mt-4 text-[14px] text-[#626262]">These photographs are a design preview, not live recommendations.</p>}
    </div>
  );
}

function CandidateBoard({
  candidates,
  pinned,
  bookmarks,
  brief,
  commercial,
  onEvidence,
  onPin,
  onBookmark,
}: {
  candidates: Candidate[];
  pinned: string[];
  bookmarks: string[];
  brief: CampaignBrief | null;
  commercial: { candidateId: string }[];
  onEvidence: (id: string) => void;
  onPin: (id: string) => void;
  onBookmark: (id: string) => void;
}) {
  const [first, ...rest] = candidates;
  const stacked = rest.slice(0, 2);
  const more = rest.slice(2);
  if (!first) return <p className="mt-8 text-[16px]">No discoveries in this view.</p>;
  return (
    <div className="mt-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.7fr)]">
        <CandidateCard candidate={first} large pinned={pinned.includes(first.id)} saved={bookmarks.includes(first.id)} brief={brief} commercial={commercial} onEvidence={onEvidence} onPin={onPin} onBookmark={onBookmark} />
        <div className="grid gap-4">
          {stacked.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} pinned={pinned.includes(candidate.id)} saved={bookmarks.includes(candidate.id)} brief={brief} commercial={commercial} onEvidence={onEvidence} onPin={onPin} onBookmark={onBookmark} />
          ))}
        </div>
      </div>
      {more.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {more.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} pinned={pinned.includes(candidate.id)} saved={bookmarks.includes(candidate.id)} brief={brief} commercial={commercial} onEvidence={onEvidence} onPin={onPin} onBookmark={onBookmark} />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  large = false,
  pinned,
  saved,
  brief,
  commercial,
  onEvidence,
  onPin,
  onBookmark,
}: {
  candidate: Candidate;
  large?: boolean;
  pinned: boolean;
  saved: boolean;
  brief: CampaignBrief | null;
  commercial: { candidateId: string }[];
  onEvidence: (id: string) => void;
  onPin: (id: string) => void;
  onBookmark: (id: string) => void;
}) {
  const why = explainLines(candidate.explainability);
  const record = commercial.find((item) => item.candidateId === candidate.id) as Parameters<typeof commercialStatus>[0];
  const status = brief ? commercialStatus(record, brief) : "none";
  const statusLabel =
    status === "quote" ? "Sourced upper bound" : status === "allocation" ? "Allocation, not quote" : status === "blocked" ? "Blocked" : "No quote yet";
  return (
    <article data-testid="candidate-card" className="border border-[#DEDEDE] bg-white">
      <div className={cn("relative bg-white", large ? "aspect-[4/3]" : "aspect-[16/10]")}>
        {candidate.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.imageUrl} alt={candidate.name} className="h-full w-full object-cover" />
        ) : (
          <CategoryArt type={candidate.entityType} />
        )}
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className="text-[12px] uppercase tracking-[0.14em] text-[#626262]">{candidate.category}</p>
        <h2 className="font-tight text-[22px] font-bold tracking-[-0.03em]">{candidate.name}</h2>
        <p className="text-[14px] text-[#111111]">{why.available ? why.lines[0] : "Explainability unavailable."}</p>
        <p className="text-[13px] text-[#626262]">
          Qloo affinity {affinityText(candidate.affinity)} · {statusLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-11 px-1 text-[14px] underline" data-testid="evidence-open" onClick={() => onEvidence(candidate.id)}>
            Why this fits
          </button>
          <button type="button" className="inline-flex min-h-11 items-center gap-1 px-2 text-[14px]" onClick={() => onPin(candidate.id)}>
            <Plus size={14} aria-hidden /> {pinned ? "Pinned" : "Add to portfolio"}
          </button>
          <button type="button" className="inline-flex min-h-11 items-center gap-1 px-2 text-[14px]" aria-pressed={saved} onClick={() => onBookmark(candidate.id)}>
            <Bookmark size={14} aria-hidden /> {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </article>
  );
}
