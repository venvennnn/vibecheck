import type { ResearchLead } from "@/lib/schemas";
import { isHttpUrl, sanitizeText } from "@/lib/text";
import { ProviderError, type FetchLike } from "@/lib/providers/qloo";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function tavilySearch(input: {
  candidateId: string;
  name: string;
  category: string;
  city: string;
  country: string;
  env?: { TAVILY_API_KEY?: string };
  fetch?: FetchLike;
  now?: () => Date;
  signal?: AbortSignal;
  delay?: (ms: number) => Promise<void>;
}): Promise<ResearchLead[]> {
  const key = (input.env ?? process.env).TAVILY_API_KEY;
  if (!key) throw new ProviderError("TAVILY_API_KEY is not configured. Research was skipped.", "config");
  const query = sanitizeText(
    `${input.name} ${input.category} ${input.city} ${input.country} partnership OR booking terms`,
    300,
  );
  const fetcher = input.fetch ?? fetch;
  const delay = input.delay ?? sleep;
  let response: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (input.signal?.aborted) throw new ProviderError("Research was cancelled.", "timeout");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      response = await fetcher("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: 3,
          include_answer: false,
        }),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 2) throw new ProviderError(`Tavily returned ${response.status}.`, "http", response.status);
        await delay(Math.min(400 * 2 ** attempt, 5000));
        continue;
      }
      break;
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError) throw error;
      if (attempt === 2) break;
      await delay(Math.min(400 * 2 ** attempt, 5000));
    } finally {
      clearTimeout(timer);
    }
  }
  if (!response) {
    throw lastError instanceof ProviderError
      ? lastError
      : new ProviderError("Tavily search failed.", "http");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("Tavily rejected the API key.", "auth", response.status);
  }
  if (!response.ok) throw new ProviderError(`Tavily returned ${response.status}.`, "http", response.status);
  const json = (await response.json()) as { results?: unknown[] };
  const retrievedAt = (input.now ?? (() => new Date()))().toISOString();
  const leads: ResearchLead[] = [];
  for (const item of (json.results ?? []).slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : "";
    if (!isHttpUrl(url)) continue;
    leads.push({
      id: `research-${input.candidateId}-${leads.length + 1}`,
      candidateId: input.candidateId,
      query,
      url,
      title: sanitizeText(typeof record.title === "string" ? record.title : input.name, 200) || input.name,
      snippet: sanitizeText(typeof record.content === "string" ? record.content : "", 500),
      retrievedAt,
      provider: "tavily",
    });
  }
  return leads;
}
