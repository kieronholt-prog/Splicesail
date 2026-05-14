import { notFound, redirect } from "next/navigation";
import { ClubAdminClubPanel } from "@/components/club-admin-club-panel";
import type { ClubAdminGuestSailorVm, ClubAdminMemberRowVm } from "@/components/club-admin-members-modal";
import type { BoatClassCatalogOption } from "@/components/club-guest-boat-class-picker";
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

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id, name, slug, iana_timezone")
    .eq("id", groupId)
    .maybeSingle();

  if (groupErr || !group) notFound();

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

  type GuestBoatSel = {
    id: string;
    label: string;
    class_name: string | null;
    default_sail_number: string | null;
    rya_class_key: string | null;
    linked_boat_id: string | null;
  };

  type GuestSailorSel = {
    id: string;
    first_name: string;
    last_name: string;
    linked_user_id: string | null;
    boats?: GuestBoatSel[] | GuestBoatSel | null;
  };

  function boatsFromEmbedded(b: GuestSailorSel["boats"]): GuestBoatSel[] {
    if (b == null) return [];
    return Array.isArray(b) ? b : [b];
  }

  const [{ data: memRows }, { data: guestRows }, { data: boatClassCatalogRows }] = await Promise.all([
    supabase.from("group_memberships").select("user_id, role").eq("group_id", groupId),
    supabase
      .from("club_guest_sailors")
      .select(
        "id, first_name, last_name, linked_user_id, boats ( id, label, class_name, default_sail_number, rya_class_key, linked_boat_id )",
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: true }),
    supabase
      .from("boat_classes")
      .select("class_key, display_name")
      .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`)
      .order("display_name", { ascending: true }),
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

  const guestsVm: ClubAdminGuestSailorVm[] =
    ((guestRows ?? []) as GuestSailorSel[]).map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      linkedUserId: r.linked_user_id ?? null,
      boats: boatsFromEmbedded(r.boats).map((bb) => ({
        id: bb.id,
        label: bb.label,
        className: bb.class_name ?? null,
        defaultSailNumber: bb.default_sail_number ?? null,
        ryaClassKey: bb.rya_class_key ?? null,
        linkedBoatId: bb.linked_boat_id ?? null,
      })),
    })) ?? [];

  const boatClassCatalogVm: BoatClassCatalogOption[] = (boatClassCatalogRows ?? []).map((r) => ({
    class_key: r.class_key,
    display_name: String(r.display_name ?? r.class_key).trim() || r.class_key,
  }));

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="relative mx-auto w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-8 pt-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Club Administration</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{group.name}</p>

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

        <section className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-800/60">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Tools for this club</h2>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
            Create and Maintain Club Series, Fleets of single or multiple Boat Classes by Class or Handicap, Add Classes of
            Boats for this Club, Set Handicaps for any class to apply at Club level, Set the club time zone.
          </p>
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-700">
            <ClubAdminClubPanel
              group={{
                id: group.id,
                name: group.name,
                slug: group.slug ?? null,
                iana_timezone: group.iana_timezone,
              }}
              openClassListOnLoad={openClassListOnLoad}
              members={membersVm}
              currentUserId={user.id}
              guests={guestsVm}
              boatClassCatalog={boatClassCatalogVm}
              membersModalAutoOpen={
                guestSailorAdded ||
                guestSailorRemoved ||
                guestBoatAdded ||
                guestBoatRemoved ||
                guestLinked ||
                guestUnlinked ||
                memberAddedClub ||
                memberRemovedClub
              }
            />
          </ul>
        </section>
      </main>
    </div>
  );
}
