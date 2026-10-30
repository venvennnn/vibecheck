"use client";

import Link from "next/link";
import { CategoryArt } from "@/components/vibecheck/category-art";
import { affinityText, domainLabel, money } from "@/components/vibecheck/format";
import { useCampaign } from "@/lib/store/campaign-store";

export function BriefEnvelope() {
  const brief = useCampaign((state) => state.brief);
  const hydrated = useCampaign((state) => state.hydrated);
  const confirmed = brief.references.filter((reference) => reference.resolutionStatus === "confirmed" && reference.qlooId);
  return (
    <div className="mt-10 border-t border-[#DEDEDE] pt-5">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[#626262] uppercase">Active brief</p>
      <div className="mt-3 border border-[#DEDEDE] bg-white p-3 text-[13px]">
        {!hydrated || !brief.brandName ? (
          <p className="text-[#626262]">No brief in this session yet.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{brief.brandName}</span>
              <span>{brief.budget ? money(brief.budget, brief.currency || "USD") : "Budget unset"}</span>
            </div>
            <p className="mt-1 text-[#626262]">
              {confirmed.length ? confirmed.map((reference) => reference.label).join(" · ") : "References not confirmed"}
              {brief.city ? ` · ${brief.city}` : ""}
              {brief.country ? `, ${brief.country}` : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function LiveDiscoveries() {
  const candidates = useCampaign((state) => state.candidates);
  const shown = candidates.slice(0, 3);
  return (
    <section className="border-b border-[#DEDEDE] bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-8 md:px-12">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#626262] uppercase">Portfolio synthesis</p>
          <h2 className="display-title mt-2">A different kind of fit.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/canvas" className="inline-flex min-h-11 items-center border border-[#111111] px-4 text-[11px] font-semibold tracking-[0.12em] uppercase">
            Explore
          </Link>
          <Link href="/graph" className="inline-flex min-h-11 items-center bg-[#111111] px-4 text-[11px] font-semibold tracking-[0.12em] text-white uppercase">
            Cultural graph
          </Link>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-[#DEDEDE] px-5 py-10 text-[16px] text-[#626262] md:px-12">
          Discoveries appear here after a brief. This page does not show sample partners or match scores.
        </p>
      ) : (
        <div className="grid border-t border-[#DEDEDE] md:grid-cols-3 md:divide-x md:divide-[#DEDEDE]">
          {shown.map((candidate) => (
            <article key={candidate.id} className="px-5 py-6 md:px-8">
              <div className="aspect-[16/10] border border-[#DEDEDE]">
                {candidate.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={candidate.imageUrl} alt={candidate.name} className="h-full w-full object-cover" />
                ) : (
                  <CategoryArt type={candidate.entityType} />
                )}
              </div>
              <p className="mt-3 text-[11px] font-semibold tracking-[0.14em] text-[#626262] uppercase">{domainLabel(candidate.entityType)}</p>
              <h3 className="mt-1 text-[20px] font-semibold">{candidate.name}</h3>
              <p className="mt-2 text-[14px] text-[#626262]">Qloo affinity {affinityText(candidate.affinity)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
