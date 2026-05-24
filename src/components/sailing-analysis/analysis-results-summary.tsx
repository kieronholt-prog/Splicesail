type AnalysisStats = {
  totalDist?: number;
  duration?: number;
  maxSpeed?: number;
  avgSpeed?: number;
  tackCount?: number;
  gybeCount?: number;
  avgTackQuality?: number | null;
  avgGybeQuality?: number | null;
};

export function AnalysisResultsSummary({
  stats,
  windDirection,
}: {
  stats: AnalysisStats;
  windDirection?: number | null;
}) {
  const distNm = stats.totalDist != null ? (stats.totalDist / 1852).toFixed(2) : "—";
  const durationMin = stats.duration != null ? Math.round(stats.duration / 60) : "—";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Distance" value={`${distNm} nm`} />
      <StatCard label="Duration" value={`${durationMin} min`} />
      <StatCard label="Max speed" value={stats.maxSpeed != null ? `${stats.maxSpeed.toFixed(1)} kts` : "—"} />
      <StatCard label="Avg speed" value={stats.avgSpeed != null ? `${stats.avgSpeed.toFixed(1)} kts` : "—"} />
      <StatCard label="Tacks" value={String(stats.tackCount ?? "—")} />
      <StatCard label="Gybes" value={String(stats.gybeCount ?? "—")} />
      <StatCard
        label="Avg tack quality"
        value={stats.avgTackQuality != null ? `${Math.round(stats.avgTackQuality)}%` : "—"}
      />
      <StatCard
        label="Wind (from)"
        value={windDirection != null ? `${Math.round(windDirection)}°` : "—"}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-splice-sky bg-white p-4 dark:border-splice-ocean dark:bg-splice-navy">
      <p className="text-xs uppercase tracking-wide text-splice-blue dark:text-splice-water">{label}</p>
      <p className="mt-1 text-xl font-semibold text-splice-navy dark:text-splice-foam">{value}</p>
    </div>
  );
}

export function AnalysisLegsTable({ legs }: { legs: Record<string, unknown>[] }) {
  if (!legs?.length) {
    return <p className="text-sm text-splice-ocean">No legs detected — check course marks and rounding.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-splice-sky dark:border-splice-ocean">
            <th className="py-2 pr-4">Leg</th>
            <th className="py-2 pr-4">From → To</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2">Avg VMG</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr key={i} className="border-b border-splice-sky/60 dark:border-splice-ocean/60">
              <td className="py-2 pr-4">{i + 1}</td>
              <td className="py-2 pr-4">
                {String(l.from ?? "—")} → {String(l.to ?? "—")}
              </td>
              <td className="py-2 pr-4">{String(l.type ?? "—")}</td>
              <td className="py-2">
                {l.avgVmgToWind != null && Number.isFinite(Number(l.avgVmgToWind))
                  ? `${Number(l.avgVmgToWind).toFixed(1)} kts`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
