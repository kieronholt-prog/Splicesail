import Link from "next/link";
import { redirect } from "next/navigation";
import { completeAccountIntroAction } from "@/app/actions/account-intro";
import { disconnectStravaAction } from "@/app/actions/club-sailing-area";
import { updateProfileAction } from "@/app/actions/profile";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    strava_linked?: string;
    strava_disconnected?: string;
    py_saved?: string;
    py_removed?: string;
    hull_saved?: string;
    hull_removed?: string;
    timezone_saved?: string;
    g?: string;
  }>;
};

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AccountPage({ searchParams }: Props) {
  const q = await searchParams;
  const errorParam = q.error ? decodeURIComponent(q.error) : null;
  const saved = q.saved === "1";
  const stravaLinked = q.strava_linked === "1";
  const stravaDisconnected = q.strava_disconnected === "1";
  const focusGroupId =
    typeof q.g === "string" && UUID_RX.test(q.g.trim()) ? q.g.trim() : null;
  const pySavedClub = focusGroupId && q.py_saved === "1";
  const pyRemovedClub = focusGroupId && q.py_removed === "1";
  const hullSavedClub = focusGroupId && q.hull_saved === "1";
  const hullRemovedClub = focusGroupId && q.hull_removed === "1";
  const timezoneSavedClub = focusGroupId && q.timezone_saved === "1";

  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, phone, share_track_for_enhanced_analytics, share_start_finish_times_for_results, has_finished_account_intro",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const fallbackName =
      user.user_metadata?.display_name ??
      user.user_metadata?.full_name ??
      user.email?.split("@")[0] ??
      null;
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      display_name: typeof fallbackName === "string" ? fallbackName : null,
    });
    if (!insertError || insertError.code === "23505") {
      const { data: again } = await supabase
        .from("profiles")
        .select(
          "display_name, phone, share_track_for_enhanced_analytics, share_start_finish_times_for_results, has_finished_account_intro",
        )
        .eq("id", user.id)
        .maybeSingle();
      profile = again;
    }
  }

  const displayName = profile?.display_name ?? "";
  const phone = profile?.phone ?? "";
  const shareTrack = profile?.share_track_for_enhanced_analytics ?? true;
  const shareTimes = profile?.share_start_finish_times_for_results ?? true;
  const needsIntro = !profile?.has_finished_account_intro;

  const { data: stravaConn } = await supabase
    .from("user_strava_connections")
    .select("strava_athlete_id, firstname, lastname")
    .eq("user_id", user.id)
    .maybeSingle();

  let focusClubName: string | null = null;
  if (focusGroupId) {
    const { data: focusGroup } = await supabase
      .from("groups")
      .select("name")
      .eq("id", focusGroupId)
      .maybeSingle();
    focusClubName = focusGroup?.name ?? null;
  }

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="relative mx-auto w-full max-w-2xl rounded-xl border border-splice-sky bg-white p-8 pt-10 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
          <form action={completeAccountIntroAction}>
            <button
              type="submit"
              aria-label="Exit account settings"
              className="flex size-9 items-center justify-center rounded-lg text-lg leading-none text-splice-blue transition hover:bg-splice-foam hover:text-splice-navy dark:text-splice-water dark:hover:bg-splice-navy-light dark:hover:text-splice-foam"
            >
              <span aria-hidden className="-mt-px">
                ×
              </span>
            </button>
          </form>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          Sailor settings
        </h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Your profile and sharing defaults. Club administration lives in{" "}
          <Link href="/club-admin" className="font-medium text-splice-blue underline dark:text-splice-water">
            Club admin mode
          </Link>{" "}
          (mode pills in the header). Signed in as{" "}
          <span className="font-medium text-splice-navy-light dark:text-splice-sky">{user.email}</span>
        </p>

        {needsIntro ? (
          <p className="mt-4 rounded-lg bg-splice-foam px-3 py-2 text-sm text-splice-navy-light dark:bg-splice-navy-light/80 dark:text-splice-foam">
            This is your one-time welcome screen. Save your profile below if you&apos;d like, then use Exit (×) above to go
            to Home — afterwards, signing in takes you straight to Home.
          </p>
        ) : null}

        {saved ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Profile saved.
          </p>
        ) : null}

        {errorParam ? (
          <p
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {errorParam}
          </p>
        ) : null}

        {pySavedClub ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club Portsmouth override saved
            {focusClubName ? ` — ${focusClubName}.` : "."}
          </p>
        ) : null}

        {pyRemovedClub ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club Portsmouth override removed — that national class uses the RYA list again
            {focusClubName ? ` (${focusClubName}).` : "."}
          </p>
        ) : null}

        {hullSavedClub ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club hull class added
            {focusClubName ? ` — ${focusClubName}.` : "."}
          </p>
        ) : null}

        {hullRemovedClub ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club hull class removed
            {focusClubName ? ` (${focusClubName}).` : "."}
          </p>
        ) : null}

        {timezoneSavedClub ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-950/40 dark:text-emerald-100">
            Club time zone saved
            {focusClubName ? ` — ${focusClubName}.` : "."}
          </p>
        ) : null}

        {stravaLinked ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Strava account linked.
          </p>
        ) : null}

        {stravaDisconnected ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Strava disconnected.
          </p>
        ) : null}

        <section className="mt-8 rounded-xl border border-splice-sky p-4 dark:border-splice-ocean">
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-foam">Connected apps</h2>
          {stravaConn ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-splice-ocean dark:text-splice-water">
                Strava linked
                {[stravaConn.firstname, stravaConn.lastname].filter(Boolean).join(" ")
                  ? ` — ${[stravaConn.firstname, stravaConn.lastname].filter(Boolean).join(" ")}`
                  : ""}
              </p>
              <form action={disconnectStravaAction}>
                <button type="submit" className="text-splice-blue underline dark:text-splice-sky">
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">
              <Link href="/api/strava/authorize" className="font-medium text-splice-blue underline dark:text-splice-sky">
                Link Strava
              </Link>{" "}
              to sync sail and windsurf activities for track analysis.
            </p>
          )}
        </section>

        <form action={updateProfileAction} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Display name
            <input
              name="display_name"
              type="text"
              defaultValue={displayName}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Phone <span className="font-normal text-splice-blue">(optional)</span>
            <input
              name="phone"
              type="tel"
              defaultValue={phone}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-splice-sky p-4 dark:border-splice-ocean">
            <legend className="px-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
              Sharing defaults
            </legend>
            <p className="text-xs text-splice-blue dark:text-splice-water">
              Both are on by default. You can change them any time.
            </p>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-splice-navy-light dark:text-splice-sky">
              <input
                type="checkbox"
                name="share_track"
                value="true"
                defaultChecked={shareTrack}
                className="mt-1 size-4 rounded border-splice-water text-splice-navy"
              />
              <span>Share track for enhanced analytics</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-splice-navy-light dark:text-splice-sky">
              <input
                type="checkbox"
                name="share_times"
                value="true"
                defaultChecked={shareTimes}
                className="mt-1 size-4 rounded border-splice-water text-splice-navy"
              />
              <span>Share start and finish times for results</span>
            </label>
          </fieldset>

          <button
            type="submit"
            className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Save profile
          </button>
        </form>

        <section className="mt-10 rounded-xl border border-splice-sky bg-splice-surface px-5 py-4 dark:border-splice-ocean dark:bg-splice-navy-light/60">
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Create new club</h2>
          <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
            Start a sailing club on Splice — you become the club admin so you can approve members and run series.
          </p>
          <Link
            href="/groups/new"
            className="mt-4 inline-flex justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Create new club
          </Link>
        </section>

      </main>
    </div>
  );
}
