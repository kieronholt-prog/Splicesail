import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships, error } = await supabase
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
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Groups
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Clubs you belong to. Creating a group makes you its first club admin.
            </p>
          </div>
          <Link
            href="/groups/new"
            className="inline-flex shrink-0 justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            New group
          </Link>
        </div>

        {error ? (
          <p className="mt-8 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {error.message}
          </p>
        ) : null}

        <ul className="mt-8 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {!memberships?.length ? (
            <li className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
              You are not in any group yet.{" "}
              <Link href="/groups/new" className="font-medium text-blue-600 dark:text-blue-400">
                Create one
              </Link>
              .
            </li>
          ) : (
            memberships.map((row) => {
              const raw = row.groups;
              const g = Array.isArray(raw) ? raw[0] : raw;
              if (!g || typeof g !== "object") return null;
              const { id, name, slug } = g as {
                id: string;
                name: string;
                slug: string | null;
              };
              return (
                <li key={id}>
                  <Link
                    href={`/groups/${id}`}
                    className="flex flex-col gap-1 px-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{name}</span>
                    <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {row.role.replace("_", " ")}
                      {slug ? ` · /${slug}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </main>
    </div>
  );
}
