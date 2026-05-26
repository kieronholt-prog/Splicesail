"use client";

type TackStats = {
  n?: number;
  avgSpeed?: number | null;
  speedStd?: number | null;
  avgVmgToWind?: number | null;
  avgVMG?: number | null;
  windRelLabel?: string | null;
  courseStd?: number | null;
};

function UpwindTackCard({
  title,
  color,
  stats,
}: {
  title: string;
  color: string;
  stats: TackStats;
}) {
  const v = (x: number | null | undefined, d?: number) =>
    x == null || !Number.isFinite(x) ? "—" : d != null ? x.toFixed(d) : String(Math.round(x));

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${color}44`, background: `${color}10` }}>
      <h4 className="text-sm font-bold" style={{ color }}>
        {title}
      </h4>
      {!stats.n ? (
        <p className="mt-3 text-xs text-splice-ocean">No upwind samples on this tack.</p>
      ) : (
        <dl className="mt-3 space-y-2 text-xs text-splice-ocean dark:text-splice-water">
          <div>
            <dt>Speed (avg)</dt>
            <dd className="font-mono text-base font-semibold text-splice-navy dark:text-splice-foam">
              {v(stats.avgSpeed, 1)} kts
            </dd>
          </div>
          <div>
            <dt>Speed variability</dt>
            <dd className="font-mono text-base font-semibold text-splice-navy dark:text-splice-foam">
              {v(stats.speedStd, 2)} kts σ
            </dd>
          </div>
          <div>
            <dt>VMG to wind (avg)</dt>
            <dd className="font-mono text-base font-semibold text-splice-navy dark:text-splice-foam">
              {v(stats.avgVmgToWind ?? stats.avgVMG, 2)} kts
            </dd>
          </div>
          <div>
            <dt>Angle from wind</dt>
            <dd className="font-mono text-sm text-splice-navy dark:text-splice-foam">
              {stats.windRelLabel || "—"}
            </dd>
          </div>
          <div>
            <dt>Course variability (COG σ)</dt>
            <dd className="font-mono text-base font-semibold text-splice-navy dark:text-splice-foam">
              {v(stats.courseStd, 1)}°
            </dd>
          </div>
          <p className="pt-1 text-[10px] opacity-80">{stats.n} GPS samples · upwind legs only</p>
        </dl>
      )}
    </div>
  );
}

export function UpwindByTackPanel({
  upwindByTack,
  windDeg,
}: {
  upwindByTack: Record<string, unknown>;
  windDeg: number;
}) {
  const uw = upwindByTack as { port?: TackStats; stbd?: TackStats };

  return (
    <section className="rounded-xl border border-splice-sky p-4 dark:border-splice-ocean">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-splice-ocean dark:text-splice-water">
        Upwind · port vs starboard
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-splice-ocean dark:text-splice-water">
        GPS on upwind legs, split by tack vs wind from{" "}
        <span className="font-mono font-semibold text-splice-blue">{Math.round(windDeg)}°</span>. Mark-rounding
        segments excluded (orange on map).
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <UpwindTackCard title="Upwind · port tack" color="#ff4a6a" stats={uw.port ?? {}} />
        <UpwindTackCard title="Upwind · starboard tack" color="#4aff8a" stats={uw.stbd ?? {}} />
      </div>
    </section>
  );
}
