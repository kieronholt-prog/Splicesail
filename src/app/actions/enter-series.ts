"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fleetActiveBoatValidToGt, isBoatActiveInFleet } from "@/lib/boat-validity";
import { redirect } from "next/navigation";

/** When the sailor flow runs from My Entries (or legacy club series-entries), return redirect target. */
function clubSeriesEntriesReturnPath(formData: FormData, query: Record<string, string>): string {
  const source = String(formData.get("enter_series_source") ?? "").trim();
  const gid = String(formData.get("club_return_group_id") ?? "").trim();
  const params = new URLSearchParams(query);
  const qs = params.toString();
  const base = qs ? `/groups?${qs}` : "/groups";
  if (source !== "club" || !gid) return base;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      gid,
    )
  ) {
    return base;
  }
  return `${base}#club-${gid}`;
}

function redirectEnterError(formData: FormData, message: string) {
  redirect(clubSeriesEntriesReturnPath(formData, { error: message }));
}

function redirectEnterSuccess(formData: FormData) {
  redirect(clubSeriesEntriesReturnPath(formData, { series_entered: "1" }));
}

function parseIds(formData: FormData, key: string): string[] {
  return [
    ...new Set(
      formData
        .getAll(key)
        .map((v) => String(v ?? "").trim())
        .filter((s) => s.length > 0),
    ),
  ];
}

async function assertMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const { data: m } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  return !!m;
}

export async function enterSeriesBulkAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const disclaimer = String(formData.get("disclaimer_accepted") ?? "").trim() === "1";
  const contactOk = String(formData.get("contact_confirmed") ?? "").trim() === "1";

  if (!disclaimer || !contactOk) {
    redirectEnterError(
      formData,
      "Confirm your contact details and accept the disclaimer before entering.",
    );
  }

  const groupsAll = String(formData.get("groups_all") ?? "").trim() === "1";
  const seriesAll = String(formData.get("series_all") ?? "").trim() === "1";
  const boatsAll = String(formData.get("boats_all") ?? "").trim() === "1";

  const groupIdsRaw = parseIds(formData, "group_id");
  const seriesIdsRaw = parseIds(formData, "series_id");
  const boatIdsRaw = parseIds(formData, "boat_id");

  let groupIds = groupIdsRaw;
  if (groupsAll) {
    const { data: mems } = await supabase.from("group_memberships").select("group_id").eq("user_id", user.id);
    groupIds = [...new Set((mems ?? []).map((m) => m.group_id).filter(Boolean))];
  } else if (groupIds.length === 0) {
    redirectEnterError(formData, "Select at least one club or choose all your clubs.");
  }

  if (groupIds.length === 0) {
    redirectEnterError(formData, "Select at least one club (or choose all your clubs).");
  }

  let targetSeriesIds = seriesIdsRaw;
  if (seriesAll) {
    const { data: srows } = await supabase.from("series").select("id, group_id").in("group_id", groupIds);

    const allowed = new Set(groupIds);
    targetSeriesIds = [...new Set((srows ?? []).filter((s) => allowed.has(s.group_id)).map((s) => s.id))];
  } else if (targetSeriesIds.length === 0) {
    redirectEnterError(
      formData,
      "Select at least one series, or choose all series in the selected clubs.",
    );
  }

  if (targetSeriesIds.length === 0) {
    redirectEnterError(formData, "No series found for the clubs you selected.");
  }

  let boatIds = boatIdsRaw;
  if (boatsAll) {
    const { data: bows } = await supabase
      .from("boats")
      .select("id")
      .eq("owner_user_id", user.id)
      .gt("valid_to", fleetActiveBoatValidToGt());
    boatIds = [...new Set((bows ?? []).map((b) => b.id))];
  } else if (boatIds.length === 0) {
    redirectEnterError(formData, "Select at least one boat, or choose all your boats.");
  }

  const { data: boatsCheck } = await supabase
    .from("boats")
    .select("id, owner_user_id, valid_to")
    .in("id", boatIds);

  if (
    !boatsCheck?.length ||
    boatsCheck.length !== boatIds.length ||
    boatsCheck.some(
      (b) =>
        b.owner_user_id !== user.id ||
        !isBoatActiveInFleet(b.valid_to as string | null | undefined),
    )
  ) {
    redirectEnterError(
      formData,
      "Every selected boat must be an active hull in My boats (retired or removed boats cannot be entered).",
    );
  }

  for (const gid of groupIds) {
    if (!(await assertMember(supabase, gid, user.id))) {
      redirectEnterError(formData, "You are not a member of one of the clubs you selected.");
    }
  }

  const { data: seriesRows, error: seriesErr } = await supabase
    .from("series")
    .select("id, group_id")
    .in("id", targetSeriesIds);

  if (seriesErr || !seriesRows?.length) {
    redirectEnterError(formData, "Could not resolve those series.");
  }

  const validSeriesRows = seriesRows!.filter((r) => targetSeriesIds.includes(r.id));

  if (validSeriesRows.length === 0) {
    redirectEnterError(formData, "Could not resolve the selected series — refresh and try again.");
  }

  const groupSet = new Set(groupIds);
  for (const s of validSeriesRows) {
    if (!groupSet.has(s.group_id)) {
      redirectEnterError(
        formData,
        "Each series must belong to one of the clubs you selected for this entry.",
      );
    }
  }

  for (const seriesId of validSeriesRows.map((r) => r.id)) {
    const { error: insReg } = await supabase.from("series_registrations").upsert(
      { series_id: seriesId, user_id: user.id },
      { onConflict: "series_id,user_id" },
    );

    if (insReg) {
      redirectEnterError(formData, insReg.message);
    }

    const { data: prevBoatRows } = await supabase
      .from("series_registration_boats")
      .select("boat_id")
      .eq("series_id", seriesId)
      .eq("user_id", user.id);

    const prevBoatIds = new Set(
      (prevBoatRows ?? []).map((r) => String(r.boat_id ?? "").trim()).filter((s) => s.length > 0),
    );

    const mergedBoatIds = [...new Set([...prevBoatIds, ...boatIds])];

    const { data: mergedBoatMeta } = await supabase
      .from("boats")
      .select("id, valid_to")
      .in("id", mergedBoatIds)
      .eq("owner_user_id", user.id);

    if (
      !mergedBoatMeta ||
      mergedBoatMeta.length !== mergedBoatIds.length ||
      mergedBoatMeta.some((b) => !isBoatActiveInFleet(b.valid_to as string | null | undefined))
    ) {
      redirectEnterError(formData, "Each boat must be an active hull in My boats.");
    }

    await supabase.from("series_registration_boats").delete().eq("series_id", seriesId).eq("user_id", user.id);

    for (const bid of mergedBoatIds) {
      const { error: bErr } = await supabase.from("series_registration_boats").insert({
        series_id: seriesId,
        user_id: user.id,
        boat_id: bid,
      });

      if (bErr) {
        redirectEnterError(formData, bErr.message);
      }
    }
  }

  redirectEnterSuccess(formData);
}
