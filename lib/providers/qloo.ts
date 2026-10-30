import { DOMAIN_LABEL, type EntityType } from "@/lib/domains";
import { SCHEMA_VERSION, type Candidate, type EvidencePayload, type SignedEnvelope } from "@/lib/schemas";
import { signEnvelope } from "@/lib/evidence/sign";
import { uniqueStrings } from "@/lib/text";
import { QlooSchemaError, normaliseInsights, normaliseSearch, type SearchOption } from "@/lib/providers/qloo-normalise";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "unsupported" | "empty" | "schema" | "timeout" | "http" | "config" | "limit",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const ALLOWED_HOSTS = new Set(["hackathon.api.qloo.com", "api.qloo.com"]);

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type QlooEnv = {
  QLOO_API_KEY?: string;
  QLOO_BASE_URL?: string;
  EVIDENCE_SIGNING_SECRET?: string;
  TAVILY_API_KEY?: string;
};

export function providerEnv(override?: QlooEnv): QlooEnv {
  if (override) return override;
  return {
    QLOO_API_KEY: process.env.QLOO_API_KEY,
    QLOO_BASE_URL: process.env.QLOO_BASE_URL,
    EVIDENCE_SIGNING_SECRET: process.env.EVIDENCE_SIGNING_SECRET,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  };
}

export type QlooDeps = {
  fetch?: FetchLike;
  env?: QlooEnv;
  now?: () => Date;
  timeoutMs?: number;
  retries?: number;
  delay?: (ms: number) => Promise<void>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function qlooOrigin(env: QlooEnv = providerEnv()): string {
  const raw = env.QLOO_BASE_URL?.trim() || "https://hackathon.api.qloo.com";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError("QLOO_BASE_URL is not a valid URL.", "config");
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.host)) {
    throw new ProviderError("QLOO_BASE_URL host is not allowlisted.", "config");
  }
  return url.origin;
}

export function buildSearchParams(query: string, types: EntityType | null, take = 6): URLSearchParams {
  const params = new URLSearchParams();
  params.set("query", query.slice(0, 160));
  if (types) params.set("types", types);
  params.set("take", String(Math.min(Math.max(take, 1), 6)));
  return params;
}

export function buildInsightsParams(input: {
  domain: EntityType;
  signalIds: string[];
  excludeIds: string[];
  take: number;
  city?: string;
  country?: string;
  fixedIds?: string[];
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("filter.type", input.domain);
  params.set("signal.interests.entities", uniqueStrings(input.signalIds).join(","));
  const exclude = uniqueStrings(input.excludeIds);
  if (exclude.length) params.set("filter.exclude.entities", exclude.join(","));
  params.set("feature.explainability", "true");
  params.set("take", String(Math.min(Math.max(input.take, 1), 20)));
  if (input.fixedIds?.length) {
    params.set("filter.results.entities", uniqueStrings(input.fixedIds).join(","));
  }
  if (input.domain === "urn:entity:place") {
    const locality = [input.city, input.country].filter(Boolean).join(", ");
    if (locality) params.set("filter.location.query", locality);
    params.set("filter.location.radius", "0");
  }
  return params;
}

export function buildEntityParams(ids: string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const id of uniqueStrings(ids).slice(0, 20)) params.append("entity_ids", id);
  return params;
}

function retryWait(response: Response | null, attempt: number): number {
  const header = response?.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5000);
  return Math.min(400 * 2 ** attempt, 5000);
}

async function qlooFetch(path: string, params: URLSearchParams, deps: QlooDeps, signal?: AbortSignal): Promise<unknown> {
  const env = providerEnv(deps.env);
  const key = env.QLOO_API_KEY;
  if (!key) throw new ProviderError("QLOO_API_KEY is not configured on the server.", "config");
  const origin = qlooOrigin(env);
  const url = `${origin}${path}?${params.toString()}`;
  const fetcher = deps.fetch ?? fetch;
  const retries = deps.retries ?? 2;
  const timeoutMs = deps.timeoutMs ?? 35_000;
  const delay = deps.delay ?? sleep;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new ProviderError("The request was cancelled.", "timeout");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: { "X-Api-Key": key, Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === retries) {
          throw new ProviderError(`Qloo returned ${response.status}.`, "http", response.status);
        }
        await delay(retryWait(response, attempt));
        continue;
      }
      const text = await response.text();
      if (text.length > 1_500_000) {
        throw new ProviderError("Qloo response exceeded the size cap.", "http", response.status);
      }
      if (response.status === 401 || response.status === 403) {
        const unsupported = /permission|not supported|urn:entity/i.test(text);
        throw new ProviderError(
          response.status === 401
            ? "Qloo rejected the API key. Check QLOO_API_KEY and QLOO_BASE_URL."
            : unsupported
              ? "This Qloo account cannot access that entity type."
              : "Qloo refused the request.",
          response.status === 401 ? "auth" : unsupported ? "unsupported" : "auth",
          response.status,
        );
      }
      if (!response.ok) {
        throw new ProviderError(`Qloo returned ${response.status}. The parameters were not retried.`, "http", response.status);
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new ProviderError("Qloo returned invalid JSON.", "schema", response.status);
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      if (signal?.aborted) throw new ProviderError("The request was cancelled.", "timeout");
      if (aborted && attempt === retries) throw new ProviderError("Qloo timed out.", "timeout");
      lastError = error;
      if (attempt === retries) break;
      await delay(retryWait(null, attempt));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new ProviderError("Qloo request failed.", "http");
}

