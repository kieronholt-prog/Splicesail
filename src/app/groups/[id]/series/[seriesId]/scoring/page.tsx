import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveSeriesScoringSettingsAction } from "@/app/actions/scoring-config";
import { createClient } from "@/lib/supabase/server";

const PENALTY_OUTCOMES: { code: string; label: string }[] = [
  { code: "dns", label: "DNS — Did not start" },
  { code: "dnf", label: "DNF — Did not finish" },
  { code: "retired", label: "RET — Retired" },
  { code: "dsq", label: "DSQ — Disqualified" },
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href={`/groups/${groupId}/series/${seriesId}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ← {series.name}
          </Link>
          <span className="mx-2 text-zinc-400">·</span>
          <span className="text-zinc-500">{group?.name}</span>
        </p>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Scoring settings
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
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

          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Handicap</h2>
            <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              System
              <select
                name="handicap_system"
                defaultValue={scoringCfg?.handicap_system ?? "portsmouth"}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="portsmouth">Portsmouth Yardstick (corrected seconds)</option>
                <option value="none">None (elapsed / finish-time ordering)</option>
              </select>
            </label>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Non-finisher points
            </h2>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Points = count + plus, where count is either series entrants (registered sailors), race starters (marked started this race), race finishers (finished with official time), or a fixed value you choose.
            </p>
            <div className="mt-6 flex flex-col gap-6">
              {PENALTY_OUTCOMES.map((po) => {
                const row = penaltyByOutcome.get(po.code);
                return (
                  <div
                    key={po.code}
                    className="grid gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:grid-cols-12 sm:items-end"
                  >
                    <div className="sm:col-span-4">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{po.label}</p>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-400">{po.code}</p>
                    </div>
                    <label className="sm:col-span-4">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Basis</span>
                      <select
                        name={`${po.code}_basis`}
                        defaultValue={row?.basis ?? "race_starters"}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="series_entrants">Series entrants</option>
                        <option value="race_starters">Race starters</option>
                        <option value="race_finishers">Race finishers</option>
                        <option value="fixed">Fixed points</option>
                      </select>
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Plus</span>
                      <input
                        name={`${po.code}_plus`}
                        type="number"
                        step={1}
                        defaultValue={row?.plus ?? 0}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Fixed</span>
                      <input
                        name={`${po.code}_fixed`}
                        type="text"
                        placeholder="If basis=fixed"
                        defaultValue={
                          row?.fixed_points != null ? String(row.fixed_points) : ""
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Discard schedule
            </h2>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Rows apply when the count of <strong>results-final</strong> races in this series falls between{" "}
              <em>from</em> and <em>to</em> (leave <em>to</em> blank for “and above”). Non-overlapping bands only.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <span className="col-span-3">Row</span>
                <span className="col-span-3">From (# races)</span>
                <span className="col-span-3">To (optional)</span>
                <span className="col-span-3">Discards</span>
              </div>
              {Array.from({ length: 8 }).map((_, i) => {
                const b = discardSeed[i];
                return (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <span className="col-span-3 flex items-center text-sm text-zinc-600 dark:text-zinc-400">
                    {i + 1}
                  </span>
                  <input
                    name={`band_${i}_from`}
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={b?.races_from ?? ""}
                    placeholder="e.g. 1"
                    className="col-span-3 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <input
                    name={`band_${i}_to`}
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={b?.races_to ?? ""}
                    placeholder="blank = ∞"
                    className="col-span-3 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <input
                    name={`band_${i}_discards`}
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={b?.discards ?? ""}
                    placeholder="0"
                    className="col-span-3 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
              );
              })}
            </div>
          </section>

          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save scoring settings
          </button>
        </form>

        <p className="mt-10 text-xs text-zinc-500 dark:text-zinc-400">
          <Link href={`/groups/${groupId}/series/${seriesId}/standings`} className="text-blue-600 underline dark:text-blue-400">
            View series standings →
          </Link>
        </p>
      </main>
    </div>
  );
}
