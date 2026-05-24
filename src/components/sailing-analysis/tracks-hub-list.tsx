import Link from "next/link";
import type { SubmissionStatus } from "@/lib/sailing-analysis/types";

export type TrackSubmissionRow = {
  id: string;
  activity_name: string | null;
  activity_started_at: string;
  status: SubmissionStatus;
  analysis_mode: string | null;
  race_id: string | null;
};

export function statusLabel(status: SubmissionStatus) {
  const m: Record<SubmissionStatus, string> = {
    draft: "Draft",
    pending_confirm: "Confirm race",
    pending_mode: "Choose mode",
    pending_setup: "Course setup",
    pending_ro: "Awaiting RO",
    ready: "Ready",
    cancelled: "Cancelled",
  };
  return m[status] ?? status;
}

export function TracksHubList({ rows }: { rows: TrackSubmissionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-splice-ocean dark:text-splice-water">
        No track submissions yet. Upload a GPX/FIT file or sync a Strava activity.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-splice-sky dark:divide-splice-ocean">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="font-medium text-splice-navy dark:text-splice-foam">
              {r.activity_name ?? "Untitled track"}
            </p>
            <p className="text-xs text-splice-blue dark:text-splice-water">
              {new Date(r.activity_started_at).toLocaleString()} · {statusLabel(r.status)}
            </p>
          </div>
          <TrackSubmissionLink submission={r} />
        </li>
      ))}
    </ul>
  );
}

function TrackSubmissionLink({ submission }: { submission: TrackSubmissionRow }) {
  const { id, status } = submission;
  if (status === "ready") {
    return (
      <Link
        href={`/tracks/${id}/analysis`}
        className="rounded-lg bg-splice-navy px-3 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
      >
        View analysis
      </Link>
    );
  }
  if (status === "pending_confirm") {
    return (
      <Link
        href={`/tracks/${id}?step=confirm`}
        className="rounded-lg border border-splice-navy px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
      >
        Confirm race
      </Link>
    );
  }
  if (status === "pending_mode") {
    return (
      <Link
        href={`/tracks/${id}?step=mode`}
        className="rounded-lg border border-splice-navy px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
      >
        Choose mode
      </Link>
    );
  }
  if (status === "pending_setup") {
    return (
      <Link
        href={`/tracks/${id}?step=setup`}
        className="rounded-lg border border-splice-navy px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
      >
        Course setup
      </Link>
    );
  }
  if (status === "pending_ro") {
    return (
      <span className="text-sm text-splice-ocean dark:text-splice-water">Waiting for race officer</span>
    );
  }
  return (
    <Link href={`/tracks/${id}`} className="text-sm text-splice-blue underline dark:text-splice-sky">
      Open
    </Link>
  );
}
