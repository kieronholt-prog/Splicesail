import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AnalysisModeChooser } from "@/components/sailing-analysis/analysis-mode-chooser";
import { RaceBoatConfirmForm } from "@/components/sailing-analysis/race-boat-confirm-form";
import { StandaloneCourseSetupForm } from "@/components/sailing-analysis/standalone-course-setup-form";
import { formatClubDdMmmYyyyHmsFromIso } from "@/lib/club-display-format";
import { loadRaceMatchCandidates } from "@/lib/track-race-matching";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ step?: string; error?: string }>;
};

export default async function TrackSubmissionPage({ params, searchParams }: Props) {
  const { submissionId } = await params;
  const q = await searchParams;
  const step = q.step ?? "";
  const error = q.error ? decodeURIComponent(q.error) : null;

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: sub } = await supabase
    .from("race_track_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) notFound();

  const startMs = new Date(sub.activity_started_at).getTime();
  const endMs = new Date(sub.activity_ended_at).getTime();
  const candidates = await loadRaceMatchCandidates(supabase, user.id, startMs, endMs);

  const effectiveStep =
    step ||
    (sub.status === "pending_confirm"
      ? "confirm"
      : sub.status === "pending_mode"
        ? "mode"
        : sub.status === "pending_setup"
          ? "setup"
          : sub.status === "pending_ro"
            ? "pending_ro"
            : sub.status === "ready"
              ? "ready"
              : "confirm");

  const { data: courses } = await supabase
    .from("group_sailing_courses")
    .select("*")
    .eq("group_id", sub.group_id)
    .order("sort_order");

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <Link href="/tracks" className="text-sm text-splice-blue underline dark:text-splice-sky">
          ← Tracks
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-splice-navy dark:text-splice-foam">
          {sub.activity_name ?? "Track submission"}
        </h1>
        <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">
          {formatClubDdMmmYyyyHmsFromIso(sub.activity_started_at, "Europe/London")}
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        ) : null}

        <div className="mt-8">
          {effectiveStep === "confirm" ? (
            <>
              <h2 className="text-lg font-medium">Confirm race and boat</h2>
              <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
                We matched your track time to the races below. Confirm which race you sailed and which boat you were
                on.
              </p>
              <div className="mt-4">
                {candidates.length > 0 ? (
                  <RaceBoatConfirmForm
                    submissionId={submissionId}
                    candidates={candidates}
                    defaultRaceId={sub.proposed_race_id ?? sub.race_id}
                  />
                ) : (
                  <p className="text-sm text-amber-700">No races match this track time window.</p>
                )}
              </div>
            </>
          ) : null}

          {effectiveStep === "mode" ? (
            <>
              <h2 className="text-lg font-medium">How should this track be used?</h2>
              <div className="mt-4">
                <AnalysisModeChooser submissionId={submissionId} />
              </div>
            </>
          ) : null}

          {effectiveStep === "setup" ? (
            <>
              <h2 className="text-lg font-medium">Course setup</h2>
              <div className="mt-4">
                <StandaloneCourseSetupForm
                  submissionId={submissionId}
                  courses={courses ?? []}
                  defaultCourseLetter={sub.course_letter}
                  defaultLaps={sub.laps}
                />
              </div>
            </>
          ) : null}

          {effectiveStep === "pending_ro" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
              <h2 className="text-lg font-medium text-amber-950 dark:text-amber-50">Waiting for race officer</h2>
              <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
                Your track has been submitted for collated fleet analysis. The race officer or club admin will set up
                course marks for this race. You will see a notification on your home page when your analysis is ready.
              </p>
            </div>
          ) : null}

          {effectiveStep === "ready" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
              <p className="text-sm text-emerald-900 dark:text-emerald-100">Analysis is ready.</p>
              <Link
                href={`/tracks/${submissionId}/analysis`}
                className="mt-4 inline-block rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
              >
                View analysis
              </Link>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
