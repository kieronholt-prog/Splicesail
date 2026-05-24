import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import {
  deleteSailingCourseAction,
  deleteSailingMarkAction,
  importWscSeedAction,
  saveSailingCourseAction,
  saveSailingMarkAction,
} from "@/app/actions/club-sailing-area";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    seeded?: string;
    already_loaded?: string;
    mark_saved?: string;
    course_saved?: string;
  }>;
};

export default async function SailingAreaAdminPage({ params, searchParams }: Props) {
  const { id: groupId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin") {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Club admin only."));
  }

  const { data: group } = await supabase.from("groups").select("id, name").eq("id", groupId).maybeSingle();
  if (!group) notFound();

  const [
    { data: marks, error: marksError },
    { data: courses, error: coursesError },
  ] = await Promise.all([
    supabase.from("group_sailing_marks").select("*").eq("group_id", groupId).order("sort_order"),
    supabase.from("group_sailing_courses").select("*").eq("group_id", groupId).order("sort_order"),
  ]);

  const markRows = marks ?? [];
  const courseRows = courses ?? [];
  const loadError = marksError?.message ?? coursesError?.message ?? null;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-3xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <Link href={`/groups/${groupId}/club-admin`} className="text-sm text-splice-blue underline">
          ← Club admin
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-splice-navy dark:text-splice-foam">Sailing area</h1>
        <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">{group.name}</p>

        {error || loadError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error ?? loadError}
          </p>
        ) : null}
        {q.seeded === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            WSC seed marks and courses imported.
          </p>
        ) : null}
        {q.already_loaded === "1" ? (
          <p className="mt-4 rounded-lg border border-splice-sky bg-splice-surface px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy-light/60 dark:text-splice-foam">
            WSC marks and courses are already loaded for this club ({markRows.length} marks, {courseRows.length}{" "}
            courses).
          </p>
        ) : null}
        {markRows.length > 0 ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {markRows.length} chart marks and {courseRows.length} course letters (A–Y + custom) from the Sailstats WSC
            catalogue are configured for track analysis.
          </p>
        ) : (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            No marks or courses yet. Warsash clubs are seeded automatically when migrations run; use the button below
            to import the standard WSC set (23 marks, 24 courses).
          </p>
        )}

        {markRows.length === 0 ? (
          <form action={importWscSeedAction} className="mt-6">
            <input type="hidden" name="group_id" value={groupId} />
            <button type="submit" className="rounded-lg border border-splice-navy px-4 py-2 text-sm font-medium">
              Import WSC default marks &amp; courses
            </button>
          </form>
        ) : null}

        <section className="mt-10">
          <h2 className="text-lg font-medium">Marks ({markRows.length})</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {markRows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-splice-sky px-3 py-2 dark:border-splice-ocean">
                <span>
                  {m.name} · {m.lat.toFixed(5)}, {m.lon.toFixed(5)} · {m.mark_kind}
                </span>
                <form action={deleteSailingMarkAction}>
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="mark_id" value={m.id} />
                  <button type="submit" className="text-red-600 underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <form action={saveSailingMarkAction} className="mt-4 grid gap-2 rounded-lg border border-dashed border-splice-sky p-4 dark:border-splice-ocean sm:grid-cols-2">
            <input type="hidden" name="group_id" value={groupId} />
            <input name="name" placeholder="Mark name" required className="rounded border px-2 py-1 text-sm" />
            <select name="mark_kind" defaultValue="laid" className="rounded border px-2 py-1 text-sm">
              <option value="laid">Laid</option>
              <option value="fixed">Fixed</option>
            </select>
            <input name="lat" type="number" step="any" placeholder="Latitude" required className="rounded border px-2 py-1 text-sm" />
            <input name="lon" type="number" step="any" placeholder="Longitude" required className="rounded border px-2 py-1 text-sm" />
            <button type="submit" className="sm:col-span-2 rounded bg-splice-navy px-3 py-2 text-sm text-white dark:bg-splice-foam dark:text-splice-navy">
              Add mark
            </button>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-medium">Courses ({courseRows.length})</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {courseRows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-splice-sky px-3 py-2 dark:border-splice-ocean">
                <span>
                  {c.course_letter} — {c.display_name}
                </span>
                <form action={deleteSailingCourseAction}>
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="course_id" value={c.id} />
                  <button type="submit" className="text-red-600 underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <form action={saveSailingCourseAction} className="mt-4 grid gap-2 rounded-lg border border-dashed border-splice-sky p-4 dark:border-splice-ocean">
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="mark_sequence" value='[["BUOY 11","S"]]' />
            <input type="hidden" name="marks_preamble" value="[]" />
            <input name="course_letter" placeholder="Letter e.g. A" required className="rounded border px-2 py-1 text-sm" />
            <input name="display_name" placeholder="Display name" required className="rounded border px-2 py-1 text-sm" />
            <select name="course_type" defaultValue="SC" className="rounded border px-2 py-1 text-sm">
              <option value="SC">Short course</option>
              <option value="MC">Medium course</option>
              <option value="LC">Long course</option>
              <option value="custom">Custom</option>
            </select>
            <button type="submit" className="rounded bg-splice-navy px-3 py-2 text-sm text-white dark:bg-splice-foam dark:text-splice-navy">
              Add course (edit mark sequence in DB later)
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
