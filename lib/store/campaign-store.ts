"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { demoDraft } from "@/lib/demo";
import {
  AgentEventSchema,
  BriefDraftSchema,
  DEFAULT_WEIGHTS,
  emptyDraft,
  type AgentEvent,
  type BriefDraft,
  type CampaignProposal,
  type Candidate,
  type CommercialEvidence,
  type Portfolio,
  type Reference,
  type ResearchLead,
  type SignedEnvelope,
  type Weights,
} from "@/lib/schemas";

export type RunStatus = "idle" | "running" | "incomplete" | "complete" | "error" | "empty";

type CampaignState = {
  hydrated: boolean;
  revision: number;
  brief: BriefDraft;
  candidates: Candidate[];
  envelopes: SignedEnvelope[];
  research: ResearchLead[];
  commercial: CommercialEvidence[];
  portfolio: Portfolio | null;
  weights: Weights;
  events: AgentEvent[];
  runStatus: RunStatus;
  runAction: string | null;
  runError: string | null;
  warnings: string[];
  prose: CampaignProposal | null;
  proseStale: boolean;
  bookmarks: string[];
  changeNote: string | null;
  reviewed: boolean;
  setHydrated: (value: boolean) => void;
  replaceBrief: (brief: BriefDraft, options?: { invalidate?: boolean }) => void;
  loadDemo: () => void;
  confirmReference: (referenceId: string, next: Pick<Reference, "qlooId" | "entityType" | "label" | "metadata">) => void;
  patchReference: (referenceId: string, next: Partial<Reference>) => void;
  removeReference: (referenceId: string) => void;
  addPartnerId: (field: "existingPartnerIds" | "excludedPartnerIds", id: string) => void;
  removePartnerId: (field: "existingPartnerIds" | "excludedPartnerIds", id: string) => void;
  applyEvent: (event: AgentEvent) => void;
  beginRun: () => void;
  setWeights: (weights: Partial<Weights>) => void;
  setPortfolio: (portfolio: Portfolio | null) => void;
  toggleBookmark: (id: string) => void;
  togglePin: (id: string) => void;
  excludeCandidate: (id: string) => void;
  setCommercial: (evidence: CommercialEvidence) => void;
  mergeCommercial: (rows: CommercialEvidence[]) => void;
  setProse: (prose: CampaignProposal | null) => void;
  setChangeNote: (note: string | null) => void;
  setReviewed: (value: boolean) => void;
  clearSession: () => void;
};

function memoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => {
      mem.set(key, value);
    },
    removeItem: (key) => {
      mem.delete(key);
    },
    clear: () => mem.clear(),
    key: (index) => [...mem.keys()][index] ?? null,
    get length() {
      return mem.size;
    },
  };
}

const storage = () => (typeof sessionStorage === "undefined" ? memoryStorage() : sessionStorage);

function discoveryKey(brief: BriefDraft) {
  return JSON.stringify({
    city: brief.city.trim().toLowerCase(),
    country: brief.country.trim().toLowerCase(),
    references: brief.references.map((reference) => ({
      qlooId: reference.qlooId,
      entityType: reference.entityType,
      resolutionStatus: reference.resolutionStatus,
    })),
    existing: [...brief.existingPartnerIds].sort(),
    excluded: [...brief.excludedPartnerIds].sort(),
  });
}

function invalidate(revision: number) {
  return {
    revision,
    candidates: [] as Candidate[],
    envelopes: [] as SignedEnvelope[],
    research: [] as ResearchLead[],
    commercial: [] as CommercialEvidence[],
    portfolio: null,
    events: [] as AgentEvent[],
    runStatus: "idle" as RunStatus,
    runAction: null,
    runError: null,
    warnings: [] as string[],
    prose: null,
    proseStale: false,
    bookmarks: [] as string[],
    changeNote: null,
    reviewed: false,
  };
}

