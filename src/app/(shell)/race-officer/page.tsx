import { redirect } from "next/navigation";
import { RoNextRaceCountdown } from "@/components/ro-next-race-countdown";
import { fetchRaceOfficerNextRace } from "@/lib/race-officer-next-race";
import { wallTimeMs } from "@/lib/wall-time";
import { getServerAuth } from "@/lib/supabase/auth-cache";

export default async function RaceOfficerHomePage() {
  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: membershipRows, error: membershipErr } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", user.id)
    .in("role", ["club_admin", "race_officer"]);

  const groupIds = [...new Set((membershipRows ?? []).map((r) => r.group_id).filter(Boolean))];
  const hasStaff = groupIds.length > 0;

  const { race: nextRace, error: nextRaceErr } = hasStaff
    ? await fetchRaceOfficerNextRace(supabase, groupIds)
    : { race: null, error: null };

  const serverNowMs = wallTimeMs();

  return (
    <div className="flex flex-1 flex-col px-4 py-12">
      <main className="mx-auto w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-splice-navy">Race officer</h1>
        <p className="mt-2 text-sm text-splice-ocean">
          Record finishes, manage start-line sign-ups, and run race day.
        </p>

        {membershipErr ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {membershipErr.message}
          </p>
        ) : null}

        {nextRaceErr ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {nextRaceErr}
          </p>
        ) : null}

        {!hasStaff ? (
          <p className="mt-8 rounded-lg border border-splice-water bg-white px-4 py-6 text-sm text-splice-ocean">
            You don&apos;t have race-officer or club-admin access at any club yet. Ask a club admin to grant{" "}
            <strong className="text-splice-navy-light">race officer</strong>.
          </p>
        ) : nextRace ? (
          <section className="mt-8 rounded-xl border border-splice-water bg-white px-6 py-8 shadow-sm">
            <RoNextRaceCountdown race={nextRace} serverNowMs={serverNowMs} />
          </section>
        ) : (
          <p className="mt-8 rounded-lg border border-splice-water bg-white px-4 py-6 text-sm text-splice-ocean">
            No upcoming races at your clubs right now. Open the race list to see the full schedule or pick another club.
          </p>
        )}
      </main>
    </div>
  );
}
