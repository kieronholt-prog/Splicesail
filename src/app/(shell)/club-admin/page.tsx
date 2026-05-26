import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ClubAdminHubPage({ searchParams }: Props) {
  const q = await searchParams;
  const actionError = q.error ? decodeURIComponent(q.error) : null;

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: rows, error: membershipsFetchError } = await supabase
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
    .eq("role", "club_admin")
    .order("created_at", { ascending: false });

  type ClubMini = { id: string; name: string; slug: string | null };
  const clubs: ClubMini[] = (rows ?? [])
    .map((row) => {
      const raw = row.groups;
      const g = Array.isArray(raw) ? raw[0] : raw;
      if (!g || typeof g !== "object") return null;
      return g as ClubMini;
    })
    .filter((g): g is ClubMini => g != null);

  if (!membershipsFetchError && clubs.length === 1) {
    const notice = actionError ? `?error=${encodeURIComponent(actionError)}` : "";
    redirect(`/groups/${clubs[0].id}/club-admin${notice}`);
  }

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link href="/club-admin" className="text-splice-blue hover:underline dark:text-splice-water">
            ← Club admin home
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">Club admin</h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Series schedules, fleets, Portsmouth numbers, and club time zones are edited per venue. Pick a club where you
          are an administrator.
        </p>

        {actionError ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}

        {membershipsFetchError ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {membershipsFetchError.message}
          </p>
        ) : null}

        {!clubs.length ? (
          <p className="mt-8 rounded-lg border border-splice-sky bg-white px-4 py-6 text-sm text-splice-ocean dark:border-splice-navy-light dark:bg-splice-navy dark:text-splice-water">
            You don&apos;t have club-admin access anywhere yet. When you organise a venue,{" "}
            <Link href="/groups/new" className="font-medium text-splice-blue underline underline-offset-2 dark:text-splice-water">
              create a club
            </Link>{" "}
            or ask an existing administrator to promote your account.
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-splice-sky rounded-xl border border-splice-sky bg-white dark:divide-splice-navy-light dark:border-splice-navy-light dark:bg-splice-navy">
            {clubs.map((g) => (
              <li key={g.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-splice-navy dark:text-splice-surface">{g.name}</p>
                  {g.slug ? (
                    <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">/{g.slug}</p>
                  ) : null}
                </div>
                <Link
                  href={`/groups/${g.id}/club-admin`}
                  className="shrink-0 rounded-lg bg-splice-navy px-4 py-2 text-center text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                >
                  Admin tools
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
