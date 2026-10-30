import { DOMAIN_LABEL, type EntityType } from "@/lib/domains";

export function domainLabel(type: EntityType | null | undefined) {
  return type ? DOMAIN_LABEL[type] : "Reference";
}

export function money(amount: number | null | undefined, currency: string) {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function affinityText(value: number | null) {
  if (value == null || Number.isNaN(value)) return "Unavailable";
  return value.toFixed(3);
}

export function when(iso: string | null | undefined) {
  if (!iso) return "Not checked";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
