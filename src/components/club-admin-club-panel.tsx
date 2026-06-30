import Link from "next/link";
import { Suspense } from "react";
import {
  updateClubIanaTimezoneAction,
  updateClubRoAddedBoatsSeriesSettingsAction,
} from "@/app/actions/group-settings";
import {
  ClubAdminMembersModal,
  type ClubAdminMemberRowVm,
} from "@/components/club-admin-members-modal";
import { ClubPyHullAdminTriggers } from "@/components/club-portsmouth-admin-account";
import { clubTimezoneSelectOptions, resolveClubIanaTimeZone } from "@/lib/club-time";

export type ClubAdminClubRow = {
  id: string;
  name: string;
  slug: string | null;
  iana_timezone?: string | null;
  ro_added_boats_series_start_line?: boolean | null;
  ro_added_boats_series_standings?: boolean | null;
};

type Props = {
  group: ClubAdminClubRow;
  /** Opens Class list modal on load (e.g. after saving a new club hull class). */
  openClassListOnLoad?: boolean;
  /** When set (club admin page only), enables the member list and add/remove tools. */
  members?: ClubAdminMemberRowVm[];
  currentUserId?: string;
  /** Reopen Members dialog after redirect from a member server action. */
  membersModalAutoOpen?: boolean;
};

export function ClubAdminClubPanel({
  group: g,
  openClassListOnLoad,
  members,
  currentUserId,
  membersModalAutoOpen = false,
}: Props) {
  const tzOptions = clubTimezoneSelectOptions();

  return (
    <li className="flex flex-col gap-5 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-splice-navy dark:text-splice-foam">{g.name}</p>
        {g.slug ? (
          <p className="mt-1 text-[11px] uppercase tracking-wide text-splice-blue dark:text-splice-water">
            Short name /{g.slug}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
          Create/Maintain series
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/groups/${g.id}/series`}
            className="inline-flex shrink-0 justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Maintain Series
          </Link>
          <Link
            href={`/groups/${g.id}/series/new`}
            className="inline-flex shrink-0 justify-center rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy transition hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-surface dark:hover:bg-splice-navy"
          >
            New series
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
          Create/Maintain fleet
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/groups/${g.id}/fleets`}
            className="inline-flex shrink-0 justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Club fleets
          </Link>
          <Link
            href={`/groups/${g.id}/fleets/new`}
            className="inline-flex shrink-0 justify-center rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy transition hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-surface dark:hover:bg-splice-navy"
          >
            New fleet
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
          Create/Amend class &amp; PN for Club
        </p>
        <Suspense
          fallback={
            <div className="py-2 text-xs text-splice-blue dark:text-splice-water">Loading class and handicap tools…</div>
          }
        >
          <ClubPyHullAdminTriggers groupId={g.id} openClassListOnLoad={openClassListOnLoad} />
        </Suspense>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-splice-sky bg-white px-3 py-3 dark:border-splice-ocean dark:bg-splice-navy/40">
        <p className="text-[11px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
          Club time zone
        </p>
        <p className="text-xs text-splice-ocean dark:text-splice-water">
          Sailors and race listings use this zone (including daylight saving, e.g.{" "}
          <span className="font-medium text-splice-navy-light dark:text-splice-sky">Europe/London</span> for GMT/BST). Schedules,
          finish times, and forms interpret dates and times in this clock.
        </p>
        <form action={updateClubIanaTimezoneAction} className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="group_id" value={g.id} />
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
            IANA time zone
            <select
              name="iana_timezone"
              defaultValue={resolveClubIanaTimeZone(g.iana_timezone)}
              className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            >
              {tzOptions.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
          >
            Save time zone
          </button>
        </form>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-splice-sky bg-white px-3 py-3 dark:border-splice-ocean dark:bg-splice-navy/40">
        <p className="text-[11px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
          RO-added boats in series
        </p>
        <p className="text-xs text-splice-ocean dark:text-splice-water">
          When a race officer adds a boat for one race only (sail number and class, not on the series signup), these
          options control whether that hull appears on the start line of later races in the same series and whether it
          counts in series standings.
        </p>
        <form action={updateClubRoAddedBoatsSeriesSettingsAction} className="mt-1 flex flex-col gap-3">
          <input type="hidden" name="group_id" value={g.id} />
          <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
            Show on start line in later series races
            <select
              name="ro_added_boats_series_start_line"
              defaultValue={g.ro_added_boats_series_start_line ? "yes" : "no"}
              className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
            Include in series standings
            <select
              name="ro_added_boats_series_standings"
              defaultValue={g.ro_added_boats_series_standings ? "yes" : "no"}
              className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <button
            type="submit"
            className="self-start rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
          >
            Save RO-added boat settings
          </button>
        </form>
      </div>
      {members != null && currentUserId != null ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">Members</p>
          <div className="flex flex-wrap items-center gap-2">
            <ClubAdminMembersModal
              groupId={g.id}
              currentUserId={currentUserId}
              members={members}
              autoOpen={membersModalAutoOpen}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
          Sailing results
        </p>
        <p className="text-xs text-splice-ocean dark:text-splice-water">
          When a hull is retired from a sailor&apos;s fleet but still has series results on their account, restore those
          finishes to race-only RO-added rows before removing the boat.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/groups/${g.id}/club-admin/delink-results`}
            className="inline-flex shrink-0 justify-center rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/50"
          >
            De-link Result &amp; Sailor
          </Link>
        </div>
      </div>
    </li>
  );
}
