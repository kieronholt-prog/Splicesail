import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveSeriesScoringSettingsAction } from "@/app/actions/scoring-config";
import { SERIES_PENALTY_OUTCOMES } from "@/lib/finish-outcome-labels";
import { getServerAuth } from "@/lib/supabase/auth-cache";

const PENALTY_OUTCOMES = [
  ...SERIES_PENALTY_OUTCOMES,
  { code: "ocs", label: "OCS — On-course side" },
];

type Props = {
  params: Promise<{ id: string; seriesId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function SeriesScoringSettingsPage({
  params,
  searchParams,
}: Props) {
  const { id: groupId, seriesId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .select("id, group_id, name")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesErr || !series || series.group_id !== groupId) {
    notFound();
  }

  const { data: group } = await supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` +
        encodeURIComponent("Only club admins can edit scoring settings."),
    );
  }

  const { data: scoringCfg } = await supabase
    .from("series_scoring_config")
    .select("handicap_system")
    .eq("series_id", seriesId)
    .maybeSingle();

  const { data: penaltyRows } = await supabase
    .from("series_penalty_rules")
    .select("outcome_code, basis, plus, fixed_points")
    .eq("series_id", seriesId);

  const penaltyByOutcome = new Map(
    (penaltyRows ?? []).map((r) => [r.outcome_code, r] as const),
  );

  const { data: discardRows } = await supabase
    .from("series_discard_rules")
    .select("races_from, races_to, discards")
    .eq("series_id", seriesId)
    .order("races_from", { ascending: true });

  const discardSeed = discardRows ?? [];

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link
            href={`/groups/${groupId}/series/${seriesId}`}
            className="text-splice-blue hover:underline dark:text-splice-water"
          >
            ← Maintain {series.name}
          </Link>
          <span className="mx-2 text-splice-water">·</span>
          <Link
            href={`/groups/${groupId}/series`}
            className="text-splice-blue hover:underline dark:text-splice-water"
          >
            Series schedules
          </Link>
          <span className="mx-2 text-splice-water">·</span>
          <span className="text-splice-blue">{group?.name}</span>
        </p>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          Scoring settings
        </h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Configure Portsmouth handicap mode, penalty point formulae (Appendix A style low-point), and how many races may be discarded as the series grows.
        </p>

        {error ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {q.saved === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Scoring settings saved.
          </p>
        ) : null}

        <form action={saveSeriesScoringSettingsAction} className="mt-10 flex flex-col gap-10">
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="series_id" value={seriesId} />

          <section className="rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
            <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Handicap</h2>
            <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
              System
              <select
                name="handicap_system"
                defaultValue={scoringCfg?.handicap_system ?? "portsmouth"}
                className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
              >
                <option value="portsmouth">Portsmouth Yardstick (corrected seconds)</option>
                <option value="none">None (elapsed / finish-time ordering)</option>
              </select>
            </label>
          </section>

          <section className="rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
            <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
              Non-finisher points
            </h2>
            <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
              Points = count + plus, where count is either series entrants (registered sailors), race starters (marked started this race), race finishers (finished with official time), or a fixed value you choose.{" "}
              <strong className="text-splice-ocean dark:text-splice-water">DNC</strong> applies to entries not marked started in the start area (and registered sailors with no race entry).
            </p>
            <div className="mt-6 flex flex-col gap-6">
              {PENALTY_OUTCOMES.map((po) => {
                const row = penaltyByOutcome.get(po.code);
                return (
                  <div
                    key={po.code}
                    className="grid gap-3 border-t border-splice-foam pt-4 dark:border-splice-navy-light sm:grid-cols-12 sm:items-end"
                  >
                    <div className="sm:col-span-4">
                      <p className="text-sm font-medium text-splice-navy dark:text-splice-surface">{po.label}</p>
                      <p className="text-[10px] uppercase tracking-wide text-splice-water">{po.code}</p>
                    </div>
                    <label className="sm:col-span-4">
                      <span className="text-xs font-medium text-splice-ocean dark:text-splice-water">Basis</span>
                      <select
                        name={`${po.code}_basis`}
                        defaultValue={row?.basis ?? "race_starters"}
                        className="mt-1 w-full rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                      >
                        <option value="series_entrants">Series entrants</option>
                        <option value="race_starters">Race starters</option>
                        <option value="race_finishers">Race finishers</option>
                        <option value="fixed">Fixed points</option>
                      </select>
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-splice-ocean dark:text-splice-water">Plus</span>
                      <input
                        name={`${po.code}_plus`}
                        type="number"
                        step={1}
                        defaultValue={row?.plus ?? 0}
                        className="mt-1 w-full rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-splice-ocean dark:text-splice-water">Fixed</span>
                      <input
                        name={`${po.code}_fixed`}
                        type="text"
                        placeholder="If basis=fixed"
                        defaultValue={
                          row?.fixed_points != null ? String(row.fixed_points) : ""
                        }
                        className="mt-1 w-full rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
            <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
              Discard schedule
            </h2>
            <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
              Rows apply when the count of <strong>results-final</strong> races in this series falls between{" "}
              <em>from</em> and <em>to</em> (leave <em>to</em> blank for “and above”). Non-overlapping bands only.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
                <span className="col-span-3">Row</span>
                <span className="col-span-3">From (# races)</span>
                <span className="col-span-3">To (optional)</span>
                <span className="col-span-3">Discards</span>
              </div>
              {Array.from({ length: 8 }).map((_, i) => {
                const b = discardSeed[i];
                return (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <span className="col-span-3 flex items-center text-sm text-splice-ocean dark:text-splice-water">
                    {i + 1}
                  </span>
                  <input
                    name={`band_${i}_from`}
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={b?.races_from ?? ""}
                    placeholder="e.g. 1"
                    className="col-span-3 rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                  />
                  <input
                    name={`band_${i}_to`}
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={b?.races_to ?? ""}
                    placeholder="blank = ∞"
                    className="col-span-3 rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                  />
                  <input
                    name={`band_${i}_discards`}
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={b?.discards ?? ""}
                    placeholder="0"
                    className="col-span-3 rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                  />
                </div>
              );
              })}
            </div>
          </section>

          <button
            type="submit"
            className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
          >
            Save scoring settings
          </button>
        </form>

        <p className="mt-10 text-xs text-splice-blue dark:text-splice-water">
          <Link href={`/groups/${groupId}/series/${seriesId}/standings`} className="text-splice-blue underline dark:text-splice-water">
            View series standings →
          </Link>
        </p>
      </main>
    </div>
  );
}