export type InsightsCall = {
  domain: EntityType;
  signalIds: string[];
  excludeIds: string[];
  take: number;
  city?: string;
  country?: string;
  fixedIds?: string[];
  revision: number;
};

export type InsightsOutcome = {
  candidates: Candidate[];
  envelope: SignedEnvelope | null;
  warnings: string[];
  locality: unknown | null;
  empty: boolean;
};

function payloadFor(call: InsightsCall, params: URLSearchParams, body: ReturnType<typeof normaliseInsights>, retrievedAt: string): EvidencePayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "qloo",
    revision: call.revision,
    domain: call.domain,
    request: { path: "/v2/insights", params: Object.fromEntries(params.entries()) },
    retrievedAt,
    queryEnvelope: body.queryEnvelope,
    locality: body.locality,
    candidates: body.candidates,
  };
}

export async function qlooInsights(call: InsightsCall, deps: QlooDeps = {}, signal?: AbortSignal): Promise<InsightsOutcome> {
  const params = buildInsightsParams(call);
  const retrievedAt = (deps.now ?? (() => new Date()))().toISOString();
  let json: unknown;
  try {
    json = await qlooFetch("/v2/insights", params, deps, signal);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("Qloo insights failed.", "http");
  }
  let normalised;
  try {
    normalised = normaliseInsights(json, call.domain, retrievedAt);
  } catch (error) {
    if (error instanceof QlooSchemaError) throw new ProviderError(error.message, "schema");
    throw error;
  }
  const secret = providerEnv(deps.env).EVIDENCE_SIGNING_SECRET;
  const payload = payloadFor(call, params, normalised, retrievedAt);
  const envelope = secret ? signEnvelope(payload, secret, Date.parse(retrievedAt)) : null;
  const warnings = [...normalised.warnings];
  if (!secret) warnings.push("Evidence signing secret is not configured, so this response cannot be reused as verified provider evidence.");
  if (!normalised.candidates.length) {
    warnings.push(`No ${DOMAIN_LABEL[call.domain].toLowerCase()} candidates came back. That is an empty result, not a failed request.`);
  }
  return {
    candidates: normalised.candidates,
    envelope,
    warnings,
    locality: normalised.locality,
    empty: normalised.candidates.length === 0,
  };
}

export async function qlooSearch(
  query: string,
  types: EntityType | null,
  deps: QlooDeps = {},
  signal?: AbortSignal,
): Promise<{ options: SearchOption[]; warnings: string[]; ambiguous: boolean; notInQloo: boolean }> {
  const params = buildSearchParams(query, types, 6);
  const json = await qlooFetch("/search", params, deps, signal);
  let normalised;
  try {
    normalised = normaliseSearch(json);
  } catch (error) {
    if (error instanceof QlooSchemaError) throw new ProviderError(error.message, "schema");
    throw error;
  }
  return {
    options: normalised.options,
    warnings: normalised.warnings,
    ambiguous: normalised.options.length !== 1,
    notInQloo: normalised.options.length === 0,
  };
}

export async function qlooEntities(ids: string[], deps: QlooDeps = {}, signal?: AbortSignal): Promise<InsightsOutcome> {
  const params = buildEntityParams(ids);
  const retrievedAt = (deps.now ?? (() => new Date()))().toISOString();
  const json = await qlooFetch("/entities", params, deps, signal);
  const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const list = record && Array.isArray(record.results)
    ? record.results
    : record && record.results && typeof record.results === "object" && Array.isArray((record.results as { entities?: unknown[] }).entities)
      ? (record.results as { entities: unknown[] }).entities
      : record && Array.isArray(record.entities)
        ? record.entities
        : null;
  if (!list) throw new ProviderError("Unexpected Qloo entity envelope.", "schema");
  const normalised = normaliseInsights({ results: list, query: record?.query ?? null }, "urn:entity:brand", retrievedAt);
  return {
    candidates: normalised.candidates,
    envelope: null,
    warnings: normalised.warnings,
    locality: null,
    empty: normalised.candidates.length === 0,
  };
}

export async function qlooScorePool(
  calls: InsightsCall[],
  deps: QlooDeps = {},
  signal?: AbortSignal,
): Promise<InsightsOutcome[]> {
  const outcomes: InsightsOutcome[] = [];
  for (const call of calls) {
    outcomes.push(await qlooInsights({ ...call, take: Math.max(call.fixedIds?.length ?? 1, 1) }, deps, signal));
  }
  return outcomes;
}
