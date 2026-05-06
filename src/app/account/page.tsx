import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfileAction } from "@/app/actions/profile";

type Props = {
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function AccountPage({ searchParams }: Props) {
  const q = await searchParams;
  const errorParam = q.error ? decodeURIComponent(q.error) : null;
  const saved = q.saved === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, phone, share_track_for_enhanced_analytics, share_start_finish_times_for_results",
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
          "display_name, phone, share_track_for_enhanced_analytics, share_start_finish_times_for_results",
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Account
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium text-zinc-800 dark:text-zinc-200">{user.email}</span>
        </p>

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

        <form action={updateProfileAction} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Display name
            <input
              name="display_name"
              type="text"
              defaultValue={displayName}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Phone <span className="font-normal text-zinc-500">(optional)</span>
            <input
              name="phone"
              type="tel"
              defaultValue={phone}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <legend className="px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Sharing defaults
            </legend>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Both are <strong className="font-medium text-zinc-700 dark:text-zinc-300">on</strong>{" "}
              by default per club-racing policy.
            </p>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                name="share_track"
                value="true"
                defaultChecked={shareTrack}
                className="mt-1 size-4 rounded border-zinc-300 text-zinc-900"
              />
              <span>
                Share track for enhanced analytics (RO maps, fleet sailstats-style aggregates when
                linked to club races).
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                name="share_times"
                value="true"
                defaultChecked={shareTimes}
                className="mt-1 size-4 rounded border-zinc-300 text-zinc-900"
              />
              <span>
                Share start and finish times for most accurate results (GPS reconciliation rules
                apply when permitted).
              </span>
            </label>
          </fieldset>

          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Save profile
          </button>
        </form>

        <p className="mt-8 text-center text-sm">
          <Link href="/" className="text-blue-600 underline dark:text-blue-400">
            Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}
