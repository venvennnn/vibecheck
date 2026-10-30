export function explainLines(explainability: unknown): { available: boolean; lines: string[] } {
  if (explainability == null) return { available: false, lines: [] };
  const names: string[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || names.length > 12) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const id =
      typeof record.entity_id === "string"
        ? record.entity_id
        : typeof record.id === "string"
          ? record.id
          : "";
    if (name && id) names.push(name.slice(0, 120));
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  visit(explainability, 0);
  const unique = [...new Set(names)].slice(0, 6);
  if (!unique.length) {
    return {
      available: true,
      lines: ["Qloo returned explainability without a readable connection list."],
    };
  }
  return {
    available: true,
    lines: unique.map((name) => `Qloo links this to ${name}.`),
  };
}
