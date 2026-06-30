import Link from "next/link";
import type { RaceContextPayload } from "@/lib/mobile/race-context";

type Props = {
  context: RaceContextPayload;
  groupId: string;
  seriesId: string;
  trackCompareHref: string;
};

function statusBadge(status: string) {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    case "pending_ro":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100";
  }
}

export function RaceContextPanel({ context, groupId, seriesId, trackCompareHref }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-splice-navy-light dark:text-splice-water">
          {context.clubName ?? "Club"} · {context.seriesName}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-splice-navy dark:text-splice-foam">
          {context.raceName}
        </h1>
        <p className="mt-1 text-sm text-splice-navy-light dark:text-splice-water">
          #{context.sailNumber}
          {context.boatLabel ? ` · ${context.boatLabel}` : ""}
        </p>
      </div>

      <section className="rounded-lg border border-splice-sky bg-splice-surface/50 p-4 dark:border-splice-navy-light dark:bg-splice-navy/50">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-navy dark:text-splice-foam">
          Race result
        </h2>
        {context.finish ? (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-splice-navy-light dark:text-splice-water">Finish</dt>
              <dd className="text-lg font-semibold text-splice-navy dark:text-splice-foam">
                {context.finish.display}
              </dd>
            </div>
            {context.finish.elapsedSeconds != null ? (
              <div>
                <dt className="text-splice-navy-light dark:text-splice-water">Elapsed</dt>
                <dd className="font-mono text-splice-navy dark:text-splice-foam">
                  {Math.floor(context.finish.elapsedSeconds / 60)}:
                  {String(Math.floor(context.finish.elapsedSeconds % 60)).padStart(2, "0")}
                </dd>
              </div>
            ) : null}
            {context.outcome ? (
              <div>
                <dt className="text-splice-navy-light dark:text-splice-water">Outcome</dt>
                <dd className="text-splice-navy dark:text-splice-foam">{context.outcome}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-splice-navy-light dark:text-splice-water">
            No official finish recorded yet.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-splice-sky bg-white p-4 dark:border-splice-navy-light dark:bg-splice-navy">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-navy dark:text-splice-foam">
            GPS track analysis
          </h2>
          {context.track ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(context.track.status)}`}
            >
              {context.track.status.replace(/_/g, " ")}
            </span>
          ) : null}
        </div>

        {context.track ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-splice-navy dark:text-splice-foam">
              {context.track.activityName ?? "Linked track"}
              {context.track.analysisMode ? ` · ${context.track.analysisMode}` : ""}
            </p>
            <dl className="grid gap-2 sm:grid-cols-3">
              {context.track.durationSeconds != null ? (
                <div>
                  <dt className="text-splice-navy-light dark:text-splice-water">Track elapsed</dt>
                  <dd className="font-mono">
                    {Math.floor(context.track.durationSeconds / 60)}:
                    {String(Math.floor(context.track.durationSeconds % 60)).padStart(2, "0")}
                  </dd>
                </div>
              ) : null}
              {context.track.windDirection != null ? (
                <div>
                  <dt className="text-splice-navy-light dark:text-splice-water">Wind FROM</dt>
                  <dd>{Math.round(context.track.windDirection)}°</dd>
                </div>
              ) : null}
              {context.track.legCount != null ? (
                <div>
                  <dt className="text-splice-navy-light dark:text-splice-water">Legs</dt>
                  <dd>{context.track.legCount}</dd>
                </div>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2 pt-1">
              {context.track.status === "ready" ? (
                <Link
                  href={`/tracks/${context.track.submissionId}/analysis`}
                  className="rounded-lg bg-splice-navy px-3 py-1.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                >
                  View full analysis
                </Link>
              ) : null}
              <Link
                href={trackCompareHref}
                className="rounded-lg border border-splice-sky px-3 py-1.5 text-sm font-medium text-splice-navy dark:border-splice-navy-light dark:text-splice-foam"
              >
                Compare with fleet
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-splice-navy-light dark:text-splice-water">
            No track linked to this race entry yet. Upload from{" "}
            <Link href="/tracks/new" className="underline">
              Tracks
            </Link>
            .
          </p>
        )}
      </section>

      <p className="text-xs text-splice-navy-light dark:text-splice-water">
        <Link
          href={`/groups/${groupId}/series/${seriesId}/races/${context.raceId}/finishes`}
          className="underline"
        >
          Full race results
        </Link>
      </p>
    </div>
  );
}
