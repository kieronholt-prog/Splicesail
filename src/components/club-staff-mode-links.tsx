import Link from "next/link";
import type { WorkMode } from "@/lib/work-mode";

type Props = {
  groupId: string;
  workMode: WorkMode;
  isClubAdmin: boolean;
  isRaceOfficer: boolean;
};

/** Club admin / race officer shortcuts — hidden in sailor work mode. */
export function ClubStaffModeLinks({ groupId, workMode, isClubAdmin, isRaceOfficer }: Props) {
  if (workMode === "sailor") return null;
  if (!isClubAdmin && !isRaceOfficer) return null;

  const panelClass =
    workMode === "admin"
      ? "mt-6 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30"
      : "mt-6 rounded-xl border border-sky-300 bg-sky-50/90 p-4";

  return (
    <section className={panelClass} aria-label="Club staff tools">
      <h2 className="text-sm font-semibold text-splice-navy">
        {workMode === "admin" ? "Club admin" : "Race officer"} at this club
      </h2>
      <p className="mt-1 text-xs text-splice-ocean">
        You are in <strong>{workMode === "admin" ? "Club admin" : "Race officer"}</strong> mode. Use the mode pills in
        the header to return to your sailor boats and entries.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {isClubAdmin && workMode === "admin" ? (
          <Link
            href={`/groups/${groupId}/club-admin`}
            className="inline-flex rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white"
          >
            Club admin settings
          </Link>
        ) : null}
        {(isRaceOfficer || isClubAdmin) && workMode === "race_officer" ? (
          <Link
            href={`/groups/${groupId}/race-officer`}
            className="inline-flex rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white"
          >
            Race officer — race list
          </Link>
        ) : null}
        {isClubAdmin && workMode === "admin" ? (
          <Link
            href={`/groups/${groupId}/series`}
            className="inline-flex rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy"
          >
            All series
          </Link>
        ) : null}
        {isClubAdmin && workMode === "admin" ? (
          <Link
            href={`/groups/${groupId}/fleets`}
            className="inline-flex rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy"
          >
            Club fleets
          </Link>
        ) : null}
      </div>
    </section>
  );
}
