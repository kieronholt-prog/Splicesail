import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GroupDetailPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, slug, created_at")
    .eq("id", id)
    .maybeSingle();

  if (groupError || !group) {
    notFound();
  }

  const { data: memberRows, error: membersError } = await supabase
    .from("group_memberships")
    .select("user_id, role, created_at")
    .eq("group_id", id)
    .order("role", { ascending: true });

  const ids = memberRows?.map((m) => m.user_id) ?? [];
  const nameByUser = new Map<string, string | null>();

  if (ids.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);

    for (const p of profileRows ?? []) {
      nameByUser.set(p.id, p.display_name);
    }
  }

  const myMembership = memberRows?.find((m) => m.user_id === user.id);
  const isAdmin = myMembership?.role === "club_admin";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/groups" className="text-blue-600 hover:underline dark:text-blue-400">
            ← Groups
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {group.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          {group.slug ? (
            <span>
              Slug: <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">{group.slug}</code>
            </span>
          ) : null}
          <span>
            Your role:{" "}
            <strong className="text-zinc-800 dark:text-zinc-200">
              {myMembership?.role?.replace("_", " ") ?? "—"}
            </strong>
          </span>
          {isAdmin ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100">
              Club admin
            </span>
          ) : null}
        </div>

        <div className="mt-6">
          <Link
            href={`/groups/${id}/series`}
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Series &amp; races
          </Link>
        </div>

        {membersError ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {membersError.message}
          </p>
        ) : (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Members
            </h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                  <tr>
                    <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">
                      Display name
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">
                      Role
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(memberRows ?? []).map((m) => (
                    <tr key={m.user_id}>
                      <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                        {nameByUser.get(m.user_id) ?? "—"}
                        {m.user_id === user.id ? (
                          <span className="ml-2 text-xs text-zinc-500">(you)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-700 dark:text-zinc-300">
                        {m.role.replace("_", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isAdmin ? (
              <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                Inviting members by email is not wired yet; club admins can add memberships via SQL
                or a future admin flow.
              </p>
            ) : (
              <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                To add a sailor, insert a row into{" "}
                <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">group_memberships</code>{" "}
                (UI invite flow next).
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
