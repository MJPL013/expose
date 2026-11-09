import type { UsageLedger } from "./usage";
type Report = Awaited<ReturnType<UsageLedger["runReport"]>>;
export function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length)
    return { count: 0, average: null, median: null, p95: null };
  return {
    count: sorted.length,
    average: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    median:
      sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}
export function aggregateReports(reports: Report[]) {
  const groups = new Map<string, Report[]>();
  for (const report of reports) {
    if (!report.run.startedAt) continue;
    const cache = (report.measuredUnits.cacheHits ?? 0) > 0 ? "warm" : "cold";
    for (const completion of [
      "started",
      ...(report.run.status === "completed" ? ["completed"] : []),
    ]) {
      const key = `${report.run.mode}:${report.run.seatCount}:${completion}:${report.run.departurePhase ? `departure-${report.run.departurePhase}` : "complete-roster"}:${cache}:${report.currency ?? "unknown"}`;
      groups.set(key, [...(groups.get(key) ?? []), report]);
    }
  }
  return {
    note: "Unknown prices and provider-reconciled amounts remain null. Diagnostic attempts are labelled separately in per-match reports. Cache groups describe actual reuse, not promotional credits.",
    groups: [...groups].map(([group, rows]) => ({
      group,
      matches: rows.length,
      unpriced: rows.filter((r) => r.estimatedCost === null).length,
      estimated: distribution(
        rows.flatMap((r) =>
          r.estimatedCost === null ? [] : [r.estimatedCost],
        ),
      ),
      reconciled: distribution(
        rows.flatMap((r) =>
          r.providerReconciledCost === null ? [] : [r.providerReconciledCost],
        ),
      ),
    })),
  };
}
