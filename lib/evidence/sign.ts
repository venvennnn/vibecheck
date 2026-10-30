import { createHmac, timingSafeEqual } from "node:crypto";
import { EvidencePayloadSchema, type EvidencePayload, type SignedEnvelope } from "@/lib/schemas";

const TTL_MS = 2 * 60 * 60 * 1000;

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function mac(exp: number, payload: unknown, secret: string): string {
  return createHmac("sha256", secret).update(`${exp}.${canonical(payload)}`).digest("hex");
}

export function signEnvelope(
  payload: EvidencePayload,
  secret: string,
  now = Date.now(),
  ttlMs = TTL_MS,
): SignedEnvelope {
  const parsed = EvidencePayloadSchema.parse(payload);
  const exp = now + ttlMs;
  return { payload: parsed, exp, sig: mac(exp, parsed, secret) };
}

export function verifyEnvelope(
  envelope: SignedEnvelope,
  secret: string,
  now = Date.now(),
): { ok: true; payload: EvidencePayload } | { ok: false; reason: string } {
  const parsed = EvidencePayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) return { ok: false, reason: "Evidence payload failed validation." };
  if (!secret) return { ok: false, reason: "Evidence signing secret is not configured." };
  if (envelope.exp <= now) return { ok: false, reason: "Evidence envelope has expired." };
  const expected = mac(envelope.exp, parsed.data, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(envelope.sig);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: "Evidence signature does not match." };
  }
  return { ok: true, payload: parsed.data };
}
