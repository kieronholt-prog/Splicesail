import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClubAdminClubPanel } from "@/components/club-admin-club-panel";
import { ClubAdminPendingAdhocLinksSection } from "@/components/club-admin-pending-adhoc-links";
import type { ClubAdminMemberRowVm } from "@/components/club-admin-members-modal";
import { loadPendingAdhocLinkRowsForGroup } from "@/lib/adhoc-link-pending";
import { getServerAuth } from "@/lib/supabase/auth-cache";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    py_saved?: string;
    py_removed?: string;
    hull_saved?: string;
    hull_removed?: string;
    baseline_saved?: string;
    hull_meta_saved?: string;
    timezone_saved?: string;
    class_list?: string;
    member_added?: string;
    member_removed?: string;
    g?: string;
    guest_sailor_added?: string;
    guest_sailor_removed?: string;
    guest_boat_added?: string;
    guest_boat_removed?: string;
    guest_linked?: string;
    guest_unlinked?: string;
    ro_added_series_saved?: string;
    adhoc_link_confirmed?: string;
    adhoc_link_dismissed?: string;
  }>;
};

export default async function GroupClubAdminPage({ params, searchParams }: Props) {
  const { id: groupId } = await params;
  const q = await searchParams;
  const errorParam = q.error ? decodeURIComponent(q.error) : null;
  const focusGroupId =
    typeof q.g === "string" && UUID_RX.test(q.g.trim()) ? q.g.trim() : groupId;
  const pySavedClub = focusGroupId === groupId && q.py_saved === "1";
  const pyRemovedClub = focusGroupId === groupId && q.py_removed === "1";
  const hullSavedClub = focusGroupId === groupId && q.hull_saved === "1";
  const hullRemovedClub = focusGroupId === groupId && q.hull_removed === "1";
  const baselineSavedClub = focusGroupId === groupId && q.baseline_saved === "1";
  const hullMetaSavedClub = focusGroupId === groupId && q.hull_meta_saved === "1";
  const timezoneSavedClub = focusGroupId === groupId && q.timezone_saved === "1";
  const openClassListOnLoad = focusGroupId === groupId && q.class_list === "1";
  const memberAddedClub = focusGroupId === groupId && q.member_added === "1";
  const memberRemovedClub = focusGroupId === groupId && q.member_removed === "1";
  const guestSailorAdded = focusGroupId === groupId && q.guest_sailor_added === "1";
  const guestSailorRemoved = focusGroupId === groupId && q.guest_sailor_removed === "1";
  const guestBoatAdded = focusGroupId === groupId && q.guest_boat_added === "1";
  const guestBoatRemoved = focusGroupId === groupId && q.guest_boat_removed === "1";
  const guestLinked = focusGroupId === groupId && q.guest_linked === "1";
  const guestUnlinked = focusGroupId === groupId && q.guest_unlinked === "1";
  const roAddedSeriesSaved = focusGroupId === groupId && q.ro_added_series_saved === "1";
  const adhocLinkConfirmed = focusGroupId === groupId && q.adhoc_link_confirmed === "1";
  const adhocLinkDismissed = focusGroupId === groupId && q.adhoc_link_dismissed === "1";

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select(
      "id, name, slug, iana_timezone, ro_added_boats_series_start_line, ro_added_boats_series_standings, approval_status",
    )
    .eq("id", groupId)
    .maybeSingle();

  if (groupErr || !group) notFound();

  if ((group as { approval_status?: string }).approval_status !== "approved") {
    redirect(`/groups/${groupId}?pending=1`);
  }

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Only club administrators can open the club admin tools."),
    );
  }

  const [{ data: memRows }, pendingAdhocLinks, { count: sailingMarkCount }, { count: sailingCourseCount }] =
    await Promise.all([
    supabase.from("group_memberships").select("user_id, role").eq("group_id", groupId),
    loadPendingAdhocLinkRowsForGroup(supabase, groupId),
    supabase.from("group_sailing_marks").select("*", { count: "exact", head: true }).eq("group_id", groupId),
    supabase.from("group_sailing_courses").select("*", { count: "exact", head: true }).eq("group_id", groupId),
  ]);

  const memberIds = (memRows ?? []).map((r) => r.user_id);
  const { data: profRows } =
    memberIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", memberIds)
      : { data: [] as { id: string; display_name: string | null }[] };

  const nameById = new Map((profRows ?? []).map((p) => [p.id, p.display_name]));
  const membersVm: ClubAdminMemberRowVm[] = (memRows ?? [])
    .map((m) => ({
      userId: m.user_id,
      displayName: nameById.get(m.user_id) ?? null,
      role: m.role,
    }))
    .sort((a, b) =>
      String(a.displayName ?? a.userId).localeCompare(String(b.displayName ?? b.userId), undefined, {
        sensitivity: "base",
      }),
    );

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="relative mx-auto w-full max-w-2xl rounded-xl border border-splice-sky bg-white p-8 pt-10 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">Club Administration</h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">{group.name}</p>

        {errorParam ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {errorParam}
          </p>
        ) : null}

        {pySavedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club Portsmouth override saved — {group.name}.
          </p>
        ) : null}

        {pyRemovedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club Portsmouth override removed — national class uses the RYA list again ({group.name}).
          </p>
        ) : null}

        {hullSavedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club hull class added — {group.name}.
          </p>
        ) : null}

        {hullRemovedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club hull class removed ({group.name}).
          </p>
        ) : null}

        {baselineSavedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club hull baseline handicap saved — {group.name}.
          </p>
        ) : null}

        {hullMetaSavedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club hull descriptors updated — {group.name}.
          </p>
        ) : null}

        {timezoneSavedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Club time zone saved — {group.name}.
          </p>
        ) : null}

        {memberAddedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Member added — {group.name}.
          </p>
        ) : null}

        {memberRemovedClub ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Member removed — {group.name}.
          </p>
        ) : null}

        {guestSailorAdded ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest sailor added — {group.name}.
          </p>
        ) : null}
        {guestSailorRemoved ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest sailor removed — {group.name}.
          </p>
        ) : null}
        {guestBoatAdded ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Boat added for a guest sailor — {group.name}.
          </p>
        ) : null}
        {guestBoatRemoved ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest boat removed — {group.name}.
          </p>
        ) : null}
        {guestLinked ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest record linked — {group.name}.
          </p>
        ) : null}
        {guestUnlinked ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest link cleared — {group.name}.
          </p>
        ) : null}
        {roAddedSeriesSaved ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            RO-added boat series settings saved — {group.name}.
          </p>
        ) : null}
        {adhocLinkConfirmed ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            RO-added result linked to the sailor&apos;s official entry — finish copied across.
          </p>
        ) : null}
        {adhocLinkDismissed ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Pending RO-added link dismissed — the race-only result stays separate.
          </p>
        ) : null}

        <ClubAdminPendingAdhocLinksSection
          groupId={groupId}
          clubTz={group.iana_timezone ?? "Europe/London"}
          rows={pendingAdhocLinks}
        />

        <section className="mt-8 rounded-xl border border-splice-sky bg-splice-surface px-5 py-4 dark:border-splice-ocean dark:bg-splice-navy-light/60">
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Sailing area (GPS analysis)</h2>
          <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
            Configure chart marks and course letters used when sailors and race officers set up GPS track analysis.
            {(sailingMarkCount ?? 0) > 0 ? (
              <> Currently: {sailingMarkCount} marks, {sailingCourseCount ?? 0} courses.</>
            ) : (
              <> No WSC catalogue loaded yet — open to import 23 marks and courses A–Y.</>
            )}
          </p>
          <Link
            href={`/groups/${groupId}/club-admin/sailing-area`}
            className="mt-4 inline-flex rounded-lg border border-splice-navy px-4 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
          >
            Edit marks &amp; courses
          </Link>
        </section>

        <section className="mt-8 rounded-xl border border-splice-sky bg-splice-surface px-5 py-4 dark:border-splice-ocean dark:bg-splice-navy-light/60">
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Tools for this club</h2>
          <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
            Create and Maintain Club Series, Fleets of single or multiple Boat Classes by Class or Handicap, Add Classes of
            Boats for this Club, Set Handicaps for any class to apply at Club level, Set the club time zone.
          </p>
          <ul className="mt-4 divide-y divide-splice-sky dark:divide-splice-ocean">
            <ClubAdminClubPanel
              group={{
                id: group.id,
                name: group.name,
                slug: group.slug ?? null,
                iana_timezone: group.iana_timezone,
                ro_added_boats_series_start_line: group.ro_added_boats_series_start_line,
                ro_added_boats_series_standings: group.ro_added_boats_series_standings,
              }}
              openClassListOnLoad={openClassListOnLoad}
              members={membersVm}
              currentUserId={user.id}
              membersModalAutoOpen={memberAddedClub || memberRemovedClub}
            />
          </ul>
        </section>
      </main>
    </div>
  );
}
