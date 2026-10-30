"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { CategoryArt } from "@/components/vibecheck/category-art";
import { affinityText, domainLabel, when } from "@/components/vibecheck/format";
import { DOMAIN_ORDER, type EntityType } from "@/lib/domains";
import { commercialStatus } from "@/lib/evidence/commercial";
import { explainLines } from "@/lib/evidence/explain";
import { redact } from "@/lib/evidence/redact";
import { CampaignBriefSchema, type Candidate, type Reference } from "@/lib/schemas";
import { useCampaign } from "@/lib/store/campaign-store";
import { cn } from "@/lib/utils";

const SEED_SLOTS = [
  { x: 24, y: 30 },
  { x: 50, y: 20 },
  { x: 38, y: 46 },
  { x: 62, y: 38 },
];

const CANDIDATE_SLOTS = [
  { x: 24, y: 72 },
  { x: 76, y: 54 },
  { x: 76, y: 24 },
  { x: 50, y: 76 },
  { x: 62, y: 58 },
  { x: 38, y: 64 },
];

function linkedSeeds(candidate: Candidate, seeds: Reference[]) {
  if (!candidate.explainabilityAvailable || candidate.explainability == null) return [];
  const blob = JSON.stringify(candidate.explainability).toLowerCase();
  return seeds.filter((seed) => {
    const label = seed.label.trim().toLowerCase();
    const id = seed.qlooId?.toLowerCase() ?? "";
    return (label.length > 1 && blob.includes(label)) || (id.length > 1 && blob.includes(id));
  });
}

