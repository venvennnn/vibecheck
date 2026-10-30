export const ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:place",
  "urn:entity:brand",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const DOMAIN_LABEL: Record<EntityType, string> = {
  "urn:entity:artist": "Music",
  "urn:entity:book": "Books",
  "urn:entity:podcast": "Podcasts",
  "urn:entity:place": "Places",
  "urn:entity:brand": "Brands",
};

export const DOMAIN_ORDER: EntityType[] = [...ENTITY_TYPES];

const SHORT: Record<string, EntityType> = {
  artist: "urn:entity:artist",
  music: "urn:entity:artist",
  book: "urn:entity:book",
  books: "urn:entity:book",
  podcast: "urn:entity:podcast",
  podcasts: "urn:entity:podcast",
  place: "urn:entity:place",
  places: "urn:entity:place",
  brand: "urn:entity:brand",
  brands: "urn:entity:brand",
};

export function domainOf(value: unknown): EntityType | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  for (const type of ENTITY_TYPES) {
    if (raw === type || raw.startsWith(`${type}:`)) return type;
  }
  return SHORT[raw.toLowerCase()] ?? null;
}

export function domainFromEntity(entity: Record<string, unknown>): EntityType | null {
  const subtype = domainOf(entity.subtype);
  if (subtype) return subtype;
  const type = domainOf(entity.type);
  if (type) return type;
  if (Array.isArray(entity.types)) {
    for (const item of entity.types) {
      const found = domainOf(item);
      if (found) return found;
    }
  }
  return domainOf(entity.entity_type);
}
