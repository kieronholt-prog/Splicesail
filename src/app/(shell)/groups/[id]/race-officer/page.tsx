import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  clubTodayYmd,
  resolveClubIanaTimeZone,
} from "@/lib/club-time";
import { workModeRaceListHref } from "@/lib/work-mode";
import { getServerAuth } from "@/lib/supabase/auth-cache";

import { RaceOfficerRaceList } from "./race-officer-race-list";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GroupRaceOfficerPage({ params }: Props) {
  const { id: groupId } = await params;

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id, name, iana_timezone")
    .eq("id", groupId)
    .maybeSingle();

  if (groupErr || !group) notFound();

  const clubTz = resolveClubIanaTimeZone((group as { iana_timezone?: string | null }).iana_timezone);

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isClubAdmin = me?.role === "club_admin";
  const isRaceOfficer = me?.role === "race_officer";
  const isStaff = isClubAdmin || isRaceOfficer;

  if (!isStaff) {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Only club admins and race officers can open the race officer view."),
    );
  }

  const todayYmd = clubTodayYmd(clubTz);

  const { data: raceRows, error: racesErr } = await supabase
    .from("races")
    .select("id, name, scheduled_at, results_final, series_id, series!inner(id, name, group_id)")
    .eq("series.group_id", groupId)
    .order("scheduled_at", { ascending: true });

  if (racesErr) {
    return (
      <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
        <main className="mx-auto w-full max-w-4xl">
          <p className="text-sm text-splice-ocean dark:text-splice-water">
            <Link href={workModeRaceListHref()} className="text-splice-blue hover:underline dark:text-splice-water">
              ← Race list
            </Link>
          </p>
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {racesErr.message}
          </p>
        </main>
      </div>
    );
  }

  const racesForList = (raceRows ?? []).map((r) => {
    const nested = r.series;
    const s = (Array.isArray(nested) ? nested[0] : nested) as unknown as {
      id: string;
      name: string;
      group_id: string;
    };
    return {
      id: r.id,
      name: r.name,
      scheduled_at: r.scheduled_at as string,
      results_final: r.results_final,
      series: { id: s.id, name: s.name },
    };
  });

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-4xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link href={workModeRaceListHref()} className="text-splice-blue hover:underline dark:text-splice-water">
            ← Race list
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          {group.name} — races
        </h1>
        <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
          Dates and start times use the club time zone (set under Club admin settings): {clubTz}.
        </p>

        <section className="mt-8 rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Races</h2>

          <div className="mt-4">
            <RaceOfficerRaceList
              groupId={groupId}
              clubTz={clubTz}
              todayYmd={todayYmd}
              races={racesForList}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
