"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

export async function requestJoinClubAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  if (!groupId) {
    redirect("/groups?error=" + encodeURIComponent("Missing club."));
  }

  const { data: member } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (member) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("You are already a member of this club."));
  }

  const { error } = await supabase.from("group_join_requests").insert({
    group_id: groupId,
    user_id: user.id,
    status: "pending",
  });

  if (error) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent(error.message));
  }
  redirect(`/groups/${groupId}?join_requested=1`);
}

export async function approveJoinRequestAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const requestId = String(formData.get("request_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  if (!groupId || !requestId) {
    redirect(`/groups/${groupId || ""}?error=` + encodeURIComponent("Missing request."));
  }

  const { data: adminRow } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminRow?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` + encodeURIComponent("Only club admins can approve join requests."),
    );
  }

  const { data: reqRow, error: reqErr } = await supabase
    .from("group_join_requests")
    .select("id, user_id, status")
    .eq("id", requestId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (reqErr || !reqRow) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Request not found."));
  }
  if (reqRow.status !== "pending") {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("This request is no longer pending."));
  }

  const { error: insertErr } = await supabase.from("group_memberships").insert({
    group_id: groupId,
    user_id: reqRow.user_id,
    role: "sailor",
  });

  if (insertErr) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent(insertErr.message));
  }

  const { error: updateErr } = await supabase
    .from("group_join_requests")
    .update({
      status: "approved",
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", requestId)
    .eq("group_id", groupId)
    .eq("status", "pending");

  if (updateErr) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent(updateErr.message));
  }

  redirect(`/groups/${groupId}?join_approved=1`);
}

export async function declineJoinRequestAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const requestId = String(formData.get("request_id") ?? "").trim();
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  if (!groupId || !requestId) {
    redirect(`/groups/${groupId || ""}?error=` + encodeURIComponent("Missing request."));
  }

  const { data: adminRow } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminRow?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` + encodeURIComponent("Only club admins can decline join requests."),
    );
  }

  const { error } = await supabase
    .from("group_join_requests")
    .update({
      status: "declined",
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", requestId)
    .eq("group_id", groupId)
    .eq("status", "pending");

  if (error) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent(error.message));
  }

  redirect(`/groups/${groupId}?join_declined=1`);
}
