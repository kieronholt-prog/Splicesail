import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeTrackNotificationsBanner } from "@/components/sailing-analysis/home-track-notifications-banner";
import { TracksHubList } from "@/components/sailing-analysis/tracks-hub-list";
import { fetchHomeTrackNotifications } from "@/lib/home-track-notifications";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = { searchParams: Promise<{ error?: string; renamed?: string; removed?: string }> };

export default async function TracksPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const [{ data: rows }, trackNotifications] = await Promise.all([
    supabase
      .from("race_track_submissions")
      .select("id, activity_name, activity_started_at, status, analysis_mode, race_id")
      .eq("user_id", user.id)
      .neq("status", "cancelled")
      .order("activity_started_at", { ascending: false }),
    fetchHomeTrackNotifications(supabase, user.id),
  ]);

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
        <p className="mt-2 text-sm text-splice-navy-light dark:text-splice-water">
          Upload GPS tracks or sync from Strava, then link them to a race for analysis.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        ) : null}
        {q.renamed === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            Track name updated.
          </p>
        ) : null}
        {q.removed === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            Track removed.
          </p>
        ) : null}

        <HomeTrackNotificationsBanner items={trackNotifications} />
        <div className="mt-6">
          <TracksHubList rows={rows ?? []} />
        </div>
      </main>
    </div>
  );
}
