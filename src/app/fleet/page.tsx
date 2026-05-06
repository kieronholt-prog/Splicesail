import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteBoatAction } from "@/app/actions/boats";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function FleetPage({ searchParams }: Props) {
  const q = await searchParams;
  const err = q.error ? decodeURIComponent(q.error) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: boats, error } = await supabase
    .from("boats")
    .select("id, label, class_name, default_sail_number, handedness")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Fleet
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Boats you sail — used when you enter club races (helm/crew template per boat).
            </p>
          </div>
          <Link
            href="/fleet/new"
            className="inline-flex shrink-0 justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add boat
          </Link>
        </div>

        {err ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {err}
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {error.message}
          </p>
        ) : null}

        <ul className="mt-8 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {!boats?.length ? (
            <li className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
              No boats yet.{" "}
              <Link href="/fleet/new" className="font-medium text-blue-600 dark:text-blue-400">
                Add your first boat
              </Link>
              .
            </li>
          ) : (
            boats.map((b) => (
              <li
                key={b.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Link
                    href={`/fleet/${b.id}`}
                    className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
                  >
                    {b.label}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {[b.class_name, b.default_sail_number ? `#${b.default_sail_number}` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {" · "}
                    {b.handedness.replace("_", " ")}
                  </p>
                </div>
                <form action={deleteBoatAction}>
                  <input type="hidden" name="boat_id" value={b.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>
      </main>
    </div>
  );
}
