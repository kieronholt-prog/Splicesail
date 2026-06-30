"use client";

import Link from "next/link";
import { useState } from "react";
import {
  removeTrackSubmissionAction,
  renameTrackSubmissionAction,
} from "@/app/actions/track-submissions";
import { spliceFieldClass } from "@/components/sailing-analysis/form-field-classes";
import { formatClubDdMmmYyyyHmsFromIso } from "@/lib/club-display-format";
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
      <p className="text-sm text-splice-navy-light dark:text-splice-water">
        No track submissions yet. Upload a GPX/FIT file or sync a Strava activity.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-splice-sky dark:divide-splice-ocean">
      {rows.map((r) => (
        <TrackSubmissionListItem key={r.id} row={r} />
      ))}
    </ul>
  );
}

function TrackSubmissionListItem({ row }: { row: TrackSubmissionRow }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.activity_name ?? "");

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form action={renameTrackSubmissionAction} className="flex max-w-md flex-col gap-2">
            <input type="hidden" name="submission_id" value={row.id} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-splice-navy dark:text-splice-foam">
                Track name
              </span>
              <input
                type="text"
                name="activity_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                required
                autoFocus
                className={spliceFieldClass}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-lg bg-splice-navy px-3 py-1.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
              >
                Save name
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(row.activity_name ?? "");
                  setEditing(false);
                }}
                className="rounded-lg border border-splice-navy px-3 py-1.5 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="font-medium text-splice-navy dark:text-splice-foam">
              {row.activity_name ?? "Untitled track"}
            </p>
            <p className="mt-0.5 text-xs text-splice-ocean dark:text-splice-water">
              {formatClubDdMmmYyyyHmsFromIso(row.activity_started_at, "Europe/London")} ·{" "}
              {statusLabel(row.status)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-medium text-splice-ocean underline dark:text-splice-sky"
              >
                Rename
              </button>
              <RemoveTrackButton submissionId={row.id} trackName={row.activity_name ?? "this track"} />
            </div>
          </>
        )}
      </div>
      {!editing ? <TrackSubmissionLink submission={row} /> : null}
    </li>
  );
}

function RemoveTrackButton({ submissionId, trackName }: { submissionId: string; trackName: string }) {
  return (
    <form
      action={removeTrackSubmissionAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Remove “${trackName}” from your tracks? This cannot be undone, but you can upload the file again.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="submission_id" value={submissionId} />
      <button
        type="submit"
        className="font-medium text-red-700 underline dark:text-red-300"
      >
        Remove
      </button>
    </form>
  );
}

function TrackSubmissionLink({ submission }: { submission: TrackSubmissionRow }) {
  const { id, status } = submission;
  if (status === "ready") {
    return (
      <Link
        href={`/tracks/${id}/analysis`}
        className="shrink-0 rounded-lg bg-splice-navy px-3 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
      >
        View analysis
      </Link>
    );
  }
  if (status === "pending_confirm") {
    return (
      <Link
        href={`/tracks/${id}?step=confirm`}
        className="shrink-0 rounded-lg border border-splice-navy px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
      >
        Confirm race
      </Link>
    );
  }
  if (status === "pending_mode") {
    return (
      <Link
        href={`/tracks/${id}?step=mode`}
        className="shrink-0 rounded-lg border border-splice-navy px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
      >
        Choose mode
      </Link>
    );
  }
  if (status === "pending_setup") {
    return (
      <Link
        href={`/tracks/${id}?step=setup`}
        className="shrink-0 rounded-lg border border-splice-navy px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
      >
        Course setup
      </Link>
    );
  }
  if (status === "pending_ro") {
    return (
      <span className="shrink-0 text-sm text-splice-navy-light dark:text-splice-water">
        Waiting for race officer
      </span>
    );
  }
  return (
    <Link
      href={`/tracks/${id}`}
      className="shrink-0 text-sm text-splice-ocean underline dark:text-splice-sky"
    >
      Open
    </Link>
  );
}
