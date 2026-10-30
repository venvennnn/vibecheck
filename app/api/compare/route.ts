import { createHmac, timingSafeEqual } from "node:crypto";
import { verifiedCandidates } from "@/lib/agent/controller";
import { allow, clientKey, jsonError, meta, readJson, validationError } from "@/lib/api/guard";
import { generateProposal, proposalContext } from "@/lib/providers/gemini";
import { ProviderError } from "@/lib/providers/qloo";
import {
  CampaignBriefSchema,
  CampaignProposalSchema,
  CommercialEvidenceSchema,
  PortfolioSchema,
  ResearchLeadSchema,
  SignedEnvelopeSchema,
} from "@/lib/schemas";
import { z } from "zod";

export const maxDuration = 90;

const BodySchema = z.object({
  mode: z.enum(["generate", "reveal"]).default("generate"),
  revision: z.number().int().nonnegative().default(0),
  brief: CampaignBriefSchema.optional(),
  portfolio: PortfolioSchema.optional(),
  envelopes: z.array(SignedEnvelopeSchema).max(20).optional(),
  commercial: z.array(CommercialEvidenceSchema).max(40).default([]),
  research: z.array(ResearchLeadSchema).max(24).default([]),
  original: CampaignProposalSchema.nullable().optional(),
  revealToken: z.string().max(4000).optional(),
});

function signToken(order: ["with_qloo" | "control", "with_qloo" | "control"], secret: string) {
  const payload = { order, exp: Date.now() + 2 * 60 * 60 * 1000 };
  const body = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return Buffer.from(JSON.stringify({ body, sig })).toString("base64url");
}

function readToken(token: string, secret: string): { order: ["with_qloo" | "control", "with_qloo" | "control"] } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString()) as { body: string; sig: string };
    const expected = createHmac("sha256", secret).update(decoded.body).digest("hex");
    const left = Buffer.from(expected);
    const right = Buffer.from(decoded.sig);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    const payload = JSON.parse(decoded.body) as { order: ["with_qloo" | "control", "with_qloo" | "control"]; exp: number };
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  if (!allow(`compare:${clientKey(request)}`, 6, 10 * 60 * 1000)) {
    return jsonError(429, "Too many comparison requests.", 0);
  }
  const body = await readJson(request, 500_000);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const secret = process.env.EVIDENCE_SIGNING_SECRET ?? "";
  if (!secret) return jsonError(503, "EVIDENCE_SIGNING_SECRET is required to blind a comparison.", parsed.data.revision);

  if (parsed.data.mode === "reveal") {
    if (!parsed.data.revealToken) return jsonError(400, "Missing reveal token.", parsed.data.revision);
    const token = readToken(parsed.data.revealToken, secret);
    if (!token) return jsonError(400, "Reveal token is invalid or expired.", parsed.data.revision);
    return Response.json({
      ...meta(parsed.data.revision, crypto.randomUUID(), startedAt, [
        "Qloo alignment alone is not proof that the proposal improved.",
      ]),
      order: token.order,
    });
  }

  if (!parsed.data.brief || !parsed.data.portfolio || !parsed.data.envelopes) {
    return jsonError(400, "Comparison needs a brief, portfolio, and signed evidence.", parsed.data.revision);
  }
  const verified = verifiedCandidates(parsed.data.envelopes, secret);
  const byId = new Map(verified.candidates.map((candidate) => [candidate.id, candidate]));
  const ids = parsed.data.portfolio.selectedIds;
  if (!ids.length || ids.some((id) => !byId.has(id))) {
    return jsonError(400, "Comparison partners must come from signed Qloo evidence.", parsed.data.revision);
  }
  const selected = ids.map((id) => byId.get(id)!);
  const shared = {
    brief: parsed.data.brief,
    candidates: selected,
    commercial: parsed.data.commercial.filter((item) => ids.includes(item.candidateId)),
    research: parsed.data.research.filter((lead) => ids.includes(lead.candidateId)),
  };
  const qlooFirst = Math.random() < 0.5;
  const order = (qlooFirst ? ["with_qloo", "control"] : ["control", "with_qloo"]) as [
    "with_qloo" | "control",
    "with_qloo" | "control",
  ];
  try {
    const arms = [];
    for (const arm of order) {
      arms.push(
        await generateProposal(
          proposalContext({ ...shared, includeQloo: arm === "with_qloo" }),
          { temperature: 0.4 },
        ),
      );
    }
    return Response.json({
      ...meta(parsed.data.revision, crypto.randomUUID(), startedAt, [
        "Both arms use the same model settings. Only one receives Qloo evidence.",
        "Do not treat this as proof of improvement.",
      ]),
      arms: [
        { id: "A", proposal: arms[0] },
        { id: "B", proposal: arms[1] },
      ],
      revealToken: signToken(order, secret),
    });
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : "Comparison failed.";
    return jsonError(error instanceof ProviderError && error.kind === "config" ? 503 : 502, message, parsed.data.revision);
  }
}
