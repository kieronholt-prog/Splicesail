"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

function groupFleetsListUrl(groupId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/fleets${q}`;
}

function fleetMaintainUrl(groupId: string, fleetId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/fleets/${fleetId}${q}`;
}

function parseOptionalClassFlag(
  formData: FormData,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const s = String(formData.get("class_flag") ?? "").trim();
  if (!s.length) return { ok: true, value: null };
  if (s.length !== 1 || !/^[A-Za-z0-9]$/.test(s)) {
    return { ok: false, message: "Class flag must be a single letter or digit (or leave empty)." };
  }
  return { ok: true, value: s };
}

function parseClassKeysFromForm(formData: FormData): string[] {
  const raw = formData.getAll("class_keys").map((v) => String(v).trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

async function requireClubAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  userId: string,
) {
  const { data: m } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  return m?.role === "club_admin";
}

async function assertClassKeysValidForGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  keys: string[],
  groupId: string,
): Promise<string | null> {
  if (keys.length === 0) return null;
  const { data: rows, error } = await supabase
    .from("boat_classes")
    .select("class_key")
    .in("class_key", keys)
    .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`);
  if (error) return error.message;
  const ok = new Set((rows ?? []).map((r) => r.class_key));
  const missing = keys.filter((k) => !ok.has(k));
  return missing.length ? `Unknown boat class(es): ${missing.join(", ")}` : null;
}

async function replaceFleetClassRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fleetId: string,
  keys: string[],
) {
  const { error: delErr } = await supabase.from("group_fleet_classes").delete().eq("fleet_id", fleetId);
  if (delErr) throw new Error(delErr.message);
  if (!keys.length) return;
  const { error } = await supabase.from("group_fleet_classes").insert(
    keys.map((class_key) => ({
      fleet_id: fleetId,
      class_key,
    })),
  );
  if (error) throw new Error(error.message);
}

export async function createGroupFleetAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const classKeys = parseClassKeysFromForm(formData);

  const parsedFlag = parseOptionalClassFlag(formData);
  if (!parsedFlag.ok) {
    redirect(`/groups/${groupId}/fleets/new?error=` + encodeURIComponent(parsedFlag.message));
  }

  if (!name) {
    redirect(
      (groupId ? `/groups/${groupId}/fleets/new` : "/groups") + "?error=" + encodeURIComponent("Name is required."),
    );
  }

  if (!groupId) {
    redirect("/groups?error=" + encodeURIComponent("Missing club."));
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await requireClubAdmin(supabase, groupId, user.id))) {
    redirect(groupFleetsListUrl(groupId, `error=${encodeURIComponent("Only club admins can create fleets.")}`));
  }

  const keyErr = await assertClassKeysValidForGroup(supabase, classKeys, groupId);
  if (keyErr) {
    redirect(`/groups/${groupId}/fleets/new?error=` + encodeURIComponent(keyErr));
  }

  try {
    const { data: row, error } = await supabase
      .from("group_fleets")
      .insert({
        group_id: groupId,
        name,
        description: description.length ? description : null,
        class_flag: parsedFlag.value,
      })
      .select("id")
      .maybeSingle();

    if (error || !row) {
      redirect(
        `/groups/${groupId}/fleets/new?error=` + encodeURIComponent(error?.message ?? "Could not save fleet."),
      );
    }
    await replaceFleetClassRows(supabase, row.id, classKeys);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not save classes.";
    redirect(`/groups/${groupId}/fleets/new?error=` + encodeURIComponent(msg));
  }

  redirect(groupFleetsListUrl(groupId, "fleet_saved=1"));
}

export async function updateGroupFleetAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const fleetId = String(formData.get("fleet_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const classKeys = parseClassKeysFromForm(formData);

  const parsedFlag = parseOptionalClassFlag(formData);
  if (!parsedFlag.ok) {
    redirect(fleetMaintainUrl(groupId, fleetId, `error=${encodeURIComponent(parsedFlag.message)}`));
  }

  if (!groupId || !fleetId || !name) {
    redirect(
      groupId && fleetId
        ? fleetMaintainUrl(groupId, fleetId, `error=${encodeURIComponent("Missing fleet fields.")}`)
        : groupId
          ? groupFleetsListUrl(groupId, `error=${encodeURIComponent("Missing fleet fields.")}`)
          : "/groups?error=" + encodeURIComponent("Missing fleet fields."),
    );
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await requireClubAdmin(supabase, groupId, user.id))) {
    redirect(groupFleetsListUrl(groupId, `error=${encodeURIComponent("Only club admins can update fleets.")}`));
  }

  const keyErr = await assertClassKeysValidForGroup(supabase, classKeys, groupId);
  if (keyErr) {
    redirect(fleetMaintainUrl(groupId, fleetId, `error=${encodeURIComponent(keyErr)}`));
  }

  const { error } = await supabase
    .from("group_fleets")
    .update({
      name,
      description: description.length ? description : null,
      class_flag: parsedFlag.value,
    })
    .eq("id", fleetId)
    .eq("group_id", groupId);

  if (error) {
    redirect(fleetMaintainUrl(groupId, fleetId, `error=${encodeURIComponent(error.message)}`));
  }

  try {
    await replaceFleetClassRows(supabase, fleetId, classKeys);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not update classes.";
    redirect(fleetMaintainUrl(groupId, fleetId, `error=${encodeURIComponent(msg)}`));
  }

  redirect(fleetMaintainUrl(groupId, fleetId, "saved=1"));
}

export async function deleteGroupFleetAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const fleetId = String(formData.get("fleet_id") ?? "").trim();

  if (!groupId || !fleetId) {
    redirect("/groups?error=" + encodeURIComponent("Missing fleet context."));
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await requireClubAdmin(supabase, groupId, user.id))) {
    redirect(groupFleetsListUrl(groupId, `error=${encodeURIComponent("Only club admins can delete fleets.")}`));
  }

  const { error } = await supabase.from("group_fleets").delete().eq("id", fleetId).eq("group_id", groupId);

  if (error) {
    redirect(groupFleetsListUrl(groupId, `error=${encodeURIComponent(error.message)}`));
  }

  redirect(groupFleetsListUrl(groupId, "fleet_deleted=1"));
}
