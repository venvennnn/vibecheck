import { issueList } from "@/lib/schemas";
import { ZodError } from "zod";

const buckets = new Map<string, { reset: number; count: number }>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "local").slice(0, 80);
}

/** Opportunistic per-instance limit. This is not a substitute for the Vercel firewall. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    buckets.set(key, { reset: now + windowMs, count: 1 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetLimits() {
  buckets.clear();
}

export async function readJson(request: Request, max = 280_000): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > max) return { ok: false, response: jsonError(413, "Request body is too large.", 0) };
  const text = await request.text();
  if (text.length > max) return { ok: false, response: jsonError(413, "Request body is too large.", 0) };
  try {
    return { ok: true, data: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, response: jsonError(400, "Request body was not JSON.", 0) };
  }
}

export function jsonError(status: number, error: string, revision: number, extra?: Record<string, unknown>) {
  const now = new Date().toISOString();
  return Response.json(
    {
      revision,
      requestId: crypto.randomUUID(),
      timestamps: { startedAt: now, finishedAt: now },
      warnings: [],
      status: "error",
      error,
      ...extra,
    },
    { status },
  );
}

export function validationError(error: ZodError, revision = 0) {
  return jsonError(400, "The request failed validation.", revision, { issues: issueList(error) });
}

export function meta(revision: number, requestId: string, startedAt: string, warnings: string[] = [], status: "ok" | "partial" | "error" = "ok") {
  return {
    revision,
    requestId,
    timestamps: { startedAt, finishedAt: new Date().toISOString() },
    warnings,
    status,
  };
}