export function GraphScreen() {
  const state = useCampaign();
  const ready = CampaignBriefSchema.safeParse(state.brief);
  const seeds = state.brief.references.filter((reference) => reference.resolutionStatus === "confirmed" && reference.qlooId);
  const [domain, setDomain] = useState<"all" | EntityType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"graph" | "matrix">("graph");
  const [rawOpen, setRawOpen] = useState(false);

  const visible = useMemo(() => {
    const list = domain === "all" ? state.candidates : state.candidates.filter((candidate) => candidate.entityType === domain);
    return list.slice(0, 6);
  }, [domain, state.candidates]);

  const selected = visible.find((candidate) => candidate.id === selectedId) ?? visible[0] ?? null;
  const links = selected
    ? visible.flatMap((candidate) =>
        linkedSeeds(candidate, seeds).map((seed) => ({
          candidateId: candidate.id,
          seedId: seed.id,
        })),
      )
    : [];

  const counts = DOMAIN_ORDER.map((type) => ({
    type,
    count: state.candidates.filter((candidate) => candidate.entityType === type).length,
  }));
  const explain = selected ? explainLines(selected.explainability) : { available: false, lines: [] as string[] };
  const commercial = selected ? state.commercial.find((item) => item.candidateId === selected.id) : undefined;
  const status = selected && ready.success ? commercialStatus(commercial, ready.data) : "none";
  const research = selected ? state.research.filter((lead) => lead.candidateId === selected.id) : [];
  const envelope = selected
    ? state.envelopes.find((item) => item.payload.candidates.some((candidate) => candidate.id === selected.id))
    : undefined;

  return (
    <main className="bg-white">
      <section className="border-b border-[#DEDEDE] px-5 py-4 md:px-8">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[11px] font-semibold tracking-[0.14em] uppercase">Cultural reference resolution</p>
              <p className="font-mono text-[12px] text-[#626262]">GET /search · GET /v2/insights</p>
              <p className="text-[12px] text-[#626262]">{seeds.length} confirmed seeds</p>
            </div>
            <p className="max-w-sm text-[12px] text-[#626262]">
              {state.brief.city && state.brief.country
                ? `Places: ${state.brief.city}, ${state.brief.country}. Radius 0 is sent to Qloo. It does not confirm a local booking.`
                : "No locality on this brief yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <FilterButton active={domain === "all"} onClick={() => setDomain("all")}>
              All domains ({state.candidates.length})
            </FilterButton>
            {counts.map((item) => (
              <FilterButton key={item.type} active={domain === item.type} onClick={() => setDomain(item.type)}>
                {domainLabel(item.type)} ({item.count})
              </FilterButton>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#DEDEDE] pt-3">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-[#626262] uppercase">Resolved seeds</span>
          {seeds.length === 0 ? (
            <span className="text-[13px] text-[#626262]">Confirm two references on the brief.</span>
          ) : (
            seeds.map((seed) => (
              <span key={seed.id} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 border border-[#DEDEDE] px-3 text-[13px]">
                <span className="size-2 shrink-0 bg-[#2144ED]" aria-hidden />
                <span className="truncate font-semibold">{seed.label}</span>
                <span className="truncate font-mono text-[11px] text-[#626262]">{seed.entityType ?? "reference"}</span>
              </span>
            ))
          )}
        </div>
      </section>

      <div className="grid min-h-[720px] min-w-0 lg:grid-cols-12">
        <section className="min-w-0 border-b border-[#DEDEDE] lg:col-span-8 lg:border-r lg:border-b-0">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[#DEDEDE] px-5 py-3 md:px-8">
            <div className="min-w-0">
              <p className="text-[18px] font-semibold tracking-[-0.02em]">Cross-domain graph</p>
              <p className="text-[12px] text-[#626262]">Lines appear only when Qloo explainability names a confirmed seed.</p>
            </div>
            <div className="flex max-w-full flex-wrap gap-2">
              <button type="button" className={cn("min-h-11 border px-3 text-[11px] font-semibold tracking-[0.12em] uppercase", mode === "graph" ? "border-[#111111] bg-[#111111] text-white" : "border-[#DEDEDE]")} onClick={() => setMode("graph")}>
                Vector graph
              </button>
              <button type="button" className={cn("min-h-11 border px-3 text-[11px] font-semibold tracking-[0.12em] uppercase", mode === "matrix" ? "border-[#111111] bg-[#111111] text-white" : "border-[#DEDEDE]")} onClick={() => setMode("matrix")}>
                Matrix
              </button>
              <Link href="/canvas" className="inline-flex min-h-11 items-center px-3 text-[13px] underline">
                Back to explore
              </Link>
            </div>
          </div>

          {state.candidates.length === 0 ? (
            <div className="px-5 py-16 md:px-8">
              <h1 className="display-title">No live nodes yet.</h1>
              <p className="mt-4 max-w-[520px] text-[16px] text-[#626262]">
                Run discovery from a confirmed brief. This graph will not draw sample partners, hop percentages, or invented edges.
              </p>
              <Link href="/canvas" className="mt-6 inline-flex min-h-11 items-center bg-[#111111] px-4 text-[11px] font-semibold tracking-[0.12em] text-white uppercase">
                Open explore
              </Link>
            </div>
          ) : mode === "matrix" ? (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <thead className="border-b border-[#DEDEDE] text-[11px] tracking-[0.12em] text-[#626262] uppercase">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-3 py-3 font-semibold">Domain</th>
                    <th className="px-3 py-3 font-semibold">Qloo affinity</th>
                    <th className="px-5 py-3 font-semibold">Explainability</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((candidate) => {
                    const lines = explainLines(candidate.explainability);
                    return (
                      <tr key={candidate.id} className="border-b border-[#DEDEDE]">
                        <td className="px-5 py-3">
                          <button type="button" className="min-h-11 text-left font-semibold underline" onClick={() => setSelectedId(candidate.id)}>
                            {candidate.name}
                          </button>
                        </td>
                        <td className="px-3 py-3">{domainLabel(candidate.entityType)}</td>
                        <td className="px-3 py-3 font-mono">{affinityText(candidate.affinity)}</td>
                        <td className="px-5 py-3 text-[#626262]">{lines.available ? lines.lines[0] : "Explainability unavailable."}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <>
            <div className="hidden min-w-0 overflow-x-auto lg:block">
            <div className="relative min-h-[640px] min-w-[920px]">
              <div className="pointer-events-none absolute inset-0 opacity-60 bg-[linear-gradient(to_right,#DEDEDE_1px,transparent_1px),linear-gradient(to_bottom,#DEDEDE_1px,transparent_1px)] bg-[size:48px_48px]" />
              <svg className="absolute inset-0 h-full w-full" aria-hidden>
                {visible.map((candidate, index) => {
                  const slot = CANDIDATE_SLOTS[index % CANDIDATE_SLOTS.length];
                  return linkedSeeds(candidate, seeds).map((seed) => {
                    const seedIndex = seeds.findIndex((item) => item.id === seed.id);
                    const seedSlot = SEED_SLOTS[seedIndex % SEED_SLOTS.length];
                    return (
                      <line
                        key={`${seed.id}-${candidate.id}`}
                        x1={`${seedSlot.x}%`}
                        y1={`${seedSlot.y}%`}
                        x2={`${slot.x}%`}
                        y2={`${slot.y}%`}
                        stroke="#2144ED"
                        strokeDasharray="5 3"
                        strokeWidth="2"
                      />
                    );
                  });
                })}
              </svg>
              {seeds.slice(0, 4).map((seed, index) => {
                const slot = SEED_SLOTS[index];
                return (
                  <div key={seed.id} className="absolute w-36 -translate-x-1/2 -translate-y-1/2 border-2 border-[#2144ED] bg-white p-2" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
                    <p className="bg-[#2144ED] px-1 text-[9px] font-semibold tracking-[0.12em] text-white uppercase">Seed {String(index + 1).padStart(2, "0")}</p>
                    <p className="mt-1 truncate text-[14px] font-semibold">{seed.label}</p>
                    <p className="truncate font-mono text-[10px] text-[#626262]">{domainLabel(seed.entityType)}</p>
                  </div>
                );
              })}
              {visible.map((candidate, index) => {
                const slot = CANDIDATE_SLOTS[index];
                const active = selected?.id === candidate.id;
                const linked = linkedSeeds(candidate, seeds);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedId(candidate.id)}
                    className={cn(
                      "absolute w-52 -translate-x-1/2 -translate-y-1/2 border bg-white p-3 text-left",
                      active ? "border-2 border-[#2144ED]" : "border-[#DEDEDE]",
                    )}
                    style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold tracking-[0.12em] uppercase">{domainLabel(candidate.entityType)}</span>
                      <span className="font-mono text-[12px] text-[#2144ED]">{affinityText(candidate.affinity)}</span>
                    </div>
                    <p className="mt-1 truncate text-[15px] font-semibold">{candidate.name}</p>
                    <p className="mt-2 border-t border-[#DEDEDE] pt-2 text-[11px] text-[#626262]">
                      {linked.length ? `Qloo names ${linked.map((seed) => seed.label).join(", ")}` : "No readable seed link"}
                    </p>
                  </button>
                );
              })}
            </div>
            </div>
            <ul className="divide-y divide-[#DEDEDE] border-t border-[#DEDEDE] lg:hidden">
              {visible.map((candidate) => {
                const linked = linkedSeeds(candidate, seeds);
                const active = selected?.id === candidate.id;
                return (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(candidate.id)}
                      className={cn("flex w-full items-center justify-between gap-3 px-5 py-4 text-left", active && "bg-[#F6F3F2]")}
                    >
                      <span>
                        <span className="block text-[11px] font-semibold tracking-[0.12em] text-[#626262] uppercase">{domainLabel(candidate.entityType)}</span>
                        <span className="mt-1 block text-[16px] font-semibold">{candidate.name}</span>
                        <span className="mt-1 block text-[12px] text-[#626262]">
                          {linked.length ? `Qloo names ${linked.map((seed) => seed.label).join(", ")}` : "No readable seed link"}
                        </span>
                      </span>
                      <span className="font-mono text-[13px] text-[#2144ED]">{affinityText(candidate.affinity)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-[#DEDEDE] px-5 py-3 text-[13px] md:px-8">
              {links.length
                ? `${links.length} explainability link${links.length === 1 ? "" : "s"} in this view. Affinity stays a raw Qloo score.`
                : "No explainability link in this view. Absent links stay absent."}
            </p>
            </>
          )}
        </section>

        <aside className="min-w-0 bg-white lg:col-span-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DEDEDE] bg-[#F6F3F2] px-5 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase">{envelope ? "Signed Qloo envelope" : "Evidence not signed"}</p>
            <p className="font-mono text-[11px] text-[#626262]">{envelope ? "Expires with the envelope" : "Run discovery to sign it"}</p>
          </div>
          {selected ? (
            <div>
              <div className="border-b border-[#DEDEDE] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="inline-block bg-[#2144ED] px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-white uppercase">{domainLabel(selected.entityType)}</p>
                    <p className="mt-2 font-mono text-[11px] text-[#626262]">{selected.id}</p>
                    <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.03em]">{selected.name}</h1>
                    <p className="mt-2 text-[14px] text-[#626262]">{selected.description ?? "Qloo did not return a description."}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold tracking-[0.12em] text-[#626262] uppercase">Qloo affinity</p>
                    <p className="font-serif text-[40px] leading-none text-[#2144ED]">{affinityText(selected.affinity)}</p>
                    <p className="text-[11px] text-[#626262]">Not a percentage</p>
                  </div>
                </div>
                <div className="mt-4 h-28 border border-[#DEDEDE]">
                  {selected.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.imageUrl} alt={selected.name} className="h-full w-full object-cover" />
                  ) : (
                    <CategoryArt type={selected.entityType} />
                  )}
                </div>
              </div>
              <div className="space-y-3 p-5">
                <p className="border-b border-[#DEDEDE] pb-2 text-[13px] font-semibold tracking-[0.08em] uppercase">Verification ledger</p>
                <Ledger
                  index="1"
                  title="Qloo cultural signal"
                  body={explain.available ? explain.lines.join(" ") : "Explainability unavailable."}
                  meta={`Retrieved ${when(selected.retrievedAt)}`}
                />
                <Ledger
                  index="2"
                  title="External research lead"
                  body={
                    research.length
                      ? research.map((lead) => lead.snippet).join(" ")
                      : "No external search on file. A snippet would not confirm a quote, a right, or a date."
                  }
                  meta={research[0]?.url ?? "Tavily optional"}
                />
                <Ledger
                  index="3"
                  title="User-confirmed commercial detail"
                  body={
                    status === "quote"
                      ? "A sourced upper bound is on file. It stays user-attested."
                      : status === "allocation"
                        ? "Allocation, not quote."
                        : status === "blocked"
                          ? "Blocked by the commercial check on file."
                          : "No commercial check yet."
                  }
                  meta="Not a cleared term sheet"
                />
              </div>
              <div className="border-t border-[#DEDEDE] p-5">
                <button type="button" className="flex min-h-11 w-full items-center justify-between border border-[#DEDEDE] px-3 text-left text-[12px] font-semibold tracking-[0.12em] uppercase" onClick={() => setRawOpen((value) => !value)}>
                  Inspect raw evidence
                  <span>{rawOpen ? "–" : "+"}</span>
                </button>
                {rawOpen && (
                  <pre className="mt-2 max-h-64 overflow-auto bg-[#111111] p-3 text-[11px] leading-relaxed text-white">
                    {JSON.stringify(redact({ candidate: selected, envelope: envelope ?? null }), null, 2)}
                  </pre>
                )}
              </div>
              <div className="flex gap-2 border-t border-[#DEDEDE] p-5">
                <button type="button" className="min-h-11 flex-1 bg-[#111111] px-3 text-[11px] font-semibold tracking-[0.12em] text-white uppercase" onClick={() => state.togglePin(selected.id)}>
                  {state.brief.constraints.pinnedIds.includes(selected.id) ? "Pinned" : "Add to portfolio"}
                </button>
                <Link href="/portfolio" className="inline-flex min-h-11 items-center border border-[#DEDEDE] px-3 text-[11px] font-semibold tracking-[0.12em] uppercase">
                  Optimizer
                </Link>
              </div>
            </div>
          ) : (
            <p className="p-5 text-[15px] text-[#626262]">Select a discovered candidate to read its evidence.</p>
          )}
        </aside>
      </div>
    </main>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 px-3 text-[11px] font-semibold tracking-[0.12em] uppercase",
        active ? "bg-[#111111] text-white" : "border border-[#DEDEDE] bg-white text-[#626262]",
      )}
    >
      {children}
    </button>
  );
}

function Ledger({ index, title, body, meta }: { index: string; title: string; body: string; meta: string }) {
  return (
    <article className="border border-[#DEDEDE] bg-[#F6F3F2] p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center bg-[#2144ED] text-[10px] font-semibold text-white">{index}</span>
        <h2 className="text-[12px] font-semibold tracking-[0.08em] uppercase">{title}</h2>
      </div>
      <p className="mt-2 text-[13px] leading-snug">{body}</p>
      <p className="mt-2 border-t border-[#DEDEDE] pt-2 text-[11px] text-[#626262]">{meta}</p>
    </article>
  );
}
