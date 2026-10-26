// Object insertion order is not game data: PostgreSQL jsonb is free to reorder
// keys. Canonicalize before each transition while preserving all array order
// (turn order, effect batches, placements, etc.). Never mutate the caller.
export function canonicalState<T>(value: T): T {
  if (Array.isArray(value)) return value.map(canonicalState) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonicalState((value as Record<string, unknown>)[key]),
        ]),
    ) as T;
  return value;
}

// Frozen v1/v2 online games were evaluated after jsonb reloaded every move.
// Reproduce that storage order only when replaying those old online records.
export function jsonbSnapshot<T>(value: T): T {
  const encoder = new TextEncoder();
  const sort = (a: string, b: string) => {
    const aa = encoder.encode(a),
      bb = encoder.encode(b);
    if (aa.length !== bb.length) return aa.length - bb.length;
    for (let i = 0; i < aa.length; i++)
      if (aa[i] !== bb[i]) return aa[i] - bb[i];
    return 0;
  };
  const visit = (v: any): any =>
    Array.isArray(v)
      ? v.map(visit)
      : v !== null && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort(sort)
              .map((key) => [key, visit(v[key])]),
          )
        : v;
  return visit(JSON.parse(JSON.stringify(value)));
}
