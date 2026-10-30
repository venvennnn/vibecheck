"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client/stream";
import { CampaignBriefSchema, type CampaignProposal } from "@/lib/schemas";
import { useCampaign } from "@/lib/store/campaign-store";

type Arm = { id: "A" | "B"; proposal: CampaignProposal };

export function CompareScreen() {
  const state = useCampaign();
  const ready = CampaignBriefSchema.safeParse(state.brief);
  const [arms, setArms] = useState<Arm[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!ready.success || !state.portfolio) return;
    setBusy(true);
    setError(null);
    setRevealed(null);
    try {
      const response = await postJson<{ arms: Arm[]; revealToken: string }>("/api/compare", {
        mode: "generate",
        revision: ready.data.revision,
        brief: ready.data,
        portfolio: state.portfolio,
        envelopes: state.envelopes,
        commercial: state.commercial,
        research: state.research,
        original: state.prose,
      });
      setArms(response.arms);
      setToken(response.revealToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!token) return;
    const response = await postJson<{ order: string[] }>("/api/compare", {
      mode: "reveal",
      revision: state.revision,
      revealToken: token,
    });
    setRevealed(response.order);
  }

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-12 md:px-12">
      <p className="text-[12px] tracking-[0.16em] text-[#626262]">OPTIONAL COMPARISON</p>
      <h1 className="display-title mt-4">Two readings. One difference.</h1>
      <p className="mt-4 max-w-[640px] text-[18px]">
        Both arms see the same brief, partners, and commercial evidence. One also receives the Qloo signal. Rate them before the labels are revealed. This is not proof that the work got better.
      </p>
      <Button className="mt-6" onClick={() => void run()} disabled={busy || !ready.success || !state.portfolio}>
        {busy ? "Running both arms…" : "Run blinded comparison"}
      </Button>
      {error && <p className="mt-3 text-[#F05A36]">{error}</p>}
      {arms && (
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {arms.map((arm) => (
            <article key={arm.id} className="border border-[#DEDEDE] p-5">
              <p className="text-[12px] tracking-[0.16em]">ARM {arm.id}</p>
              <h2 className="mt-3 font-tight text-[26px] font-bold">{arm.proposal.concepts[0]?.title ?? "Proposal"}</h2>
              <p className="mt-3 whitespace-pre-wrap text-[15px]">{arm.proposal.prose}</p>
              <label className="mt-4 block text-[14px]">
                Your rating, 1–5
                <input
                  className="mt-2 block min-h-12 w-24 border border-[#DEDEDE] px-3"
                  type="number"
                  min={1}
                  max={5}
                  value={ratings[arm.id] ?? ""}
                  onChange={(event) => setRatings({ ...ratings, [arm.id]: Number(event.target.value) })}
                />
              </label>
            </article>
          ))}
        </div>
      )}
      {arms && !revealed && (
        <Button className="mt-6" variant="outline" onClick={() => void reveal()} disabled={Object.keys(ratings).length < 2}>
          Reveal which arm had Qloo evidence
        </Button>
      )}
      {revealed && (
        <p className="mt-6 text-[16px]">
          Arm A was {revealed[0] === "with_qloo" ? "given Qloo evidence" : "the control"}. Arm B was {revealed[1] === "with_qloo" ? "given Qloo evidence" : "the control"}. Keep the ratings. Do not treat affinity alignment as a win.
        </p>
      )}
    </main>
  );
}
