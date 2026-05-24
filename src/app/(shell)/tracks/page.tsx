import Link from "next/link";
import { redirect } from "next/navigation";
import { TracksHubList } from "@/components/sailing-analysis/tracks-hub-list";
import { getServerAuth } from "@/lib/supabase/auth-cache";

export default async function TracksPage() {
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("race_track_submissions")
    .select("id, activity_name, activity_started_at, status, analysis_mode, race_id")
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .order("activity_started_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-splice-navy dark:text-splice-foam">Tracks</h1>
          <Link
            href="/tracks/new"
            className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
          >
            Add track
          </Link>
        </div>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Upload GPS tracks or sync from Strava, then link them to a race for analysis.
        </p>
        {(rows ?? []).some((r) => r.status === "ready") ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            You have analysis ready to view.
          </p>
        ) : null}
        <div className="mt-6">
          <TracksHubList rows={rows ?? []} />
        </div>
      </main>
    </div>
  );
}
