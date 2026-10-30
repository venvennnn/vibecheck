"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextArea, TextInput } from "@/components/ui/field";
import { domainLabel } from "@/components/vibecheck/format";
import { postJson } from "@/lib/client/stream";
import { ENTITY_TYPES, type EntityType } from "@/lib/domains";
import { BriefDraftSchema, CampaignBriefSchema, type BriefDraft, type Reference } from "@/lib/schemas";
import { useCampaign } from "@/lib/store/campaign-store";

type SearchOption = {
  qlooId: string;
  name: string;
  entityType: EntityType | null;
  metadata: string | null;
};

type ResolveResponse = {
  options: SearchOption[];
  ambiguous: boolean;
  notInQloo: boolean;
  error?: string;
};

export function BriefForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const brief = useCampaign((state) => state.brief);
  const hydrated = useCampaign((state) => state.hydrated);
  const loadDemo = useCampaign((state) => state.loadDemo);
  const replaceBrief = useCampaign((state) => state.replaceBrief);
  const confirmReference = useCampaign((state) => state.confirmReference);
  const patchReference = useCampaign((state) => state.patchReference);
  const removeReference = useCampaign((state) => state.removeReference);
  const addPartnerId = useCampaign((state) => state.addPartnerId);
  const removePartnerId = useCampaign((state) => state.removePartnerId);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<EntityType>("urn:entity:artist");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [notInQloo, setNotInQloo] = useState(false);
  const [ambiguous, setAmbiguous] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const booted = useRef(false);
  const idSeq = useRef(0);

  const form = useForm<BriefDraft>({
    resolver: zodResolver(BriefDraftSchema),
    defaultValues: brief,
  });

  async function resolveDemo() {
    loadDemo();
    const seeds = useCampaign.getState().brief.references;
    for (const seed of seeds) {
      try {
        const result = await postJson<ResolveResponse>("/api/resolve", {
          revision: useCampaign.getState().revision,
          query: seed.label,
          types: seed.entityType,
        });
        if (result.notInQloo) {
          patchReference(seed.id, { resolutionStatus: "not_in_qloo", qlooId: null, metadata: "No Qloo id was found." });
        } else if (!result.ambiguous && result.options[0]?.qlooId) {
          const option = result.options[0];
          confirmReference(seed.id, {
            qlooId: option.qlooId,
            entityType: option.entityType ?? seed.entityType,
            label: option.name,
            metadata: option.metadata,
          });
        } else {
          patchReference(seed.id, { resolutionStatus: "ambiguous", qlooId: null });
        }
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : "Search failed.");
      }
    }
    form.reset(useCampaign.getState().brief);
    const ready = CampaignBriefSchema.safeParse(useCampaign.getState().brief);
    if (ready.success) router.push("/canvas?run=1");
  }

  useEffect(() => {
    if (!hydrated || booted.current) return;
    if (!form.formState.isDirty) form.reset(useCampaign.getState().brief);
    if (params.get("demo") !== "1" || compact) booted.current = true;
    document.documentElement.dataset.session = "ready";
  }, [compact, form, hydrated, params]);

  useEffect(() => {
    if (!hydrated || params.get("demo") !== "1" || booted.current || compact) return;
    booted.current = true;
    void resolveDemo();
    // resolveDemo closes over the latest store actions for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, hydrated, params]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const result = await postJson<ResolveResponse>(
          "/api/resolve",
          { revision: useCampaign.getState().revision, query: trimmed, types: type },
          controller.signal,
        );
        setOptions(result.options);
        setAmbiguous(result.ambiguous);
        setNotInQloo(result.notInQloo);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchError(error instanceof Error ? error.message : "Search failed.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, type]);

  function choose(option: SearchOption) {
    if (!option.qlooId) return;
    const next = {
      qlooId: option.qlooId,
      entityType: option.entityType ?? type,
      label: option.name,
      metadata: option.metadata,
    };
    if (activeId) {
      confirmReference(activeId, next);
    } else {
      idSeq.current += 1;
      const id = `ref-${option.qlooId.slice(-8)}-${idSeq.current}`;
      const reference: Reference = { id, resolutionStatus: "confirmed", ...next };
      replaceBrief({ ...useCampaign.getState().brief, references: [...useCampaign.getState().brief.references, reference] });
    }
    setQuery("");
    setOptions([]);
    setActiveId(null);
  }

  function addPartner(field: "existingPartnerIds" | "excludedPartnerIds", option: SearchOption) {
    addPartnerId(field, option.qlooId);
  }

  const onSubmit = form.handleSubmit((values) => {
    const merged: BriefDraft = {
      ...values,
      currency: values.currency.toUpperCase(),
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      references: useCampaign.getState().brief.references,
      existingPartnerIds: useCampaign.getState().brief.existingPartnerIds,
      excludedPartnerIds: useCampaign.getState().brief.excludedPartnerIds,
      revision: useCampaign.getState().revision,
      schemaVersion: 1,
    };
    replaceBrief(merged);
    const ready = CampaignBriefSchema.safeParse(useCampaign.getState().brief);
    if (!ready.success) {
      setFormError(ready.error.issues[0]?.message ?? "The brief is not ready.");
      return;
    }
    setFormError(null);
    if (!compact) router.push("/canvas?run=1");
  });

  const references = brief.references;
  const confirmed = references.filter((reference) => reference.resolutionStatus === "confirmed" && reference.qlooId).length;

  return (
    <form onSubmit={onSubmit} className="max-w-[640px]">
      {!compact && (
        <>
          <p className="text-[12px] tracking-[0.16em] text-[#626262]">01 / YOUR BRIEF</p>
          <h1 className="display-title mt-4">
            Start with your brand.
            <br />
            Follow your <span className="underline decoration-[#F05A36] decoration-[3px] underline-offset-[8px]">curiosity.</span>
          </h1>
          <p className="mt-5 max-w-[460px] text-[18px]">A few references can open up a whole new world of partnerships.</p>
        </>
      )}

      <section className={compact ? "" : "mt-10"}>
        <p className="text-[12px] tracking-[0.16em]">01 THE BRAND</p>
        <div className="mt-4">
          <FieldLabel htmlFor="brandName">Brand name</FieldLabel>
          <TextInput id="brandName" placeholder="Running brand" {...form.register("brandName")} />
        </div>
        <div className="mt-4">
          <FieldLabel htmlFor="identity">What do you stand for?</FieldLabel>
          <TextArea id="identity" placeholder="Movement. Curiosity. Community." {...form.register("identity")} />
        </div>
        <div className="mt-4">
          <FieldLabel htmlFor="audience">Who is it for?</FieldLabel>
          <TextArea id="audience" {...form.register("audience")} />
        </div>
      </section>

      <section className="mt-10">
        <p className="text-[12px] tracking-[0.16em]">02 THE CAMPAIGN</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="objective">Objective</FieldLabel>
            <TextInput id="objective" {...form.register("objective")} />
          </div>
          <div>
            <FieldLabel htmlFor="city">Location</FieldLabel>
            <TextInput id="city" placeholder="New York" {...form.register("city")} />
          </div>
          <div>
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <TextInput id="country" placeholder="United States" {...form.register("country")} />
          </div>
          <div>
            <FieldLabel htmlFor="currency">Currency</FieldLabel>
            <TextInput id="currency" maxLength={3} {...form.register("currency")} />
          </div>
          <div>
            <FieldLabel htmlFor="budget">Planning budget</FieldLabel>
            <TextInput id="budget" type="number" min={0} step="1" data-testid="budget-input" {...form.register("budget", { valueAsNumber: true })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="startDate">Starts</FieldLabel>
              <TextInput id="startDate" type="date" {...form.register("startDate")} />
            </div>
            <div>
              <FieldLabel htmlFor="endDate">Ends</FieldLabel>
              <TextInput id="endDate" type="date" {...form.register("endDate")} />
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="partnerCount">Partners</FieldLabel>
            <TextInput id="partnerCount" type="number" min={1} max={4} {...form.register("constraints.partnerCount", { valueAsNumber: true })} />
          </div>
          <div>
            <FieldLabel htmlFor="minCategories">Minimum categories</FieldLabel>
            <TextInput id="minCategories" type="number" min={1} max={5} {...form.register("constraints.minCategories", { valueAsNumber: true })} />
          </div>
          <div>
            <FieldLabel htmlFor="maxPerCategory">Maximum per category</FieldLabel>
            <TextInput id="maxPerCategory" type="number" min={1} max={4} {...form.register("constraints.maxPerCategory", { valueAsNumber: true })} />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <p className="text-[12px] tracking-[0.16em]">03 YOUR CULTURAL REFERENCES</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {references.map((reference) => (
            <button
              key={reference.id}
              type="button"
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[14px] ${
                reference.resolutionStatus === "confirmed" ? "border-[#111111]" : "border-[#DEDEDE] text-[#626262]"
              }`}
              onClick={() => {
                setActiveId(reference.id);
                setQuery(reference.label);
                if (reference.entityType) setType(reference.entityType);
              }}
            >
              {reference.label}
              <span className="text-[12px] uppercase tracking-[0.08em]">
                {reference.resolutionStatus === "confirmed" ? domainLabel(reference.entityType) : reference.resolutionStatus.replaceAll("_", " ")}
              </span>
              <span
                role="button"
                aria-label={`Remove ${reference.label}`}
                className="inline-flex size-6 items-center justify-center"
                onClick={(event) => {
                  event.stopPropagation();
                  removeReference(reference.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px]">
          <TextInput
            aria-label="Search cultural references"
            placeholder="Search cultural references…"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setActiveId(null);
              setQuery(value);
              if (value.trim().length < 2) {
                setOptions([]);
                setNotInQloo(false);
                setAmbiguous(false);
              }
            }}
          />
          <select
            aria-label="Reference type"
            className="min-h-12 rounded-[4px] border border-[#DEDEDE] bg-white px-3"
            value={type}
            onChange={(event) => setType(event.target.value as EntityType)}
          >
            {ENTITY_TYPES.map((item) => (
              <option key={item} value={item}>
                {domainLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[13px] text-[#626262]">
          {searching ? "Searching Qloo…" : "Confirm exact references before discovery."} {confirmed} confirmed.
        </p>
        {ambiguous && options.length > 1 && (
          <p className="mt-2 text-[14px]">More than one match. Confirm the exact reference. VibeCheck will not guess an id.</p>
        )}
        {notInQloo && (
          <p className="mt-2 text-[14px]">Nothing in Qloo under that name. The brand can still continue with other confirmed references. No id was invented.</p>
        )}
        {searchError && <p className="mt-2 text-[14px] text-[#F05A36]">{searchError}</p>}
        {options.length > 0 && (
          <ul className="mt-3 border border-[#DEDEDE]">
            {options.map((option) => (
              <li key={option.qlooId} className="border-b border-[#DEDEDE] last:border-b-0">
                <button type="button" className="flex min-h-11 w-full items-start justify-between gap-3 px-3 py-2 text-left" onClick={() => choose(option)}>
                  <span>
                    <span className="block text-[15px]">{option.name}</span>
                    <span className="block text-[13px] text-[#626262]">
                      {domainLabel(option.entityType)}
                      {option.metadata ? ` · ${option.metadata}` : ""}
                    </span>
                  </span>
                  <span className="text-[13px]">Confirm</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <PartnerSearch label="Existing partners" onPick={(option) => addPartner("existingPartnerIds", option)} />
        <div className="mt-2 flex flex-wrap gap-2">
          {brief.existingPartnerIds.map((id) => (
            <button key={id} type="button" className="min-h-11 rounded-full border border-[#DEDEDE] px-3 text-[13px]" onClick={() => removePartnerId("existingPartnerIds", id)}>
              Existing {id.slice(0, 8)} ×
            </button>
          ))}
        </div>
        <PartnerSearch label="Partners to avoid" onPick={(option) => addPartner("excludedPartnerIds", option)} />
        <div className="mt-2 flex flex-wrap gap-2">
          {brief.excludedPartnerIds.map((id) => (
            <button key={id} type="button" className="min-h-11 rounded-full border border-[#DEDEDE] px-3 text-[13px]" onClick={() => removePartnerId("excludedPartnerIds", id)}>
              Excluded {id.slice(0, 8)} ×
            </button>
          ))}
        </div>
      </section>

      {formError && <p className="mt-4 text-[14px] text-[#F05A36]">{formError}</p>}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button type="submit" data-testid="find-connections">
          Find my connections
        </Button>
        {!compact && <p className="text-[14px] text-[#626262]">No signup. Just a good brief.</p>}
      </div>
    </form>
  );
}

function PartnerSearch({ label, onPick }: { label: string; onPick: (option: SearchOption) => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await postJson<ResolveResponse>(
          "/api/resolve",
          { revision: useCampaign.getState().revision, query, types: null },
          controller.signal,
        );
        setOptions(result.options);
      } catch {
        if (!controller.signal.aborted) setOptions([]);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return (
    <div className="mt-4">
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={query}
        placeholder={`Search to add ${label.toLowerCase()}`}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim().length < 2) setOptions([]);
        }}
      />
      {options.length > 0 && (
        <ul className="mt-2 border border-[#DEDEDE]">
          {options.map((option) => (
            <li key={option.qlooId}>
              <button
                type="button"
                className="min-h-11 w-full px-3 text-left text-[14px]"
                onClick={() => {
                  onPick(option);
                  setQuery("");
                  setOptions([]);
                }}
              >
                {option.name} · {domainLabel(option.entityType)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
