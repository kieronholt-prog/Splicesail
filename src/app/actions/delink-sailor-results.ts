"use server";

import { delinkSailorResultsPath, searchDelinkableSailorResults } from "@/lib/delink-sailor-results";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function delinkRedirect(groupId: string, qs: string): never {
  redirect(`${delinkSailorResultsPath(groupId)}?${qs}`);
}

async function requireClubAdmin(supabase: SupabaseClient, groupId: string, userId: string) {
  const { data: row } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (row?.role !== "club_admin") {
    delinkRedirect(groupId, `error=${encodeURIComponent("Only club admins can de-link sailor results.")}`);
  }
}

export async function searchDelinkableSailorResultsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const sailNumber = String(formData.get("sail_number") ?? "").trim();
  const classKey = String(formData.get("class_key") ?? "").trim();

  if (!groupId || !UUID_RE.test(groupId)) {
    redirect("/groups?error=" + encodeURIComponent("Missing or invalid club."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireClubAdmin(supabase, groupId, user.id);

  const rows = await searchDelinkableSailorResults(supabase, groupId, sailNumber, classKey);
  return { rows, sailNumber, classKey };
}

export async function delinkSailorResultsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const sailNumber = String(formData.get("sail_number") ?? "").trim();
  const classKey = String(formData.get("class_key") ?? "").trim();
  const raceEntryIds = formData
    .getAll("race_entry_id")
    .map((v) => String(v).trim())
    .filter((id) => UUID_RE.test(id));

  if (!groupId || !UUID_RE.test(groupId)) {
    redirect("/groups?error=" + encodeURIComponent("Missing or invalid club."));
  }

  if (raceEntryIds.length === 0) {
    delinkRedirect(
      groupId,
      `error=${encodeURIComponent("Select at least one result to de-link.")}&sail=${encodeURIComponent(sailNumber)}&class=${encodeURIComponent(classKey)}`,
    );
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireClubAdmin(supabase, groupId, user.id);

  const allowed = await searchDelinkableSailorResults(supabase, groupId, sailNumber, classKey);
  const allowedIds = new Set(allowed.map((r) => r.raceEntryId));
  const toDelink = raceEntryIds.filter((id) => allowedIds.has(id));

  if (toDelink.length === 0) {
    delinkRedirect(
      groupId,
      `error=${encodeURIComponent("Those results are no longer available to de-link.")}&sail=${encodeURIComponent(sailNumber)}&class=${encodeURIComponent(classKey)}`,
    );
  }

  let delinked = 0;
  for (const raceEntryId of toDelink) {
    const { error } = await supabase.rpc("delink_race_entry_to_ro_added", {
      p_race_entry_id: raceEntryId,
    });
    if (error) {
      delinkRedirect(
        groupId,
        `error=${encodeURIComponent(error.message)}&sail=${encodeURIComponent(sailNumber)}&class=${encodeURIComponent(classKey)}`,
      );
    }
    delinked += 1;
  }

  revalidatePath(`/groups/${groupId}/club-admin`);
  revalidatePath(delinkSailorResultsPath(groupId));

  delinkRedirect(
    groupId,
    `delinked=${delinked}&sail=${encodeURIComponent(sailNumber)}&class=${encodeURIComponent(classKey)}`,
  );
}
