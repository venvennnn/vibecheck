import type { CampaignBrief, CommercialEvidence } from "@/lib/schemas";
import { coversRange } from "@/lib/text";

const DAY_MS = 24 * 60 * 60 * 1000;

export function confirmedGates(
  evidence: CommercialEvidence,
  brief: Pick<CampaignBrief, "currency" | "startDate" | "endDate">,
  now = Date.now(),
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!evidence.sourceUrls.length) reasons.push("Needs a campaign-scoped source URL.");
  if (!evidence.currency || evidence.currency !== brief.currency) {
    reasons.push("Quote currency must match the brief. Currencies are not converted.");
  }
  if (evidence.priceHigh == null) reasons.push("Needs an upper price bound.");
  if (
    evidence.priceLow != null &&
    evidence.priceHigh != null &&
    evidence.priceLow > evidence.priceHigh
  ) {
    reasons.push("Price range is inverted.");
  }
  if (
    !brief.startDate ||
    !brief.endDate ||
    !coversRange(evidence.availabilityStart, evidence.availabilityEnd, brief.startDate, brief.endDate)
  ) {
    reasons.push("Availability must cover the campaign dates.");
  }
  if (evidence.rightsStatus !== "cleared") reasons.push("Rights are not cleared.");
  if (evidence.geographyStatus !== "applicable") reasons.push("Geography is not confirmed for this campaign.");
  if (evidence.availabilityStatus === "unavailable") reasons.push("Marked unavailable.");
  const checked = evidence.checkedAt ? Date.parse(evidence.checkedAt) : NaN;
  if (!Number.isFinite(checked) || now - checked > 30 * DAY_MS || checked > now + DAY_MS) {
    reasons.push("The check must be within the last 30 days.");
  }
  return { ok: reasons.length === 0, reasons };
}

export function isBlocked(evidence: CommercialEvidence | undefined): boolean {
  if (!evidence) return false;
  return (
    evidence.availabilityStatus === "unavailable" ||
    evidence.rightsStatus === "blocked" ||
    evidence.geographyStatus === "unsuitable"
  );
}

export function defaultAllocation(budget: number, partnerCount: number, contingency: number): number {
  const slots = Math.max(partnerCount, 1);
  const share = budget / (slots * (1 + Math.max(contingency, 0)));
  return Math.round(share * 100) / 100;
}

export function commercialStatus(
  evidence: CommercialEvidence | undefined,
  brief: Pick<CampaignBrief, "currency" | "startDate" | "endDate">,
): "none" | "allocation" | "quote" | "blocked" {
  if (!evidence) return "none";
  if (isBlocked(evidence)) return "blocked";
  if (confirmedGates(evidence, brief).ok && evidence.priceHigh != null) return "quote";
  if (evidence.allocation != null) return "allocation";
  return "none";
}
