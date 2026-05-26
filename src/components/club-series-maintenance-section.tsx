"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteSeriesAction } from "@/app/actions/series";
import type { WorkMode } from "@/lib/work-mode";

export type ClubMaintenanceSeriesRow = {
  id: string;
  name: string;
  dateLabel: string;
};

type Props = {
  groupId: string;
  isAdmin: boolean;
  workMode: WorkMode;
  /** Club admin and race officer see schedule maintenance; sailors get race list only. */
  canMaintainSeries: boolean;
  series: ClubMaintenanceSeriesRow[];
};

export function ClubSeriesMaintenanceSection({
  groupId,
  isAdmin,
  workMode,
  canMaintainSeries,
  series,
}: Props) {
  const showAdminTools = isAdmin && workMode === "admin";
  const showMaintain =
    workMode !== "sailor" &&
    (workMode === "admin" ? isAdmin : workMode === "race_officer" && canMaintainSeries);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function closeDeleteModal() {
    setDeleteTarget(null);
  }

  return (
    <section id="club-series-maint" className="mt-10 scroll-mt-4 rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Series schedules</h2>
          <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
            {showAdminTools ? (
              <>
                Maintain race schedules per series. Sailors manage boat sign-ups on{" "}
                <Link href={`/groups#club-${groupId}`} className="font-medium text-splice-blue underline dark:text-splice-water">
                  My Entries
                </Link>
                .
              </>
            ) : (
              <>
                Boat sign-ups and race lists are on{" "}
                <Link href={`/groups#club-${groupId}`} className="font-medium text-splice-blue underline dark:text-splice-water">
                  My Entries
                </Link>
                ) — series schedule &amp; entries per club.
              </>
            )}
          </p>
        </div>
      </div>

      {!series.length ? (
        <p className="mt-4 text-sm text-splice-ocean dark:text-splice-water">
          No series yet.
          {showAdminTools ? (
            <>
              {" "}
              <Link
                href={`/groups/${groupId}/series/new`}
                className="font-medium text-splice-blue underline dark:text-splice-water"
              >
                Create a new series
              </Link>{" "}
              here, or via{" "}
              <Link href="/club-admin" className="font-medium text-splice-blue underline dark:text-splice-water">
                Club admin
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-splice-foam rounded-lg border border-splice-foam dark:divide-splice-navy-light dark:border-splice-navy-light">
          {series.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 px-3 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <span className="font-medium text-splice-navy dark:text-splice-foam">{s.name}</span>
                  <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">{s.dateLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/groups/${groupId}/series/${s.id}/standings`}
                    className="inline-flex justify-center rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
                  >
                    Standings
                  </Link>
                  <Link
                    href={`/groups/${groupId}/series/${s.id}/races`}
                    className="inline-flex justify-center rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
                  >
                    Race list
                  </Link>
                  {showMaintain ? (
                  <Link
                    href={`/groups/${groupId}/series/${s.id}`}
                    className="inline-flex justify-center rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
                  >
                    Maintain
                  </Link>
                  ) : null}
                  {showAdminTools ? (
                    <Link
                      href={`/groups/${groupId}/series/${s.id}/scoring`}
                      className="inline-flex justify-center rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
                    >
                      Scoring settings
                    </Link>
                  ) : null}
                  {showAdminTools ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-800 dark:border-red-900/70 dark:text-red-300"
                      >
                        Delete series
                      </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-splice-sky bg-white p-6 shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-series-maint-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-series-maint-dialog-title"
              className="text-lg font-semibold text-splice-navy dark:text-splice-surface"
            >
              Delete series
            </h3>
            <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
              This permanently removes{" "}
              <span className="font-medium text-splice-navy dark:text-splice-foam">{deleteTarget.name}</span> and its schedule.
              Enter your account password to confirm.
            </p>
            <form key={deleteTarget.id} action={deleteSeriesAction} className="mt-5 space-y-4">
              <input type="hidden" name="group_id" value={groupId} />
              <input type="hidden" name="series_id" value={deleteTarget.id} />
              <label className="block text-sm font-medium text-splice-navy-light dark:text-splice-sky">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  autoFocus
                  placeholder="Your account password"
                  className="mt-1 block w-full rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                />
              </label>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium dark:border-splice-ocean"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
                >
                  Delete permanently
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
