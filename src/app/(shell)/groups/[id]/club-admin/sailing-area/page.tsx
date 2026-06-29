import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { importWscSeedAction } from "@/app/actions/club-sailing-area";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { type SailingMarkVm } from "@/components/sailing-area-marks-section";
import { SailingAreaView } from "@/components/sailing-area-view";
import type { SailingCourseRow } from "@/lib/sailing-analysis/types";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    seeded?: string;
    already_loaded?: string;
    mark_saved?: string;
    course_saved?: string;
    selected?: string;
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

  const markRows = (marks ?? []) as SailingMarkVm[];
  const courseRows = (courses ?? []) as SailingCourseRow[];
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
        {q.mark_saved === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Mark saved.
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
        {markRows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            No marks or courses yet. Warsash clubs are seeded automatically when migrations run; use the button below
            to import the standard WSC set (23 marks, 24 courses).
          </p>
        ) : null}

        {markRows.length === 0 ? (
          <form action={importWscSeedAction} className="mt-6">
            <input type="hidden" name="group_id" value={groupId} />
            <button type="submit" className="rounded-lg border border-splice-navy px-4 py-2 text-sm font-medium">
              Import WSC default marks &amp; courses
            </button>
          </form>
        ) : null}

        <SailingAreaView groupId={groupId} marks={markRows} courses={courseRows} initialCourseId={q.selected} />
      </main>
    </div>
  );
}
