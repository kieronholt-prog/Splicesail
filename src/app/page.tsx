import Link from "next/link";
import { HomeDashboard } from "@/components/home-dashboard";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  searchParams: Promise<{
    error?: string;
    afloat?: string;
    ashore?: string;
    details_saved?: string;
    outcome_saved?: string;
  }>;
};

export default async function Home({ searchParams }: Props) {
  const { user } = await getServerAuth();

  if (user) {
    const q = await searchParams;
    const errorDecoded = q.error ? decodeURIComponent(q.error) : null;
    return (
      <HomeDashboard
        userId={user.id}
        homeQuery={{
          error: errorDecoded ?? undefined,
          tallyAfloat: q.afloat === "1",
          tallyAshore: q.ashore === "1",
          detailsSaved: q.details_saved === "1",
          outcomeSaved: q.outcome_saved === "1",
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Race Manager</h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Club racing: sailors, club admins, and race officials. Sign in to see your boats, clubs, series, and race
            activity.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
          >
            Log in
          </Link>
        </div>
      </main>
    </div>
  );
}
