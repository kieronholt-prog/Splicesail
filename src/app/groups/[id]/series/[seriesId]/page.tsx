import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  registerForSeriesAction,
  withdrawSeriesRegistrationAction,
} from "@/app/actions/series-registration";
import { createRaceAction } from "@/app/actions/series";
import { createClient } from "@/lib/supabase/server";

function formatUtc(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Props = {
  params: Promise<{ id: string; seriesId: string }>;
  searchParams: Promise<{ error?: string; registered?: string; withdrawn?: string }>;
};

export default async function SeriesDetailPage({ params, searchParams }: Props) {
  const { id: groupId, seriesId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;
  const showRegisteredOk = q.registered === "1";
  const showWithdrawnOk = q.withdrawn === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: series, error: seriesError } = await supabase
    .from("series")
    .select("id, group_id, name, description, starts_on, ends_on")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesError || !series || series.group_id !== groupId) {
    notFound();
  }

  const { data: group } = await supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();

  const { data: races, error: racesError } = await supabase
    .from("races")
    .select("id, name, scheduled_at")
    .eq("series_id", seriesId)
    .order("scheduled_at", { ascending: true });

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = me?.role === "club_admin";
  const isMember = !!me;

  const { data: registrations, error: registrationsError } = await supabase
    .from("series_registrations")
    .select("user_id, created_at")
    .eq("series_id", seriesId)
    .order("created_at", { ascending: true });

  const regIds = registrations?.map((r) => r.user_id) ?? [];
  const regNameByUser = new Map<string, string | null>();

  if (regIds.length > 0) {
    const { data: regProfiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", regIds);

    for (const p of regProfiles ?? []) {
      regNameByUser.set(p.id, p.display_name);
    }
  }

  const isRegistered =
    registrations?.some((r) => r.user_id === user.id) ?? false;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href={`/groups/${groupId}/series`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ← Series
          </Link>
          <span className="mx-2 text-zinc-400">·</span>
          <span className="text-zinc-500">{group?.name}</span>
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {series.name}
        </h1>
        {series.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
            {series.description}
          </p>
        ) : null}
        {(series.starts_on || series.ends_on) ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Season window: {series.starts_on ?? "…"} → {series.ends_on ?? "…"}
          </p>
        ) : null}

        {error ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {showRegisteredOk ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            You are registered for this series (all races in it).
          </p>
        ) : null}

        {showWithdrawnOk ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Registration withdrawn for this series.
          </p>
        ) : null}

        <section className="mt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Series registration
              </h2>
              <p className="mt-1 max-w-xl text-xs text-zinc-500 dark:text-zinc-400">
                v1 rule: one registration covers{" "}
                <strong className="font-medium text-zinc-700 dark:text-zinc-300">every race</strong>{" "}
                in this series.
              </p>
            </div>
            {isMember && !isRegistered ? (
              <form action={registerForSeriesAction}>
                <input type="hidden" name="group_id" value={groupId} />
                <input type="hidden" name="series_id" value={seriesId} />
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Register for series
                </button>
              </form>
            ) : null}
            {isMember && isRegistered ? (
              <form action={withdrawSeriesRegistrationAction}>
                <input type="hidden" name="group_id" value={groupId} />
                <input type="hidden" name="series_id" value={seriesId} />
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
                >
                  Withdraw registration
                </button>
              </form>
            ) : null}
          </div>

          {registrationsError ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
              {registrationsError.message}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {!registrations?.length ? (
                <li className="px-4 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  No sailors registered yet.
                </li>
              ) : (
                registrations.map((r) => (
                  <li
                    key={r.user_id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">
                      {regNameByUser.get(r.user_id) ?? "—"}
                      {r.user_id === user.id ? (
                        <span className="ml-2 text-xs font-normal text-zinc-500">(you)</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Registered{" "}
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(new Date(r.created_at))}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Races
          </h2>
          {racesError ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
              {racesError.message}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {!races?.length ? (
                <li className="px-4 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  No races scheduled yet.
                </li>
              ) : (
                races.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/groups/${groupId}/series/${seriesId}/races/${r.id}`}
                      className="flex flex-col gap-1 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 sm:flex-row sm:justify-between"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">{r.name}</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {formatUtc(r.scheduled_at)} UTC
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>

        {isAdmin ? (
          <section className="mt-10 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add race</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Stored as UTC: append Z from your browser&apos;s datetime-local value (see helper text
              below).
            </p>
            <form action={createRaceAction} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="group_id" value={groupId} />
              <input type="hidden" name="series_id" value={seriesId} />
              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Race name
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Race 3"
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Start (interpreted as UTC)
                <input
                  name="scheduled_at"
                  type="datetime-local"
                  required
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Add race
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
