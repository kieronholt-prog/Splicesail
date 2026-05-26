import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatPostgresDateDdMmmYyyy } from "@/lib/club-display-format";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GroupSeriesPage({ params }: Props) {
  const { id: groupId } = await params;

  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) {
    notFound();
  }

  const { data: rows, error } = await supabase
    .from("series")
    .select("id, name, starts_on, ends_on, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = me?.role === "club_admin";

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link
            href={`/groups/${groupId}`}
            className="text-splice-blue hover:underline dark:text-splice-water"
          >
            ← {group.name}
          </Link>
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
              Series
            </h1>
            <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">
              Schedule structure for this club. Races live inside a series. Club admins create series from{" "}
              <Link href="/club-admin" className="font-medium text-splice-blue underline dark:text-splice-water">
                Club admin
              </Link>{" "}
              or from this club hub (<span className="font-medium text-splice-navy-light dark:text-splice-sky">Series schedules</span>
              ).
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-8 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {error.message}
          </p>
        ) : null}

        <ul className="mt-8 divide-y divide-splice-sky rounded-xl border border-splice-sky bg-white dark:divide-splice-navy-light dark:border-splice-navy-light dark:bg-splice-navy">
          {!rows?.length ? (
            <li className="px-4 py-10 text-center text-sm text-splice-ocean dark:text-splice-water">
              No series yet.
              {isAdmin ? (
                <>
                  {" "}
                  <Link href="/club-admin" className="font-medium text-splice-blue underline dark:text-splice-water">
                    Club admin
                  </Link>
                  {" "}
                  or create from this club hub.
                </>
              ) : null}
            </li>
          ) : (
            rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/groups/${groupId}/series/${s.id}`}
                  className="flex flex-col gap-1 px-4 py-4 transition hover:bg-splice-surface dark:hover:bg-splice-navy-light/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-splice-navy dark:text-splice-surface">{s.name}</span>
                  <span className="text-xs tabular-nums text-splice-blue dark:text-splice-water">
                    {s.starts_on || s.ends_on ? (
                      <>
                        {formatPostgresDateDdMmmYyyy(s.starts_on)}
                        {" "}→ {formatPostgresDateDdMmmYyyy(s.ends_on)}
                      </>
                    ) : (
                      "Dates TBC"
                    )}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </main>
    </div>
  );
}
