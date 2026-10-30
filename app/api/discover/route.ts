import { runDiscovery, verifiedCandidates } from "@/lib/agent/controller";
import { allow, clientKey, jsonError, readJson, validationError } from "@/lib/api/guard";
import { qlooScorePool, ProviderError } from "@/lib/providers/qloo";
import { CampaignBriefSchema, SignedEnvelopeSchema, WeightsSchema, DEFAULT_WEIGHTS } from "@/lib/schemas";
import { z } from "zod";

export const maxDuration = 120;

const BodySchema = z.object({
  revision: z.number().int().nonnegative(),
  brief: CampaignBriefSchema,
  mode: z.enum(["discover", "replace", "score"]).default("discover"),
  excludeIds: z.array(z.string().max(200)).max(80).default([]),
  research: z.boolean().default(true),
  weights: WeightsSchema.optional(),
  envelopes: z.array(SignedEnvelopeSchema).max(20).optional(),
});

export async function POST(request: Request) {
  if (!allow(`discover:${clientKey(request)}`, 8, 10 * 60 * 1000)) {
    return jsonError(429, "Too many discovery runs. Wait a few minutes and try again.", 0);
  }
  const body = await readJson(request, 400_000);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error, 0);
  if (parsed.data.brief.revision !== parsed.data.revision) {
    return jsonError(409, "The brief revision does not match the request.", parsed.data.revision);
  }

  if (parsed.data.mode === "score") {
    const startedAt = new Date().toISOString();
    const secret = process.env.EVIDENCE_SIGNING_SECRET ?? "";
    const verified = verifiedCandidates(parsed.data.envelopes ?? [], secret);
    if (!verified.candidates.length) {
      return jsonError(400, "Score a pool only from signed Qloo evidence.", parsed.data.revision, {
        warnings: verified.warnings,
      });
    }
    const groups = new Map<string, string[]>();
    for (const candidate of verified.candidates) {
      const list = groups.get(candidate.entityType) ?? [];
      list.push(candidate.id);
      groups.set(candidate.entityType, list);
    }
    try {
      const outcomes = await qlooScorePool(
        [...groups.entries()].map(([domain, ids]) => ({
          domain: domain as typeof verified.candidates[number]["entityType"],
          signalIds: parsed.data.brief.references.flatMap((reference) => (reference.qlooId ? [reference.qlooId] : [])),
          excludeIds: [],
          take: ids.length,
          city: parsed.data.brief.city,
          country: parsed.data.brief.country,
          fixedIds: ids,
          revision: parsed.data.revision,
        })),
        {},
        request.signal,
      );
      return Response.json({
        revision: parsed.data.revision,
        requestId: crypto.randomUUID(),
        timestamps: { startedAt, finishedAt: new Date().toISOString() },
        warnings: outcomes.flatMap((outcome) => outcome.warnings),
        status: "ok",
        results: outcomes.map((outcome) => ({
          candidates: outcome.candidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            affinity: candidate.affinity,
            entityType: candidate.entityType,
          })),
        })),
      });
    } catch (error) {
      const message = error instanceof ProviderError ? error.message : "Scoring failed.";
      return jsonError(502, message, parsed.data.revision);
    }
  }

  const requestId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const deadline = AbortSignal.timeout(120_000);
      const signal = AbortSignal.any([request.signal, deadline]);
      try {
        await runDiscovery(
          {
            brief: parsed.data.brief,
            mode: parsed.data.mode === "replace" ? "replace" : "discover",
            excludeIds: parsed.data.excludeIds,
            research: parsed.data.research,
            weights: parsed.data.weights ?? DEFAULT_WEIGHTS,
            requestId,
            runId,
          },
          (event) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          },
          { signal },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Discovery failed.";
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              runId,
              stageId: "run",
              type: "error",
              action: "Discovery stopped",
              toolSummary: null,
              timestamp: new Date().toISOString(),
              error: message,
              status: "error",
              revision: parsed.data.revision,
              requestId,
            })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
