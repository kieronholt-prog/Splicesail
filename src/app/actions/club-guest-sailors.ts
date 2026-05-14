"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clubAdminRedirect(groupId: string, qs: string): never {
  redirect(`/groups/${groupId}/club-admin?${qs}`);
}

async function requireClubAdmin(supabase: SupabaseServerClient, groupId: string, user: User) {
  const { data: row } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (row?.role !== "club_admin") {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Only club admins can manage guest sailors.")}`);
  }
}

export async function createGuestSailorAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const first = String(formData.get("first_name") ?? "").trim();
  const last = String(formData.get("last_name") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdmin(supabase, groupId, user);
  if (!first || !last) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Enter first and last name.")}`);
  }
  const { error } = await supabase.from("club_guest_sailors").insert({
    group_id: groupId,
    first_name: first,
    last_name: last,
  });
  if (error) clubAdminRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  clubAdminRedirect(groupId, `guest_sailor_added=1`);
}

export async function deleteGuestSailorAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const id = String(formData.get("guest_sailor_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdmin(supabase, groupId, user);
  if (!id || !UUID_RX.test(id)) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Invalid guest sailor.")}`);
  }
  const { data: sailor, error: sErr } = await supabase
    .from("club_guest_sailors")
    .select("linked_user_id")
    .eq("id", id)
    .eq("group_id", groupId)
    .maybeSingle();
  if (sErr || !sailor) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest sailor not found.")}`);
  }
  if (sailor.linked_user_id) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Unlink the member first before removing this guest sailor.")}`);
  }

  const { count, error: cErr } = await supabase
    .from("boats")
    .select("*", { count: "exact", head: true })
    .eq("club_guest_sailor_id", id);
  if (cErr) clubAdminRedirect(groupId, `error=${encodeURIComponent(cErr.message)}`);
  if ((count ?? 0) > 0) {
    clubAdminRedirect(
      groupId,
      `error=${encodeURIComponent("Remove guest boats from this sailor before deleting the sailor.")}`,
    );
  }
  const { error } = await supabase.from("club_guest_sailors").delete().eq("id", id).eq("group_id", groupId);
  if (error) clubAdminRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  clubAdminRedirect(groupId, `guest_sailor_removed=1`);
}

export async function createGuestBoatAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const guestSailorId = String(formData.get("guest_sailor_id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const classNameHint = String(formData.get("class_name") ?? "").trim();
  const sail = String(formData.get("default_sail_number") ?? "").trim();
  const rya = String(formData.get("rya_class_key") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdmin(supabase, groupId, user);
  if (!guestSailorId || !UUID_RX.test(guestSailorId)) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Invalid guest sailor.")}`);
  }
  if (!label) clubAdminRedirect(groupId, `error=${encodeURIComponent("Boat label is required.")}`);
  if (!rya) clubAdminRedirect(groupId, `error=${encodeURIComponent("Boat class is required.")}`);
  if (!sail) clubAdminRedirect(groupId, `error=${encodeURIComponent("Sail number is required.")}`);
  const { data: gs, error: gErr } = await supabase
    .from("club_guest_sailors")
    .select("id")
    .eq("id", guestSailorId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (gErr || !gs) clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest sailor not found.")}`);

  const { data: bc, error: bcErr } = await supabase
    .from("boat_classes")
    .select("class_key, display_name, created_for_group_id")
    .eq("class_key", rya)
    .maybeSingle();
  if (bcErr || !bc) clubAdminRedirect(groupId, `error=${encodeURIComponent("Unknown boat class.")}`);
  const scopedTo = bc.created_for_group_id;
  if (scopedTo != null && scopedTo !== groupId) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("That boat class is not available for this club.")}`);
  }
  const resolvedClassName =
    String(bc.display_name ?? "").trim() ||
    (classNameHint.length > 0 ? classNameHint : null);

  const { error } = await supabase.from("boats").insert({
    club_guest_sailor_id: guestSailorId,
    label,
    class_name: resolvedClassName,
    default_sail_number: sail,
    rya_class_key: bc.class_key,
  });
  if (error) clubAdminRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  clubAdminRedirect(groupId, `guest_boat_added=1`);
}

export async function deleteGuestBoatAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const boatId = String(formData.get("guest_boat_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdmin(supabase, groupId, user);
  if (!boatId || !UUID_RX.test(boatId)) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Invalid guest boat.")}`);
  }
  const { data: b, error: bErr } = await supabase
    .from("boats")
    .select("id, club_guest_sailor_id")
    .eq("id", boatId)
    .maybeSingle();
  if (bErr || !b?.club_guest_sailor_id) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest boat not found.")}`);
  }
  const { data: sailor } = await supabase
    .from("club_guest_sailors")
    .select("id, group_id")
    .eq("id", b.club_guest_sailor_id)
    .maybeSingle();
  if (!sailor || sailor.group_id !== groupId) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest boat not found.")}`);
  }
  const { count } = await supabase
    .from("race_guest_entries")
    .select("*", { count: "exact", head: true })
    .eq("boat_id", boatId);
  if ((count ?? 0) > 0) {
    clubAdminRedirect(
      groupId,
      `error=${encodeURIComponent("Remove this guest boat from races before deleting it.")}`,
    );
  }
  const { error } = await supabase.from("boats").delete().eq("id", boatId);
  if (error) clubAdminRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  clubAdminRedirect(groupId, `guest_boat_removed=1`);
}

export async function linkGuestBoatToPermanentAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const guestBoatId = String(formData.get("guest_boat_id") ?? "").trim();
  const permanentBoatId = String(formData.get("permanent_boat_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdmin(supabase, groupId, user);
  if (!guestBoatId || !UUID_RX.test(guestBoatId) || !permanentBoatId || !UUID_RX.test(permanentBoatId)) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Valid guest boat UUID and permanent boat UUID are required.")}`);
  }
  const { data: gbRow, error: gbErr } = await supabase
    .from("boats")
    .select("id, club_guest_sailor_id")
    .eq("id", guestBoatId)
    .maybeSingle();
  if (gbErr || !gbRow?.club_guest_sailor_id) clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest boat not found.")}`);
  const { data: gsRow } = await supabase
    .from("club_guest_sailors")
    .select("group_id, linked_user_id")
    .eq("id", gbRow.club_guest_sailor_id)
    .maybeSingle();
  if (!gsRow || gsRow.group_id !== groupId) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest boat not in this club.")}`);
  }

  const { data: hull, error: hullErr } = await supabase
    .from("boats")
    .select("id, owner_user_id")
    .eq("id", permanentBoatId)
    .maybeSingle();
  if (hullErr || !hull) clubAdminRedirect(groupId, `error=${encodeURIComponent("Permanent boat not found.")}`);
  const { data: owns } = await supabase
    .from("group_memberships")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", hull.owner_user_id)
    .maybeSingle();
  if (!owns) {
    clubAdminRedirect(
      groupId,
      `error=${encodeURIComponent("That boat belongs to someone who is not a member of this club.")}`,
    );
  }

  if (gsRow.linked_user_id && gsRow.linked_user_id !== hull.owner_user_id) {
    clubAdminRedirect(
      groupId,
      `error=${encodeURIComponent(
        "Guest sailor is linked to a different member — unlink the sailor first or choose that member’s boat.",
      )}`,
    );
  }

  const { error: upBoatErr } = await supabase
    .from("boats")
    .update({ linked_boat_id: permanentBoatId })
    .eq("id", guestBoatId);
  if (upBoatErr) clubAdminRedirect(groupId, `error=${encodeURIComponent(upBoatErr.message)}`);

  if (!gsRow.linked_user_id) {
    await supabase
      .from("club_guest_sailors")
      .update({ linked_user_id: hull.owner_user_id })
      .eq("id", gbRow.club_guest_sailor_id)
      .eq("group_id", groupId);
  }

  clubAdminRedirect(groupId, `guest_linked=1`);
}

export async function linkGuestSailorToMemberAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const guestSailorId = String(formData.get("guest_sailor_id") ?? "").trim();
  const memberUserId = String(formData.get("member_user_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdmin(supabase, groupId, user);
  if (!guestSailorId || !UUID_RX.test(guestSailorId) || !memberUserId || !UUID_RX.test(memberUserId)) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Enter valid UUIDs.")}`);
  }
  const { data: gs } = await supabase
    .from("club_guest_sailors")
    .select("id")
    .eq("id", guestSailorId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (!gs) clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest sailor not found.")}`);
  const { data: mem } = await supabase
    .from("group_memberships")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", memberUserId)
    .maybeSingle();
  if (!mem) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("That user is not in this club — add membership first.")}`);
  }
  const { data: boats } = await supabase
    .from("boats")
    .select("id, linked_boat_id")
    .eq("club_guest_sailor_id", guestSailorId);
  for (const b of boats ?? []) {
    if (!b.linked_boat_id) continue;
    const { data: hb } = await supabase.from("boats").select("owner_user_id").eq("id", b.linked_boat_id).maybeSingle();
    if (hb && hb.owner_user_id !== memberUserId) {
      clubAdminRedirect(
        groupId,
        `error=${encodeURIComponent(
          "A guest boat is already linked to a fleet boat owned by someone else — unlink boats first.",
        )}`,
      );
    }
  }

  const { error } = await supabase
    .from("club_guest_sailors")
    .update({ linked_user_id: memberUserId })
    .eq("id", guestSailorId)
    .eq("group_id", groupId);
  if (error) clubAdminRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  clubAdminRedirect(groupId, `guest_linked=1`);
}

export async function unlinkGuestSailorMemberAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const guestSailorId = String(formData.get("guest_sailor_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdmin(supabase, groupId, user);
  if (!guestSailorId || !UUID_RX.test(guestSailorId)) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Invalid guest sailor.")}`);
  }
  const { data: boats } = await supabase
    .from("boats")
    .select("linked_boat_id")
    .eq("club_guest_sailor_id", guestSailorId);
  if ((boats ?? []).some((b) => b.linked_boat_id != null)) {
    clubAdminRedirect(
      groupId,
      `error=${encodeURIComponent("Unlink permanent boats from this sailor before unlinking the member.")}`,
    );
  }
  const { error } = await supabase
    .from("club_guest_sailors")
    .update({ linked_user_id: null })
    .eq("id", guestSailorId)
    .eq("group_id", groupId);
  if (error) clubAdminRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  clubAdminRedirect(groupId, `guest_unlinked=1`);
}

export async function unlinkGuestBoatPermanentAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const guestBoatId = String(formData.get("guest_boat_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdmin(supabase, groupId, user);
  if (!guestBoatId || !UUID_RX.test(guestBoatId)) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Invalid guest boat.")}`);
  }
  const { data: gb, error: rErr } = await supabase
    .from("boats")
    .select("id, club_guest_sailor_id")
    .eq("id", guestBoatId)
    .maybeSingle();
  if (rErr || !gb?.club_guest_sailor_id) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest boat not found.")}`);
  }
  const { data: gs } = await supabase
    .from("club_guest_sailors")
    .select("group_id")
    .eq("id", gb.club_guest_sailor_id)
    .maybeSingle();
  if (!gs || gs.group_id !== groupId) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Guest boat not found.")}`);
  }
  const { error } = await supabase.from("boats").update({ linked_boat_id: null }).eq("id", guestBoatId);
  if (error) clubAdminRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  clubAdminRedirect(groupId, `guest_unlinked=1`);
}
