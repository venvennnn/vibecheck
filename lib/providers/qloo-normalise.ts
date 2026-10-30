import { DOMAIN_LABEL, domainFromEntity, type EntityType } from "@/lib/domains";
import type { Candidate } from "@/lib/schemas";
import { isHttpUrl, sanitizeText } from "@/lib/text";

export class QlooSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QlooSchemaError";
  }
}

export type NormalisedInsights = {
  candidates: Candidate[];
  queryEnvelope: unknown;
  locality: unknown | null;
  shape: "results.entities" | "results" | "entities";
  warnings: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readEntities(body: Record<string, unknown>): { entities: unknown[]; shape: NormalisedInsights["shape"] } {
  if (Array.isArray(body.results)) return { entities: body.results, shape: "results" };
  const results = asRecord(body.results);
  if (results && Array.isArray(results.entities)) {
    return { entities: results.entities, shape: "results.entities" };
  }
  if (Array.isArray(body.entities)) return { entities: body.entities, shape: "entities" };
  throw new QlooSchemaError("Unexpected Qloo envelope. Expected a results entity array or results.entities.");
}

function imageUrl(entity: Record<string, unknown>): string | null {
  const properties = asRecord(entity.properties);
  const image = properties ? asRecord(properties.image) : null;
  const direct = image && typeof image.url === "string" ? image.url : null;
  const images = properties && Array.isArray(properties.images) ? properties.images : [];
  const first = asRecord(images[0]);
  const nested = first && typeof first.url === "string" ? first.url : null;
  const url = direct || nested;
  return url && isHttpUrl(url) ? url : null;
}

function tagsOf(entity: Record<string, unknown>): string[] {
  if (!Array.isArray(entity.tags)) return [];
  const tags: string[] = [];
  for (const tag of entity.tags) {
    if (typeof tag === "string" && tag.trim()) tags.push(sanitizeText(tag, 80));
    else if (tag && typeof tag === "object") {
      const record = tag as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name : typeof record.id === "string" ? record.id : "";
      if (name.trim()) tags.push(sanitizeText(name, 80));
    }
    if (tags.length === 40) break;
  }
  return tags;
}

function affinityOf(query: Record<string, unknown> | null): number | null {
  if (!query || typeof query.affinity !== "number" || !Number.isFinite(query.affinity)) return null;
  return query.affinity;
}

function metadataLine(entity: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof entity.disambiguation === "string") parts.push(sanitizeText(entity.disambiguation, 120));
  const properties = asRecord(entity.properties);
  if (properties) {
    if (typeof properties.address === "string") parts.push(sanitizeText(properties.address, 120));
    if (typeof properties.release_year === "number") parts.push(String(properties.release_year));
    const description = typeof properties.short_description === "string" ? properties.short_description : "";
    if (description) parts.push(sanitizeText(description, 120));
  }
  if (typeof entity.popularity === "number" && Number.isFinite(entity.popularity)) {
    parts.push(`popularity ${entity.popularity.toFixed(2)}`);
  }
  const line = parts.filter(Boolean).join(" · ");
  return line ? line.slice(0, 400) : null;
}

export function entityQuery(entity: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(entity.query);
}

export function normaliseEntity(
  value: unknown,
  domainHint: EntityType | null,
  retrievedAt: string,
  queryId: string | null,
  locality: unknown | null,
): { candidate: Candidate | null; warning: string | null } {
  const entity = asRecord(value);
  if (!entity) return { candidate: null, warning: "Skipped a Qloo record that was not an object." };
  const id = typeof entity.entity_id === "string" ? entity.entity_id : typeof entity.id === "string" ? entity.id : "";
  const name = typeof entity.name === "string" ? sanitizeText(entity.name, 200) : "";
  if (!id || !name) return { candidate: null, warning: "Skipped a Qloo record missing an id or name." };
  const domain = domainFromEntity(entity) ?? domainHint;
  if (!domain) return { candidate: null, warning: `Skipped ${name} because its entity type is unsupported.` };
  const query = entityQuery(entity);
  const explainability = query ? (query.explainability ?? null) : null;
  const properties = asRecord(entity.properties);
  const description =
    properties && typeof properties.description === "string"
      ? sanitizeText(properties.description, 600)
      : null;
  const finer =
    properties && typeof properties.category === "string"
      ? sanitizeText(properties.category, 80)
      : "";
  return {
    candidate: {
      id,
      name,
      entityType: domain,
      category: finer || DOMAIN_LABEL[domain],
      imageUrl: imageUrl(entity),
      description: description || null,
      tags: tagsOf(entity),
      affinity: affinityOf(query),
      queryId,
      explainability,
      explainabilityAvailable: explainability != null,
      retrievedAt,
      locality,
    },
    warning: null,
  };
}

export function normaliseInsights(
  body: unknown,
  domain: EntityType,
  retrievedAt: string,
): NormalisedInsights {
  const record = asRecord(body);
  if (!record) throw new QlooSchemaError("Qloo response was not a JSON object.");
  if (record.success === false) {
    const message =
      typeof record.message === "string"
        ? record.message
        : typeof record.error === "string"
          ? record.error
          : "Qloo reported a failed request.";
    throw new QlooSchemaError(sanitizeText(message, 240));
  }
  const { entities, shape } = readEntities(record);
  const queryEnvelope = record.query ?? null;
  const queryRecord = asRecord(record.query);
  const results = asRecord(record.results);
  const locality = queryRecord?.locality ?? results?.locality ?? null;
  const queryId = queryRecord && typeof queryRecord.id === "string" ? queryRecord.id : null;
  const warnings: string[] = [];
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const entity of entities) {
    const normalised = normaliseEntity(entity, domain, retrievedAt, queryId, locality);
    if (normalised.warning) warnings.push(normalised.warning);
    if (!normalised.candidate) continue;
    if (seen.has(normalised.candidate.id)) {
      warnings.push(`Duplicate id ${normalised.candidate.id} was ignored.`);
      continue;
    }
    seen.add(normalised.candidate.id);
    candidates.push(normalised.candidate);
  }
  return { candidates, queryEnvelope, locality, shape, warnings };
}

export type SearchOption = {
  qlooId: string;
  name: string;
  entityType: EntityType | null;
  metadata: string | null;
};

export function normaliseSearch(body: unknown): { options: SearchOption[]; warnings: string[] } {
  const record = asRecord(body);
  if (!record) throw new QlooSchemaError("Qloo search response was not a JSON object.");
  if (record.success === false) {
    throw new QlooSchemaError(
      sanitizeText(
        typeof record.message === "string" ? record.message : "Qloo search failed.",
        240,
      ),
    );
  }
  const { entities } = readEntities(record);
  const warnings: string[] = [];
  const options: SearchOption[] = [];
  const seen = new Set<string>();
  for (const entity of entities) {
    const item = asRecord(entity);
    if (!item) continue;
    const qlooId = typeof item.entity_id === "string" ? item.entity_id : typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? sanitizeText(item.name, 200) : "";
    if (!qlooId || !name) {
      warnings.push("Skipped a search hit missing an id or name.");
      continue;
    }
    if (seen.has(qlooId)) continue;
    seen.add(qlooId);
    options.push({
      qlooId,
      name,
      entityType: domainFromEntity(item),
      metadata: metadataLine(item),
    });
    if (options.length === 6) break;
  }
  return { options, warnings };
}
