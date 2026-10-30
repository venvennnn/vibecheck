"use client";

import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sheet } from "@/components/ui/sheet";
import { FieldLabel, TextArea, TextInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { affinityText, domainLabel, when } from "@/components/vibecheck/format";
import { explainLines } from "@/lib/evidence/explain";
import { confirmedGates } from "@/lib/evidence/commercial";
import { redact } from "@/lib/evidence/redact";
import type { CampaignBrief, Candidate, CommercialEvidence, ResearchLead, SignedEnvelope } from "@/lib/schemas";

export function EvidenceDrawer({
  candidate,
  candidates,
  brief,
  research,
  commercial,
  envelopes,
  onClose,
  onSave,
}: {
  candidate: Candidate | null;
  candidates: Candidate[];
  brief: CampaignBrief | null;
  research: ResearchLead[];
  commercial: CommercialEvidence | null;
  envelopes: SignedEnvelope[];
  onClose: () => void;
  onSave: (evidence: CommercialEvidence) => void;
}) {
  const [tab, setTab] = useState<"signal" | "research" | "commercial" | "developer">("signal");
  const lines = candidate ? explainLines(candidate.explainability) : { available: false, lines: [] };
  const chart = candidates
    .filter((item) => candidate && item.entityType === candidate.entityType && item.affinity != null)
    .slice(0, 8)
    .map((item) => ({ name: item.name, affinity: item.affinity }));
  return (
    <Sheet open={Boolean(candidate)} onOpenChange={(open) => !open && onClose()} title={candidate?.name ?? "Evidence"} wide>
      {candidate && (
        <div>
          <div className="flex gap-4 border-b border-[#DEDEDE]">
            {(
              [
                ["signal", "Qloo cultural signal"],
                ["research", "External research lead"],
                ["commercial", "User-confirmed commercial detail"],
                ["developer", "Developer"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`min-h-11 text-[13px] ${tab === id ? "underline decoration-[#2144ED] decoration-2 underline-offset-8" : "text-[#626262]"}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "signal" && (
            <div className="pt-5 text-[15px]">
              <p className="text-[12px] uppercase tracking-[0.14em] text-[#626262]">Qloo cultural signal</p>
              <p className="mt-3">
                Qloo affinity <span className="font-medium">{affinityText(candidate.affinity)}</span>
              </p>
              <p className="mt-2 text-[#626262]">Retrieved {when(candidate.retrievedAt)}. This is not a match percentage or a predicted return.</p>
              <div className="mt-4">
                {lines.available ? (
                  <ul className="space-y-2">
                    {lines.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Explainability unavailable.</p>
                )}
              </div>
              {candidate.entityType === "urn:entity:place" && (
                <p className="mt-4 text-[14px] text-[#626262]">Locality was requested. A place match does not mean an artist can perform there.</p>
              )}
              {candidate.entityType === "urn:entity:book" && (
                <p className="mt-4 text-[14px] text-[#626262]">A book is an IP or reference opportunity. The rights-holder still needs a check.</p>
              )}
              {chart.length > 0 && (
                <div className="mt-6 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart}>
                      <XAxis dataKey="name" hide />
                      <YAxis width={36} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="affinity" fill="#2144ED" name="Qloo affinity" />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="mt-2 text-[12px] text-[#626262]">Raw Qloo affinity inside {domainLabel(candidate.entityType)}. Not a percentage.</p>
                </div>
              )}
            </div>
          )}
          {tab === "research" && (
            <div className="pt-5">
              <p className="text-[12px] uppercase tracking-[0.14em] text-[#626262]">External research lead · Tavily</p>
              <p className="mt-3 text-[14px] text-[#626262]">Search results never confirm a quote, a right, or availability.</p>
              <ul className="mt-4 space-y-4">
                {research.filter((lead) => lead.candidateId === candidate.id).map((lead) => (
                  <li key={lead.id} className="border-b border-[#DEDEDE] pb-3">
                    <a className="underline" href={lead.url} target="_blank" rel="noreferrer">
                      {lead.title}
                    </a>
                    <p className="mt-1 text-[14px]">{lead.snippet}</p>
                    <p className="mt-1 text-[12px] text-[#626262]">Retrieved {when(lead.retrievedAt)}</p>
                  </li>
                ))}
                {research.filter((lead) => lead.candidateId === candidate.id).length === 0 && <li>No external leads for this candidate.</li>}
              </ul>
            </div>
          )}
          {tab === "commercial" && brief && (
            <CommercialForm
              candidateId={candidate.id}
              brief={brief}
              initial={commercial}
              onSave={onSave}
            />
          )}
          {tab === "developer" && (
            <pre className="mt-5 max-h-[480px] overflow-auto text-[12px] leading-relaxed">
              {JSON.stringify(
                redact({
                  candidate,
                  envelopes: envelopes.filter((envelope) => envelope.payload.candidates.some((item) => item.id === candidate.id)),
                }),
                null,
                2,
              )}
            </pre>
          )}
        </div>
      )}
    </Sheet>
  );
}

function CommercialForm({
  candidateId,
  brief,
  initial,
  onSave,
}: {
  candidateId: string;
  brief: Pick<CampaignBrief, "currency" | "startDate" | "endDate">;
  initial: CommercialEvidence | null;
  onSave: (evidence: CommercialEvidence) => void;
}) {
  const [deliverableScope, setDeliverable] = useState(initial?.deliverableScope ?? "");
  const [priceLow, setLow] = useState(initial?.priceLow?.toString() ?? "");
  const [priceHigh, setHigh] = useState(initial?.priceHigh?.toString() ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? brief.currency);
  const [sourceUrl, setSource] = useState(initial?.sourceUrls[0] ?? "");
  const [availabilityStart, setStart] = useState(initial?.availabilityStart ?? brief.startDate ?? "");
  const [availabilityEnd, setEnd] = useState(initial?.availabilityEnd ?? brief.endDate ?? "");
  const [rightsStatus, setRights] = useState(initial?.rightsStatus ?? "unknown");
  const [geographyStatus, setGeo] = useState(initial?.geographyStatus ?? "unknown");
  const [availabilityStatus, setAvailability] = useState(initial?.availabilityStatus ?? "unknown");
  const [allocation, setAllocation] = useState(initial?.allocation?.toString() ?? "");
  const [note, setNote] = useState<string | null>(null);

  function save() {
    const evidence: CommercialEvidence = {
      candidateId,
      deliverableScope: deliverableScope || null,
      priceLow: priceLow === "" ? null : Number(priceLow),
      priceHigh: priceHigh === "" ? null : Number(priceHigh),
      currency: currency ? currency.toUpperCase() : null,
      sourceUrls: sourceUrl ? [sourceUrl] : [],
      availabilityStart: availabilityStart || null,
      availabilityEnd: availabilityEnd || null,
      rightsStatus,
      geographyStatus,
      availabilityStatus,
      allocation: allocation === "" ? null : Number(allocation),
      checkedAt: new Date().toISOString(),
      attested: true,
    };
    const gates = confirmedGates(evidence, brief);
    setNote(gates.ok ? "Confirmed quote. Still user-attested." : `Saved as an allocation or open check. ${gates.reasons[0] ?? ""}`);
    onSave(evidence);
  }

  return (
    <div className="pt-5">
      <p className="text-[12px] uppercase tracking-[0.14em] text-[#626262]">User-confirmed commercial detail</p>
      <p className="mt-2 text-[14px] text-[#626262]">Checked {initial?.checkedAt ? when(initial.checkedAt) : "not yet"}. Currency is not converted.</p>
      <div className="mt-4 grid gap-3">
        <div>
          <FieldLabel>Deliverable</FieldLabel>
          <TextArea value={deliverableScope} onChange={(event) => setDeliverable(event.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <TextInput aria-label="Price low" placeholder="Low" value={priceLow} onChange={(event) => setLow(event.target.value)} />
          <TextInput aria-label="Price high" placeholder="High" value={priceHigh} onChange={(event) => setHigh(event.target.value)} />
          <TextInput aria-label="Currency" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value)} />
        </div>
        <TextInput aria-label="Source URL" placeholder="https:// source" value={sourceUrl} onChange={(event) => setSource(event.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <TextInput aria-label="Available from" type="date" value={availabilityStart ?? ""} onChange={(event) => setStart(event.target.value)} />
          <TextInput aria-label="Available until" type="date" value={availabilityEnd ?? ""} onChange={(event) => setEnd(event.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select label="Rights" value={rightsStatus} options={["unknown", "cleared", "blocked", "investigating"]} onChange={(value) => setRights(value as CommercialEvidence["rightsStatus"])} />
          <Select label="Geography" value={geographyStatus} options={["unknown", "applicable", "unsuitable"]} onChange={(value) => setGeo(value as CommercialEvidence["geographyStatus"])} />
          <Select label="Availability" value={availabilityStatus} options={["unknown", "available", "unavailable"]} onChange={(value) => setAvailability(value as CommercialEvidence["availabilityStatus"])} />
        </div>
        <div>
          <FieldLabel>Allocation, not quote</FieldLabel>
          <TextInput aria-label="Allocation" value={allocation} onChange={(event) => setAllocation(event.target.value)} />
        </div>
        <Button type="button" onClick={save}>Save commercial check</Button>
        {note && <p className="text-[14px]">{note}</p>}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[12px] uppercase tracking-[0.12em] text-[#626262]">
      {label}
      <select className="mt-2 min-h-12 w-full rounded-[4px] border border-[#DEDEDE] bg-white px-2 text-[14px] text-[#111111] normal-case" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
