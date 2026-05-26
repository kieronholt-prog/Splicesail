"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clubAdminRedirect(groupId: string, qs: string): never {
  redirect(`/groups/${groupId}/club-admin?${qs}`);
}

export async function promoteToClubAdminAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const memberUserId = String(formData.get("member_user_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  if (!groupId || !memberUserId) {
    redirect("/groups?error=" + encodeURIComponent("Missing membership."));
  }
  if (memberUserId === user.id) {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("You are already signed in — use club admin tooling for yourself."),
    );
  }
  const { data: adminRow } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminRow?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` + encodeURIComponent("Only club admins can promote members."),
    );
  }

  const { data: target } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", memberUserId)
    .maybeSingle();
  if (!target) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Member not in this group."));
  }
  if (target.role === "club_admin") {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Already a club admin."));
  }

  const { error } = await supabase
    .from("group_memberships")
    .update({ role: "club_admin" })
    .eq("group_id", groupId)
    .eq("user_id", memberUserId);

  if (error) redirect(`/groups/${groupId}?error=` + encodeURIComponent(error.message));
  redirect(`/groups/${groupId}?promoted=1`);
}

export async function addGroupMemberByUserIdAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const rawId = String(formData.get("member_user_id") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "sailor").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  if (!groupId) {
    redirect("/groups?error=" + encodeURIComponent("Missing club."));
  }
  if (!rawId) {
    clubAdminRedirect(groupId, "error=" + encodeURIComponent("Enter the member’s sign-in user ID (UUID)."));
  }
  if (!UUID_RX.test(rawId)) {
    clubAdminRedirect(groupId, "error=" + encodeURIComponent("User ID must be a valid UUID."));
  }
  const { data: adminRow } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminRow?.role !== "club_admin") {
    clubAdminRedirect(groupId, "error=" + encodeURIComponent("Only club admins can add members."));
  }
  const role = roleRaw === "race_officer" ? "race_officer" : "sailor";
  const { data: existing } = await supabase
    .from("group_memberships")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", rawId)
    .maybeSingle();
  if (existing) {
    clubAdminRedirect(groupId, "error=" + encodeURIComponent("That user is already a member of this club."));
  }
  const { error } = await supabase.from("group_memberships").insert({
    group_id: groupId,
    user_id: rawId,
    role,
  });
  if (error) {
    clubAdminRedirect(groupId, "error=" + encodeURIComponent(error.message));
  }
  clubAdminRedirect(groupId, "member_added=1");
}

export async function removeGroupMemberAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const memberUserId = String(formData.get("member_user_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  if (!groupId || !memberUserId) {
    redirect("/groups?error=" + encodeURIComponent("Missing membership."));
  }
  const { data: adminRow } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminRow?.role !== "club_admin") {
    clubAdminRedirect(groupId, "error=" + encodeURIComponent("Only club admins can remove members."));
  }
  const { data: target } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", memberUserId)
    .maybeSingle();
  if (!target) {
    clubAdminRedirect(groupId, "error=" + encodeURIComponent("Member not in this group."));
  }
  if (target.role === "club_admin") {
    const { data: admins } = await supabase
      .from("group_memberships")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("role", "club_admin");
    if ((admins?.length ?? 0) <= 1) {
      clubAdminRedirect(groupId, "error=" + encodeURIComponent("Cannot remove the last club administrator."));
    }
  }
  const { error } = await supabase
    .from("group_memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", memberUserId);
  if (error) {
    clubAdminRedirect(groupId, "error=" + encodeURIComponent(error.message));
  }
  clubAdminRedirect(groupId, "member_removed=1");
}
