const SECRET_KEY = /api[_-]?key|authorization|token|secret|password/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    if (value.length > 2000) return `${value.slice(0, 2000)}…`;
    if (SECRET_KEY.test(value) && value.length > 24) return "[redacted]";
    return value;
  }
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : redact(item, depth + 1);
  }
  return out;
}
