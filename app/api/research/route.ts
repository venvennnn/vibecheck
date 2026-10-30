import { verifiedCandidates } from "@/lib/agent/controller";
import { allow, clientKey, jsonError, meta, readJson, validationError } from "@/lib/api/guard";
import { ProviderError } from "@/lib/providers/qloo";
import { tavilySearch } from "@/lib/providers/tavily";
import { CampaignBriefSchema, SignedEnvelopeSchema } from "@/lib/schemas";
import { z } from "zod";

export const maxDuration = 60;

const BodySchema = z.object({
  revision: z.number().int().nonnegative(),
  brief: CampaignBriefSchema,
  ids: z.array(z.string().min(1).max(200)).min(1).max(6),
  envelopes: z.array(SignedEnvelopeSchema).max(20),
});

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  if (!allow(`research:${clientKey(request)}`, 12, 10 * 60 * 1000)) {
    return jsonError(429, "Too many research requests.", 0);
  }
  const body = await readJson(request, 400_000);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error, 0);
  const verified = verifiedCandidates(parsed.data.envelopes, process.env.EVIDENCE_SIGNING_SECRET ?? "");
  const byId = new Map(verified.candidates.map((candidate) => [candidate.id, candidate]));
  if (parsed.data.ids.some((id) => !byId.has(id))) {
    return jsonError(400, "Research only accepts ids from signed Qloo evidence.", parsed.data.revision, {
      warnings: verified.warnings,
    });
  }
  const leads = [];
  const warnings = [...verified.warnings, "External research uses Tavily. Snippets do not confirm quotes, rights, or availability."];
  for (const id of parsed.data.ids) {
    const candidate = byId.get(id)!;
    try {
      leads.push(
        ...(await tavilySearch({
          candidateId: candidate.id,
          name: candidate.name,
          category: candidate.category,
          city: parsed.data.brief.city,
          country: parsed.data.brief.country,
          signal: request.signal,
        })),
      );
    } catch (error) {
      warnings.push(error instanceof ProviderError ? error.message : `Research failed for ${candidate.name}.`);
    }
  }
  return Response.json({
    ...meta(parsed.data.revision, crypto.randomUUID(), startedAt, warnings, leads.length ? "ok" : "partial"),
    leads,
  });
}