export const useCampaign = create<CampaignState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      revision: 1,
      brief: emptyDraft(1),
      candidates: [],
      envelopes: [],
      research: [],
      commercial: [],
      portfolio: null,
      weights: DEFAULT_WEIGHTS,
      events: [],
      runStatus: "idle",
      runAction: null,
      runError: null,
      warnings: [],
      prose: null,
      proseStale: false,
      bookmarks: [],
      changeNote: null,
      reviewed: false,
      setHydrated: (hydrated) => set({ hydrated }),
      replaceBrief: (brief, options) => {
        const parsed = BriefDraftSchema.parse({ ...brief, revision: get().revision });
        const previous = get().brief;
        const same = JSON.stringify({ ...previous, revision: 0 }) === JSON.stringify({ ...parsed, revision: 0 });
        if (options?.invalidate === false || same) {
          set({ brief: { ...parsed, revision: get().revision } });
          return;
        }
        const discoveryChanged = options?.invalidate === true || discoveryKey(previous) !== discoveryKey(parsed);
        if (!discoveryChanged) {
          set({
            brief: { ...parsed, revision: get().revision },
            proseStale: Boolean(get().prose),
            reviewed: false,
          });
          return;
        }
        const revision = get().revision + 1;
        set({
          brief: { ...parsed, revision },
          ...invalidate(revision),
        });
      },
      loadDemo: () => {
        const revision = get().revision + 1;
        set({
          brief: demoDraft(revision),
          ...invalidate(revision),
        });
      },
      patchReference: (referenceId, next) => {
        get().replaceBrief({
          ...get().brief,
          references: get().brief.references.map((reference) =>
            reference.id === referenceId ? { ...reference, ...next, id: reference.id } : reference,
          ),
        });
      },
      confirmReference: (referenceId, next) => {
        const brief = {
          ...get().brief,
          references: get().brief.references.map((reference) =>
            reference.id === referenceId
              ? {
                  ...reference,
                  ...next,
                  resolutionStatus: "confirmed" as const,
                }
              : reference,
          ),
        };
        get().replaceBrief(brief);
      },
      removeReference: (referenceId) => {
        get().replaceBrief({
          ...get().brief,
          references: get().brief.references.filter((reference) => reference.id !== referenceId),
        });
      },
      addPartnerId: (field, id) => {
        if (get().brief[field].includes(id)) return;
        get().replaceBrief({ ...get().brief, [field]: [...get().brief[field], id] });
      },
      removePartnerId: (field, id) => {
        get().replaceBrief({ ...get().brief, [field]: get().brief[field].filter((item) => item !== id) });
      },
      beginRun: () => set({ runStatus: "running", runAction: "Starting", runError: null, warnings: [] }),
      applyEvent: (raw) => {
        const event = AgentEventSchema.parse(raw);
        if (event.revision !== get().revision) return;
        const events = [...get().events, event].slice(-80);
        const warnings = [...get().warnings];
        if (event.type === "warning" && event.action) warnings.push(event.action);
        for (const warning of event.warnings ?? []) warnings.push(warning);
        const patch: Partial<CampaignState> = {
          events,
          warnings: [...new Set(warnings)].slice(-20),
          runAction: event.action,
        };
        if (event.candidates?.length) {
          const map = new Map(get().candidates.map((candidate) => [candidate.id, candidate]));
          for (const candidate of event.candidates) if (!map.has(candidate.id)) map.set(candidate.id, candidate);
          patch.candidates = [...map.values()];
        }
        if (event.envelope) patch.envelopes = [...get().envelopes, event.envelope];
        if (event.research?.length) patch.research = [...get().research, ...event.research];
        if (event.portfolio) patch.portfolio = event.portfolio;
        if (event.type === "run_completed") {
          patch.runStatus = event.status === "incomplete" ? "incomplete" : event.status === "empty" ? "empty" : "complete";
        }
        if (event.type === "error") {
          patch.runStatus = get().candidates.length || event.candidates?.length ? "incomplete" : "error";
          patch.runError = event.error;
        }
        if (event.type === "candidates_received" || event.type === "run_completed") {
          patch.proseStale = Boolean(get().prose);
          patch.reviewed = false;
        }
        set(patch);
      },
      setWeights: (weights) => set({ weights: { ...get().weights, ...weights }, proseStale: Boolean(get().prose), reviewed: false }),
      setPortfolio: (portfolio) => set({ portfolio, proseStale: Boolean(get().prose), reviewed: false }),
      toggleBookmark: (id) => {
        const bookmarks = get().bookmarks.includes(id)
          ? get().bookmarks.filter((item) => item !== id)
          : [...get().bookmarks, id];
        set({ bookmarks });
      },
      excludeCandidate: (id) => {
        const brief = get().brief;
        const excludedPartnerIds = brief.excludedPartnerIds.includes(id)
          ? brief.excludedPartnerIds
          : [...brief.excludedPartnerIds, id];
        set({
          brief: {
            ...brief,
            excludedPartnerIds,
            constraints: {
              ...brief.constraints,
              pinnedIds: brief.constraints.pinnedIds.filter((pin) => pin !== id),
            },
          },
          proseStale: Boolean(get().prose),
          reviewed: false,
        });
      },
      togglePin: (id) => {
        const pinned = get().brief.constraints.pinnedIds;
        const next = pinned.includes(id) ? pinned.filter((item) => item !== id) : [...pinned, id].slice(0, 4);
        set({
          brief: { ...get().brief, constraints: { ...get().brief.constraints, pinnedIds: next } },
          proseStale: Boolean(get().prose),
          reviewed: false,
        });
      },
      setCommercial: (evidence) => {
        const commercial = [
          ...get().commercial.filter((item) => item.candidateId !== evidence.candidateId),
          evidence,
        ];
        set({ commercial, proseStale: Boolean(get().prose), reviewed: false });
      },
      mergeCommercial: (rows) => {
        const map = new Map(get().commercial.map((item) => [item.candidateId, item]));
        for (const row of rows) map.set(row.candidateId, row);
        set({ commercial: [...map.values()], proseStale: Boolean(get().prose), reviewed: false });
      },
      setProse: (prose) => set({ prose, proseStale: false, reviewed: false }),
      setChangeNote: (changeNote) => set({ changeNote }),
      setReviewed: (reviewed) => set({ reviewed }),
      clearSession: () => {
        storage().removeItem("vibecheck-session");
        set({
          brief: emptyDraft(1),
          ...invalidate(1),
          weights: DEFAULT_WEIGHTS,
        });
      },
    }),
    {
      name: "vibecheck-session",
      storage: createJSONStorage(storage),
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useCampaign.getState().setHydrated(true);
      },
      partialize: (state) => ({
        revision: state.revision,
        brief: state.brief,
        candidates: state.candidates,
        envelopes: state.envelopes,
        research: state.research,
        commercial: state.commercial,
        portfolio: state.portfolio,
        weights: state.weights,
        runStatus: state.runStatus,
        warnings: state.warnings,
        prose: state.prose,
        proseStale: state.proseStale,
        bookmarks: state.bookmarks,
        changeNote: state.changeNote,
        reviewed: state.reviewed,
      }),
    },
  ),
);

if (typeof window !== "undefined") {
  void useCampaign.persist.rehydrate();
}
