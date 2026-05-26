import Link from "next/link";
import { redirect } from "next/navigation";
import { ClubSeriesEntriesList } from "@/components/club-series-entries-list";
import { fleetActiveBoatValidToGt } from "@/lib/boat-validity";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { loadMemberClubSeriesEntryRows } from "@/lib/group-series-entries-for-member";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  searchParams: Promise<{
    error?: string;
    q?: string;
    series_entered?: string;
    withdrawn?: string;
  }>;
};

type MemberGroupRow = {
  id: string;
  name: string;
  slug: string | null;
  iana_timezone: string | null;
};

/** Safe fragment for Postgres `ilike` and PostgREST `or()` (no commas / parens). */
function sanitizeClubSearch(raw: string): string {
  return raw
    .trim()
    .replace(/[%_,).]/g, "")
    .slice(0, 48);
}

export default async function GroupsPage({ searchParams }: Props) {
  const q = await searchParams;
  const actionError = q.error ? decodeURIComponent(q.error) : null;
  const seriesEntered = q.series_entered === "1";
  const withdrawnOk = q.withdrawn === "1";
  const searchRaw = typeof q.q === "string" ? q.q : "";
  const searchTerm = searchRaw ? sanitizeClubSearch(searchRaw) : "";

  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships, error } = await supabase
    .from("group_memberships")
    .select(
      `
      groups (
        id,
        name,
        slug,
        iana_timezone
      )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const groupRows: MemberGroupRow[] = (memberships ?? [])
    .map((row) => {
      const raw = row.groups;
      const g = Array.isArray(raw) ? raw[0] : raw;
      if (!g || typeof g !== "object") return null;
      return g as MemberGroupRow;
    })
    .filter((row): row is MemberGroupRow => row != null);

  const memberGroupIds = new Set(groupRows.map((g) => g.id));

  const [
    { data: boatsForUser },
    { data: profileForSeries },
    seriesByGroupId,
  ] = await Promise.all([
    supabase
      .from("boats")
      .select("id,label,rya_class_key,class_name,default_sail_number")
      .eq("owner_user_id", user.id)
      .gt("valid_to", fleetActiveBoatValidToGt())
      .order("label"),
    supabase.from("profiles").select("display_name, phone").eq("id", user.id).maybeSingle(),
    Promise.all(
      groupRows.map(async (g) => {
        const clubTz = resolveClubIanaTimeZone(g.iana_timezone);
        const series = await loadMemberClubSeriesEntryRows(supabase, {
          groupId: g.id,
          userId: user.id,
          clubIanaTz: clubTz,
        });
        return [g.id, series] as const;
      }),
    ).then((pairs) => new Map(pairs)),
  ]);

  const boats = (boatsForUser ?? []).map((b) => ({
    id: b.id,
    label: b.label,
    rya_class_key: b.rya_class_key ?? null,
    class_name: b.class_name ?? null,
    default_sail_number: b.default_sail_number ?? null,
  }));

  const profile = {
    email: user.email ?? null,
    display_name: profileForSeries?.display_name ?? null,
    phone: profileForSeries?.phone ?? null,
  };

  let discoverRows: { id: string; name: string; slug: string | null }[] = [];
  if (searchTerm.length > 0) {
    const pattern = `%${searchTerm}%`;
    const { data: hitRows } = await supabase
      .from("groups")
      .select("id, name, slug")
      .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
      .order("name", { ascending: true })
      .limit(40);
    discoverRows = (hitRows ?? []).filter((g) => !memberGroupIds.has(g.id));
  }

  const clubsSection = (
    <>
      {!groupRows.length ? (
        <p className="mt-8 text-sm text-splice-ocean dark:text-splice-water">
          You are not in any club yet. Search below to join one, or create a club from your{" "}
          <Link href="/account" className="font-medium text-splice-blue dark:text-splice-water">
            Account
          </Link>{" "}
          page if you organise a sailing venue.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {groupRows.map((g) => (
            <ClubSeriesEntriesList
              key={g.id}
              groupId={g.id}
              clubName={g.name}
              embedded
              series={seriesByGroupId.get(g.id) ?? []}
              boats={boats}
              profile={profile}
            />
          ))}
        </div>
      )}
    </>
  );

  const findSection = (
    <section className="mt-12 border-t border-splice-sky pt-10 dark:border-splice-navy-light">
      <h2 className="text-base font-semibold tracking-tight text-splice-navy dark:text-splice-surface">Find a new Club</h2>
      <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
        Search by club name or short name, open the club, then request to join. A club admin will approve or decline your
        request.
      </p>
      <form method="get" action="/groups" className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
          Search
          <input
            type="search"
            name="q"
            defaultValue={searchRaw.trim()}
            placeholder="e.g. Wembley"
            autoComplete="off"
            className="rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          />
        </label>
        <button
          type="submit"
          className="inline-flex shrink-0 justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white sm:mt-5 dark:bg-splice-foam dark:text-splice-navy"
        >
          Search
        </button>
      </form>

      {searchRaw.trim() && !searchTerm ? (
        <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
          Enter letters or numbers to search (some special characters are ignored).
        </p>
      ) : null}

      {searchTerm ? (
        <>
          <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
            Matching clubs
          </h3>
          <ul className="mt-3 divide-y divide-splice-sky rounded-xl border border-splice-sky bg-white dark:divide-splice-navy-light dark:border-splice-navy-light dark:bg-splice-navy">
            {!discoverRows.length ? (
              <li className="px-4 py-8 text-center text-sm text-splice-ocean dark:text-splice-water">
                No clubs match that search, or you already belong to each match.
              </li>
            ) : (
              discoverRows.map((g) => (
                <li key={g.id} className="px-4 py-4">
                  <Link
                    href={`/groups/${g.id}`}
                    className="font-medium text-splice-navy underline-offset-4 hover:underline dark:text-splice-surface"
                  >
                    {g.name}
                  </Link>
                  {g.slug ? (
                    <p className="mt-1 text-xs uppercase tracking-wide text-splice-blue dark:text-splice-water">
                      Short name /{g.slug}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">Open the club page to request to join.</p>
                </li>
              ))
            )}
          </ul>
        </>
      ) : null}
    </section>
  );

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">My Entries</h1>
          <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">
            Series schedules for your clubs — enter boats, view race lists, and check standings. Search below to find and
            join another club.
          </p>
        </div>

        {actionError ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}
        {seriesEntered ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Boat signup saved — boats you selected are attached to those series rows.
          </p>
        ) : null}
        {withdrawnOk ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            You have withdrawn from that series for this venue.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {error.message}
          </p>
        ) : null}

        {clubsSection}
        {findSection}
      </main>
    </div>
  );
}
