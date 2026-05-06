import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GroupSeriesPage({ params }: Props) {
  const { id: groupId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href={`/groups/${groupId}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ← {group.name}
          </Link>
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Series
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Schedule structure for this club. Races live inside a series.
            </p>
          </div>
          {isAdmin ? (
            <Link
              href={`/groups/${groupId}/series/new`}
              className="inline-flex shrink-0 justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              New series
            </Link>
          ) : null}
        </div>

        {error ? (
          <p className="mt-8 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {error.message}
          </p>
        ) : null}

        <ul className="mt-8 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {!rows?.length ? (
            <li className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
              No series yet.
              {isAdmin ? (
                <>
                  {" "}
                  <Link
                    href={`/groups/${groupId}/series/new`}
                    className="font-medium text-blue-600 dark:text-blue-400"
                  >
                    Create one
                  </Link>
                  .
                </>
              ) : null}
            </li>
          ) : (
            rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/groups/${groupId}/series/${s.id}`}
                  className="flex flex-col gap-1 px-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{s.name}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {s.starts_on || s.ends_on
                      ? `${s.starts_on ?? "…"} → ${s.ends_on ?? "…"}`
                      : "Dates TBC"}
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
