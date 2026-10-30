import { verifiedCandidates } from "@/lib/agent/controller";
import { allow, clientKey, jsonError, meta, readJson, validationError } from "@/lib/api/guard";
import { qlooEntities, ProviderError } from "@/lib/providers/qloo";
import { SignedEnvelopeSchema } from "@/lib/schemas";
import { z } from "zod";

export const maxDuration = 60;

const BodySchema = z.object({
  revision: z.number().int().nonnegative(),
  ids: z.array(z.string().min(1).max(200)).min(1).max(12),
  envelopes: z.array(SignedEnvelopeSchema).max(20),
});

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  if (!allow(`enrich:${clientKey(request)}`, 20, 10 * 60 * 1000)) {
    return jsonError(429, "Too many enrichment requests.", 0);
  }
  const body = await readJson(request, 400_000);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const verified = verifiedCandidates(parsed.data.envelopes, process.env.EVIDENCE_SIGNING_SECRET ?? "");
  const allowed = new Set(verified.candidates.map((candidate) => candidate.id));
  if (parsed.data.ids.some((id) => !allowed.has(id))) {
    return jsonError(400, "Enrichment only accepts ids from signed Qloo evidence.", parsed.data.revision, {
      warnings: verified.warnings,
    });
  }
  try {
    const outcome = await qlooEntities(parsed.data.ids, {}, request.signal);
    return Response.json({
      ...meta(parsed.data.revision, crypto.randomUUID(), startedAt, [...verified.warnings, ...outcome.warnings], outcome.empty ? "partial" : "ok"),
      candidates: outcome.candidates,
    });
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : "Enrichment failed.";
    return jsonError(502, message, parsed.data.revision, { warnings: verified.warnings });
  }
}
