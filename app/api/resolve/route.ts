import { allow, clientKey, jsonError, meta, readJson, validationError } from "@/lib/api/guard";
import { qlooSearch, ProviderError } from "@/lib/providers/qloo";
import { EntityTypeSchema } from "@/lib/schemas";
import { z } from "zod";

export const maxDuration = 60;

const BodySchema = z.object({
  revision: z.number().int().nonnegative().default(0),
  query: z.string().min(1).max(160),
  types: EntityTypeSchema.nullable().default(null),
});

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  if (!allow(`resolve:${clientKey(request)}`, 40, 10 * 60 * 1000)) {
    return jsonError(429, "Too many searches. Wait a few minutes and try again.", 0);
  }
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await qlooSearch(parsed.data.query, parsed.data.types, {}, request.signal);
    return Response.json({
      ...meta(parsed.data.revision, crypto.randomUUID(), startedAt, result.warnings),
      options: result.options,
      ambiguous: result.ambiguous,
      notInQloo: result.notInQloo,
      requiresConfirmation: true,
    });
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : "Search failed.";
    const status = error instanceof ProviderError && error.kind === "auth" ? 401 : 502;
    return jsonError(status, message, parsed.data.revision);
  }
}
