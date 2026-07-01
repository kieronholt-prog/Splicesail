import {
  formatRaceElapsed,
  formatStartLineDistance,
} from "@/lib/sailing-analysis/analysis-race-timing";

type AnalysisStats = {
  totalDist?: number;
  duration?: number;
  raceElapsedSec?: number;
  trackDurationSec?: number;
  maxSpeed?: number;
  avgSpeed?: number;
  tackCount?: number;
  gybeCount?: number;
  avgTackQuality?: number | null;
  avgGybeQuality?: number | null;
  trackCropApplied?: boolean;
};

type StartLineStats = {
  distM?: number | null;
  timeDeltaSec?: number | null;
  speedPct?: number | null;
};

export function AnalysisResultsSummary({
  stats,
  windDirection,
  startLine,
}: {
  stats: AnalysisStats;
  windDirection?: number | null;
  startLine?: StartLineStats | null;
}) {
  const distNm = stats.totalDist != null ? (stats.totalDist / 1852).toFixed(2) : "—";
  const raceElapsed = formatRaceElapsed(stats.raceElapsedSec ?? stats.duration);
  const trackMin =
    stats.trackDurationSec != null
      ? Math.round(stats.trackDurationSec / 60)
      : stats.duration != null
        ? Math.round(stats.duration / 60)
        : "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Race elapsed" value={raceElapsed} highlight />
        <StatCard label="Distance sailed" value={`${distNm} nm`} />
        <StatCard
          label="At start line"
          value={formatStartLineDistance(startLine?.distM ?? null)}
        />
        <StatCard
          label="Start timing"
          value={
            startLine?.timeDeltaSec != null && Number.isFinite(startLine.timeDeltaSec)
              ? `${startLine.timeDeltaSec >= 0 ? "+" : ""}${startLine.timeDeltaSec.toFixed(1)} s`
              : "—"
          }
          hint={
            startLine?.timeDeltaSec != null
              ? startLine.timeDeltaSec < 0
                ? "Early at gun"
                : "Late at gun"
              : undefined
          }
        />
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
        {stats.trackCropApplied ? (
          <StatCard label="Track cropped" value={`${trackMin} min GPS`} hint="Trimmed after finish" />
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-splice-sky bg-white p-4 dark:border-splice-ocean dark:bg-splice-navy">
      <p className="text-xs font-medium uppercase tracking-wide text-splice-navy-light dark:text-splice-water">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold ${
          highlight
            ? "text-splice-navy dark:text-splice-foam"
            : "text-splice-navy dark:text-splice-foam"
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-splice-ocean dark:text-splice-water">{hint}</p>
      ) : null}
    </div>
  );
}

const legCellClass =
  "py-2 pr-4 text-splice-navy dark:text-splice-foam";
const legHeadClass =
  "py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-splice-navy-light dark:text-splice-water";

export function AnalysisLegsTable({
  legs,
  detailed = false,
}: {
  legs: Record<string, unknown>[];
  detailed?: boolean;
}) {
  if (!legs?.length) {
    return (
      <p className="text-sm text-splice-navy dark:text-splice-foam">
        No legs detected — check course marks and rounding.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-ocean">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-splice-sky/20 dark:bg-splice-navy-light/40">
          <tr className="border-b border-splice-sky dark:border-splice-ocean">
            <th className={legHeadClass}>#</th>
            <th className={legHeadClass}>From → To</th>
            <th className={legHeadClass}>Type</th>
            {detailed ? (
              <>
                <th className={legHeadClass}>Dist</th>
                <th className={legHeadClass}>Avg spd</th>
                <th className={legHeadClass}>VMC</th>
              </>
            ) : null}
            <th className={legHeadClass}>VMG</th>
            {detailed ? <th className={`${legHeadClass} pl-4`}>Eff %</th> : null}
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr
              key={i}
              className="border-b border-splice-sky/60 last:border-0 dark:border-splice-ocean/60"
            >
              <td className={legCellClass}>{i + 1}</td>
              <td className={`${legCellClass} font-medium`}>
                {String(l.from ?? "—")} → {String(l.to ?? "—")}
              </td>
              <td className={`${legCellClass} capitalize`}>{String(l.type ?? "—")}</td>
              {detailed ? (
                <>
                  <td className={legCellClass}>
                    {l.distance != null ? `${(Number(l.distance) / 1852).toFixed(2)} nm` : "—"}
                  </td>
                  <td className={legCellClass}>{fmtKts(l.avgSpeed)}</td>
                  <td className={legCellClass}>{fmtKts(l.avgVmc)}</td>
                </>
              ) : null}
              <td className={legCellClass}>{fmtKts(l.avgVmgToWind ?? l.avgVMG)}</td>
              {detailed ? (
                <td className={`${legCellClass} pl-4`}>
                  {l.efficiency != null && Number.isFinite(Number(l.efficiency))
                    ? `${Math.round(Number(l.efficiency))}%`
                    : "—"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtKts(v: unknown) {
  return v != null && Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)} kts` : "—";
}
