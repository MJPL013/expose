/** Room labels are separate from a guest's saved profile. Seat order breaks ties. */
export function roomNames(names: string[]): string[] {
  const clean = names.map((name) =>
    name.normalize("NFKC").trim().replace(/\s+/g, " "),
  );
  const key = (name: string) => name.toLocaleLowerCase("en");
  const counts = new Map<string, number>();
  clean.forEach((name) =>
    counts.set(key(name), (counts.get(key(name)) ?? 0) + 1),
  );
  // Reserve literal names too: a guest actually named 'Alex 1' must stay distinct.
  const used = new Set(
    clean.filter((name) => counts.get(key(name)) === 1).map(key),
  );
  const next = new Map<string, number>();
  return clean.map((name) => {
    const group = key(name);
    if (counts.get(group) === 1) return name;
    let ordinal = next.get(group) ?? 1;
    let label: string;
    do {
      const suffix = ` ${ordinal++}`;
      label = name.slice(0, 24 - suffix.length).trimEnd() + suffix;
    } while (used.has(key(label)));
    next.set(group, ordinal);
    used.add(key(label));
    return label;
  });
}
