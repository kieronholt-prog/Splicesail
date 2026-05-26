import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createStravaSubmissionAction,
  createUploadSubmissionAction,
} from "@/app/actions/track-submissions";
import { StravaActivityPicker } from "@/components/sailing-analysis/strava-activity-picker";
import { TrackUploadForm } from "@/components/sailing-analysis/track-upload-form";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function TracksNewPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: strava } = await supabase
    .from("user_strava_connections")
    .select("strava_athlete_id, firstname, lastname")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <Link href="/tracks" className="text-sm text-splice-ocean underline dark:text-splice-sky">
          ← Tracks
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-splice-navy dark:text-splice-foam">Add track</h1>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-navy-light dark:text-splice-water">
            Upload file
          </h2>
          <TrackUploadForm action={createUploadSubmissionAction} />
        </section>

        <section className="mt-10 border-t border-splice-sky pt-8 dark:border-splice-ocean">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-navy-light dark:text-splice-water">
            Strava
          </h2>
          {strava ? (
            <StravaActivityPicker
              linkedName={[strava.firstname, strava.lastname].filter(Boolean).join(" ") || "Linked"}
              createAction={createStravaSubmissionAction}
            />
          ) : (
            <p className="mt-3 text-sm text-splice-navy-light dark:text-splice-water">
              <Link href="/api/strava/authorize" className="font-medium text-splice-ocean underline dark:text-splice-sky">
                Link Strava
              </Link>{" "}
              on your account page first.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
