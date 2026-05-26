import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/supabase/auth-cache";

export default async function RaceOfficerRaceListHubPage() {
  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: rows, error } = await supabase
    .from("group_memberships")
    .select(
      `
      role,
      groups (
        id,
        name,
        slug
      )
    `,
    )
    .eq("user_id", user.id)
    .in("role", ["club_admin", "race_officer"])
    .order("created_at", { ascending: false });

  type ClubMini = { id: string; name: string; slug: string | null };
  const clubs: { role: string; group: ClubMini }[] = (rows ?? [])
    .map((row) => {
      const raw = row.groups;
      const g = Array.isArray(raw) ? raw[0] : raw;
      if (!g || typeof g !== "object") return null;
      return {
        role: row.role,
        group: g as ClubMini,
      };
    })
    .filter((row): row is { role: string; group: ClubMini } => row != null);

  if (!error && clubs.length === 1) {
    redirect(`/groups/${clubs[0].group.id}/race-officer`);
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-12">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-splice-ocean">
          <Link href="/race-officer" className="text-splice-blue hover:underline">
            ← Race officer home
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-splice-navy">Race list</h1>
        <p className="mt-2 text-sm text-splice-ocean">Pick a club where you are race officer or club admin.</p>

        {error ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error.message}
          </p>
        ) : null}

        {!clubs.length ? (
          <p className="mt-8 rounded-lg border border-splice-water bg-white px-4 py-6 text-sm text-splice-ocean">
            You don&apos;t have race-officer or club-admin access at any club yet.
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-splice-sky rounded-xl border border-splice-water bg-white">
            {clubs.map(({ role, group: g }) => (
              <li key={g.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-splice-navy">{g.name}</p>
                  <p className="mt-1 text-xs text-splice-blue">
                    {role === "club_admin" ? "Club admin" : "Race officer"}
                    {g.slug ? ` · /${g.slug}` : ""}
                  </p>
                </div>
                <Link
                  href={`/groups/${g.id}/race-officer`}
                  className="shrink-0 rounded-lg bg-splice-navy px-4 py-2 text-center text-sm font-medium text-white"
                >
                  Open races
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
