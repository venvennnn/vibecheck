import { CommercialEvidenceSchema, type CommercialEvidence } from "@/lib/schemas";
import { isHttpUrl, isIsoDate, sanitizeText } from "@/lib/text";

export function escapeCsvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(headers.map((header) => escapeCsvCell(row[header])).join(","));
  return lines.join("\n");
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim()));
}

function unguard(value: string): string {
  return /^'[=+\-@\t]/.test(value) ? value.slice(1) : value;
}

const HEADERS = [
  "candidateId",
  "deliverableScope",
  "priceLow",
  "priceHigh",
  "currency",
  "sourceUrl",
  "availabilityStart",
  "availabilityEnd",
  "rightsStatus",
  "geographyStatus",
  "availabilityStatus",
  "allocation",
  "checkedAt",
] as const;

export function commercialTemplate(): string {
  return HEADERS.join(",");
}

export function parseCommercialCsv(text: string): { rows: CommercialEvidence[]; errors: string[] } {
  const table = splitCsv(text);
  const errors: string[] = [];
  if (!table.length) return { rows: [], errors: ["The CSV is empty."] };
  const header = table[0].map((cell) => cell.trim());
  for (const required of ["candidateId"]) {
    if (!header.includes(required)) errors.push(`Missing ${required} column.`);
  }
  if (errors.length) return { rows: [], errors };
  const rows: CommercialEvidence[] = [];
  for (let index = 1; index < table.length && rows.length < 40; index += 1) {
    const record: Record<string, string> = {};
    header.forEach((key, cellIndex) => {
      record[key] = unguard(table[index][cellIndex] ?? "").trim();
    });
    const numberOrNull = (value: string) => (value === "" ? null : Number(value));
    const priceLow = numberOrNull(record.priceLow ?? "");
    const priceHigh = numberOrNull(record.priceHigh ?? "");
    const allocation = numberOrNull(record.allocation ?? "");
    if ((record.priceLow && !Number.isFinite(priceLow)) || (record.priceHigh && !Number.isFinite(priceHigh))) {
      errors.push(`Row ${index + 1} has a price that is not a number.`);
      continue;
    }
    const urls = (record.sourceUrl ?? "")
      .split("|")
      .map((url) => url.trim())
      .filter(isHttpUrl);
    const rights = ["unknown", "cleared", "blocked", "investigating"].includes(record.rightsStatus)
      ? record.rightsStatus
      : "unknown";
    const geography = ["unknown", "applicable", "unsuitable"].includes(record.geographyStatus)
      ? record.geographyStatus
      : "unknown";
    const availability = ["unknown", "available", "unavailable"].includes(record.availabilityStatus)
      ? record.availabilityStatus
      : "unknown";
    const parsed = CommercialEvidenceSchema.safeParse({
      candidateId: sanitizeText(record.candidateId, 200),
      deliverableScope: record.deliverableScope ? sanitizeText(record.deliverableScope, 400) : null,
      priceLow: priceLow != null && Number.isFinite(priceLow) ? priceLow : null,
      priceHigh: priceHigh != null && Number.isFinite(priceHigh) ? priceHigh : null,
      currency: record.currency ? record.currency.toUpperCase() : null,
      sourceUrls: urls,
      availabilityStart: record.availabilityStart && isIsoDate(record.availabilityStart) ? record.availabilityStart : null,
      availabilityEnd: record.availabilityEnd && isIsoDate(record.availabilityEnd) ? record.availabilityEnd : null,
      rightsStatus: rights,
      geographyStatus: geography,
      availabilityStatus: availability,
      checkedAt: record.checkedAt || null,
      allocation: allocation != null && Number.isFinite(allocation) ? allocation : null,
      attested: true,
    });
    if (!parsed.success) {
      errors.push(`Row ${index + 1} could not be read.`);
      continue;
    }
    rows.push(parsed.data);
  }
  return { rows, errors };
}
