import { savePursuitRaceConfigAction } from "@/app/actions/pursuit-config";
import { utcIsoToZonedDatetimeLocalValue } from "@/lib/club-time";
import { loadPursuitSlotsForRace, resolveClassPyMap } from "@/lib/pursuit-slots-server";
import { formatClubHmFromIso } from "@/lib/club-display-format";
import type { SupabaseClient } from "@supabase/supabase-js";

type Props = {
  groupId: string;
  seriesId: string;
  raceId: string;
  clubTz: string;
  /** When set, shown in the section heading (series maintain view). */
  raceLabel?: string;
  /** Nested under a race row on the series page — no outer card chrome. */
  embedded?: boolean;
  race: {
    pursuit_finish_at: string | null;
    pursuit_first_start_at: string | null;
    pursuit_start_increment_seconds: number | null;
    pursuit_group_fleet_id: string | null;
    results_final: boolean;
  };
  fleets: { id: string; name: string }[];
  supabase: SupabaseClient;
};

export async function PursuitRaceConfigPanel({
  groupId,
  seriesId,
  raceId,
  clubTz,
  raceLabel,
  embedded = false,
  race,
  fleets,
  supabase,
}: Props) {
  const slots = await loadPursuitSlotsForRace(supabase, raceId);

  let previewClasses: { classKey: string; displayName: string; py: number | null }[] = [];
  const fleetId = race.pursuit_group_fleet_id;
  if (fleetId) {
    const { data: fc } = await supabase.from("group_fleet_classes").select("class_key").eq("fleet_id", fleetId);
    const keys = [...new Set((fc ?? []).map((r) => r.class_key))];
    const pyMap = await resolveClassPyMap(supabase, { groupId, seriesId, raceId }, keys);
    const { data: names } = await supabase.from("boat_classes").select("class_key, display_name").in("class_key", keys);
    const nameMap = new Map((names ?? []).map((r) => [r.class_key, r.display_name ?? r.class_key]));
    previewClasses = keys.map((classKey) => ({
      classKey,
      displayName: nameMap.get(classKey) ?? classKey,
      py: pyMap.get(classKey) ?? null,
    }));
  }

  const shellClass = embedded
    ? "border-t border-splice-sky bg-splice-surface/40 px-4 py-4 dark:border-splice-navy-light dark:bg-splice-navy/50"
    : "mt-8 rounded-xl border border-splice-sky bg-white p-4 dark:border-splice-navy-light dark:bg-splice-navy";

  const heading = raceLabel ? `Pursuit settings — ${raceLabel}` : "Pursuit settings";

  return (
    <section id={`race-pursuit-${raceId}`} className={shellClass}>
      <h3 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">{heading}</h3>
      <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">
        Finish time, first start, increment, and fleet define the class start sheet. Save to recalculate slots for
        race officers on the start line.
      </p>

      {race.results_final ? (
        <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">Locked — results are final.</p>
      ) : (
        <form action={savePursuitRaceConfigAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="series_id" value={seriesId} />
          <input type="hidden" name="race_id" value={raceId} />

          <label className="flex max-w-xs flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
            Fleet
            <select
              name="pursuit_group_fleet_id"
              required
              defaultValue={race.pursuit_group_fleet_id ?? ""}
              className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            >
              <option value="">Choose…</option>
              {fleets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
              First boat start
              <input
                name="pursuit_first_start_at"
                type="datetime-local"
                required
                defaultValue={
                  race.pursuit_first_start_at
                    ? utcIsoToZonedDatetimeLocalValue(race.pursuit_first_start_at, clubTz)
                    : ""
                }
                className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
              Finish time
              <input
                name="pursuit_finish_at"
                type="datetime-local"
                required
                defaultValue={
                  race.pursuit_finish_at
                    ? utcIsoToZonedDatetimeLocalValue(race.pursuit_finish_at, clubTz)
                    : ""
                }
                className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
              Start increment
              <select
                name="pursuit_start_increment_seconds"
                required
                defaultValue={String(race.pursuit_start_increment_seconds ?? 60)}
                className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
              >
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="120">2 minutes</option>
              </select>
            </label>
          </div>

          {previewClasses.length ? (
            <details className="rounded-lg border border-splice-sky dark:border-splice-navy-light">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-splice-ocean dark:text-splice-water">
                Classes &amp; PN ({previewClasses.length})
              </summary>
              <div className="overflow-x-auto border-t border-splice-sky dark:border-splice-navy-light">
                <table className="w-full min-w-[280px] text-left text-sm">
                  <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                    <tr>
                      <th className="px-3 py-2 font-medium">Class</th>
                      <th className="px-3 py-2 font-medium">PN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                    {previewClasses.map((c) => (
                      <tr key={c.classKey}>
                        <td className="px-3 py-2">{c.displayName}</td>
                        <td className="px-3 py-2 tabular-nums">{c.py ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          <button
            type="submit"
            className="w-fit rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
          >
            Save &amp; calculate starts
          </button>
        </form>
      )}

      {slots.length ? (
        <details className="mt-4 rounded-lg border border-splice-sky dark:border-splice-navy-light">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-splice-ocean dark:text-splice-water">
            Calculated start sheet ({slots.length} {slots.length === 1 ? "slot" : "slots"})
          </summary>
          <ul className="divide-y divide-splice-sky border-t border-splice-sky dark:divide-splice-navy-light dark:border-splice-navy-light">
            {slots.map((s) => (
              <li key={s.slotId} className="px-3 py-2 text-sm">
                <span className="font-semibold tabular-nums">{formatClubHmFromIso(s.startAt, clubTz)}</span>
                <span className="text-splice-ocean dark:text-splice-water">
                  {" "}
                  — {s.classes.map((c) => c.displayName).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
