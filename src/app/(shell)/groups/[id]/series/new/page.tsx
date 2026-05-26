import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSeriesAction } from "@/app/actions/series";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function NewSeriesPage({ params, searchParams }: Props) {
  const { id: groupId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

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

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin") {
    redirect(`/groups/${groupId}`);
  }

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-md rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link
            href={`/groups/${groupId}`}
            className="text-splice-blue hover:underline dark:text-splice-water"
          >
            ← {group.name}
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          New series
        </h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          For <strong className="text-splice-navy-light dark:text-splice-sky">{group.name}</strong>. Set race or season dates on the
          series page after you create it.
        </p>

        {error ? (
          <p
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <form action={createSeriesAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="group_id" value={groupId} />
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Name
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. Summer handicap 2026"
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Description <span className="font-normal text-splice-blue">(optional)</span>
            <textarea
              name="description"
              rows={3}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Save
          </button>
        </form>
      </main>
    </div>
  );
}
