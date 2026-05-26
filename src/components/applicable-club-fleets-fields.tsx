import Link from "next/link";

import { InfoHint } from "@/components/ui/info-hint";

/** Shared form fields: select club fleets + start offset (minutes after first start). */
export function ApplicableClubFleetsFields({
  fleets,
  groupId,
  defaultSelections,
}: {
  fleets: { id: string; name: string }[];
  /** When set, pre-check fleets and preload offsets from the saved schedule template */
  defaultSelections?: { fleetId: string; startOffsetMinutes: number }[];
  /** When set, the empty-state message links here to maintain fleets. */
  groupId?: string;
}) {
  if (!fleets.length) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
        Define at least one fleet with boat classes on the club page
        {groupId ? (
          <>
            {" "}
            (
            <Link href={`/groups/${groupId}/fleets`} className="font-medium underline">
              Club fleets — create &amp; maintain (Club admin settings)
            </Link>
            )
          </>
        ) : null}{" "}
        before creating races.
      </div>
    );
  }

  const fleetsSorted = [...fleets].sort((a, b) => {
    const off = (fid: string) =>
      defaultSelections?.find((s) => s.fleetId === fid)?.startOffsetMinutes ?? 0;
    const oa = off(a.id);
    const ob = off(b.id);
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return (
    <fieldset className="space-y-2">
      <legend className="flex items-center gap-1.5 text-sm font-medium text-splice-navy-light dark:text-splice-sky">
        Applicable fleets
        <InfoHint label="About applicable fleets">
          <p className="mb-2">
            Choose which club fleets sail this race or all generated races. For each fleet, set the{" "}
            <strong className="text-splice-navy-light dark:text-splice-sky">start delay</strong> (minutes after the first start) —
            use <strong className="text-splice-navy-light dark:text-splice-sky">0</strong> for the same start as the leading fleet.
          </p>
          <p>
            Class lists come from your fleet definitions. Default start flag is P; pennants are set under Club fleets.
          </p>
        </InfoHint>
      </legend>
      <ul className="divide-y divide-splice-foam rounded-lg border border-splice-sky dark:divide-splice-navy-light dark:border-splice-navy-light">
        {fleetsSorted.map((f) => {
          const picked = defaultSelections?.find((s) => s.fleetId === f.id);
          const defaultChecked = picked != null;
          const offsetDefault = picked?.startOffsetMinutes ?? 0;
          return (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-1.5"
            >
              <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
                <input
                  type="checkbox"
                  name="applicable_group_fleet"
                  value={f.id}
                  defaultChecked={defaultChecked}
                  className="shrink-0"
                />
                <span className="min-w-0">{f.name}</span>
              </label>
              <label className="flex shrink-0 items-center gap-2 text-xs text-splice-ocean dark:text-splice-water">
                <span className="whitespace-nowrap">Start Delay</span>
                <input
                  type="number"
                  name={`fleet_start_offset_${f.id}`}
                  min={0}
                  max={60}
                  defaultValue={offsetDefault}
                  className="w-14 rounded-lg border border-splice-water bg-white px-1.5 py-1 text-sm tabular-nums text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                  title="Minutes after first fleet start"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
