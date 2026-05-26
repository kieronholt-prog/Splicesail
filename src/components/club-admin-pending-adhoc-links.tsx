import Link from "next/link";
import {
  confirmPendingAdhocLinkAction,
  dismissPendingAdhocLinkAction,
} from "@/app/actions/adhoc-link-admin";
import type { PendingAdhocLinkRowVm } from "@/lib/adhoc-link-pending";
import {
  formatClubDateTimeMediumShort,
  formatClubDdMmmYyyyFromIso,
  formatClubHmFromIso,
} from "@/lib/club-display-format";

type Props = {
  groupId: string;
  clubTz: string;
  rows: PendingAdhocLinkRowVm[];
};

export function ClubAdminPendingAdhocLinksSection({ groupId, clubTz, rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-6 dark:border-amber-900/60 dark:bg-amber-950/30">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
        RO-added results to link
      </h2>
      <p className="mt-2 text-xs text-amber-950/80 dark:text-amber-100/80">
        A sailor registered a boat that matches race-only results recorded before they joined the series. Confirm to copy
        each finish onto their official entry, or dismiss if the match is wrong.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-amber-200/80 bg-white dark:border-amber-900/50 dark:bg-splice-navy">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-amber-100 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20">
            <tr>
              <th className="px-4 py-3 font-medium text-amber-950 dark:text-amber-100">Series / race</th>
              <th className="px-4 py-3 font-medium text-amber-950 dark:text-amber-100">RO boat</th>
              <th className="px-4 py-3 font-medium text-amber-950 dark:text-amber-100">Sailor signup</th>
              <th className="px-4 py-3 font-medium text-amber-950 dark:text-amber-100">Finish</th>
              <th className="px-4 py-3 font-medium text-amber-950 dark:text-amber-100">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100 dark:divide-amber-900/40">
            {rows.map((row) => (
              <tr key={row.guestEntryId}>
                <td className="px-4 py-3 align-top text-splice-navy dark:text-splice-foam">
                  <p className="font-medium">{row.seriesName}</p>
                  <p className="mt-0.5 text-xs text-splice-ocean dark:text-splice-water">{row.raceName}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-splice-blue dark:text-splice-water">
                    {formatClubDdMmmYyyyFromIso(row.raceScheduledAt, clubTz)}
                    {row.raceScheduledAt ? ` · ${formatClubHmFromIso(row.raceScheduledAt, clubTz)}` : null}
                  </p>
                  <Link
                    href={`/groups/${groupId}/series/${row.seriesId}/races/${row.raceId}/finishes`}
                    className="mt-1 inline-block text-xs font-medium text-splice-blue underline underline-offset-2 dark:text-splice-water"
                  >
                    View race finishes
                  </Link>
                </td>
                <td className="px-4 py-3 align-top text-splice-navy dark:text-splice-foam">
                  <p className="font-medium tabular-nums">{row.adhocSailNumber}</p>
                  <p className="mt-0.5 text-xs text-splice-ocean dark:text-splice-water">{row.adhocClassLabel}</p>
                </td>
                <td className="px-4 py-3 align-top text-splice-navy dark:text-splice-foam">
                  <p className="font-medium">{row.sailorDisplayName}</p>
                  <p className="mt-0.5 text-xs text-splice-ocean dark:text-splice-water">{row.boatLabel}</p>
                </td>
                <td className="px-4 py-3 align-top tabular-nums text-splice-ocean dark:text-splice-water">
                  {formatClubDateTimeMediumShort(row.finishAt, clubTz)}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <form action={confirmPendingAdhocLinkAction}>
                      <input type="hidden" name="group_id" value={groupId} />
                      <input type="hidden" name="series_id" value={row.seriesId} />
                      <input type="hidden" name="race_id" value={row.raceId} />
                      <input type="hidden" name="race_guest_entry_id" value={row.guestEntryId} />
                      <input type="hidden" name="matched_user_id" value={row.matchedUserId} />
                      <input type="hidden" name="matched_boat_id" value={row.matchedBoatId} />
                      <button
                        type="submit"
                        className="rounded-lg bg-splice-navy px-3 py-1.5 text-xs font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                      >
                        Confirm link
                      </button>
                    </form>
                    <form action={dismissPendingAdhocLinkAction}>
                      <input type="hidden" name="group_id" value={groupId} />
                      <input type="hidden" name="race_guest_entry_id" value={row.guestEntryId} />
                      <button
                        type="submit"
                        className="rounded-lg border border-splice-water bg-white px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
