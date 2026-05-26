"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

function scoringUrl(groupId: string, seriesId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}/scoring${q}`;
}

async function requireClubAdmin(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
) {
  const { data: m } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (m?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Only club admins can edit scoring settings."),
    );
  }
}

type Basis = "series_entrants" | "race_starters" | "race_finishers" | "fixed";

const PENALTY_OUTCOMES = ["dns", "dnf", "dnc", "retired", "dsq", "ocs"] as const;

function parseBasis(raw: string): Basis | null {
  if (
    raw === "series_entrants" ||
    raw === "race_starters" ||
    raw === "race_finishers" ||
    raw === "fixed"
  ) {
    return raw;
  }
  return null;
}

export async function saveSeriesScoringSettingsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const handicap_system = String(formData.get("handicap_system") ?? "").trim();

  if (!groupId || !seriesId) {
    redirect("/groups?error=" + encodeURIComponent("Missing series."));
  }

  if (!["none", "portsmouth"].includes(handicap_system)) {
    redirect(
      scoringUrl(groupId, seriesId, `error=${encodeURIComponent("Invalid handicap system.")}`),
    );
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  await requireClubAdmin(supabase, groupId, user.id);

  const { data: series } = await supabase
    .from("series")
    .select("id, group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) {
    redirect("/groups?error=" + encodeURIComponent("Series not found."));
  }

  const { error: cfgErr } = await supabase.from("series_scoring_config").upsert(
    { series_id: seriesId, handicap_system },
    { onConflict: "series_id" },
  );

  if (cfgErr) {
    redirect(
      scoringUrl(groupId, seriesId, `error=${encodeURIComponent(cfgErr.message)}`),
    );
  }

  for (const o of PENALTY_OUTCOMES) {
    const basis = parseBasis(String(formData.get(`${o}_basis`) ?? ""));
    const plusRaw = String(formData.get(`${o}_plus`) ?? "0").trim();
    const fixedRaw = String(formData.get(`${o}_fixed`) ?? "").trim();

    if (!basis) {
      redirect(
        scoringUrl(groupId, seriesId, `error=${encodeURIComponent(`Invalid basis for ${o.toUpperCase()}.`)}`),
      );
    }

    const plus = Number.isFinite(Number(plusRaw)) ? Math.trunc(Number(plusRaw)) : 0;

    let fixed_points: number | null = null;
    if (basis === "fixed") {
      if (!fixedRaw.length) {
        redirect(
          scoringUrl(
            groupId,
            seriesId,
            `error=${encodeURIComponent(`Fixed points required for ${o.toUpperCase()}.`)}`,
          ),
        );
      }
      fixed_points = Number(fixedRaw);
      if (!Number.isFinite(fixed_points)) {
        redirect(
          scoringUrl(groupId, seriesId, `error=${encodeURIComponent("Fixed points must be numeric.")}`),
        );
      }
    }

    const { error: penErr } = await supabase.from("series_penalty_rules").upsert(
      {
        series_id: seriesId,
        outcome_code: o,
        basis,
        plus,
        fixed_points: basis === "fixed" ? fixed_points : null,
      },
      { onConflict: "series_id,outcome_code" },
    );

    if (penErr) {
      redirect(
        scoringUrl(groupId, seriesId, `error=${encodeURIComponent(penErr.message)}`),
      );
    }
  }

  const { error: delErr } = await supabase
    .from("series_discard_rules")
    .delete()
    .eq("series_id", seriesId);

  if (delErr) {
    redirect(
      scoringUrl(groupId, seriesId, `error=${encodeURIComponent(delErr.message)}`),
    );
  }

  const bands: {
    races_from: number;
    races_to: number | null;
    discards: number;
  }[] = [];

  for (let i = 0; i < 16; i++) {
    const fromRaw = String(formData.get(`band_${i}_from`) ?? "").trim();
    if (!fromRaw.length) continue;
    const toRaw = String(formData.get(`band_${i}_to`) ?? "").trim();
    const discRaw = String(formData.get(`band_${i}_discards`) ?? "").trim();

    const races_from = Math.max(1, Math.trunc(Number(fromRaw)));
    const discards =
      discRaw.length === 0 ? 0 : Math.max(0, Math.trunc(Number(discRaw)));

    if (!Number.isFinite(races_from) || !Number.isFinite(discards)) {
      redirect(
        scoringUrl(groupId, seriesId, `error=${encodeURIComponent(`Discard band ${i + 1} has invalid numbers.`)}`),
      );
    }

    let races_to: number | null = null;
    if (toRaw.length) {
      races_to = Math.max(races_from, Math.trunc(Number(toRaw)));
      if (!Number.isFinite(races_to)) {
        redirect(
          scoringUrl(groupId, seriesId, `error=${encodeURIComponent(`Discard band ${i + 1}: invalid upper race count.`)}`),
        );
      }
    }

    bands.push({ races_from, races_to, discards });
  }

  bands.sort((a, b) => a.races_from - b.races_from);

  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1];
    const cur = bands[i];
    if (prev.races_to != null && cur.races_from <= prev.races_to) {
      redirect(
        scoringUrl(
          groupId,
          seriesId,
          `error=${encodeURIComponent("Discard bands overlap — tighten ranges.")}`,
        ),
      );
    }
  }

  if (bands.length === 0) {
    bands.push({ races_from: 1, races_to: null, discards: 0 });
  }

  const { error: insErr } = await supabase.from("series_discard_rules").insert(
    bands.map((b) => ({
      series_id: seriesId,
      races_from: b.races_from,
      races_to: b.races_to,
      discards: b.discards,
    })),
  );

  if (insErr) {
    redirect(
      scoringUrl(groupId, seriesId, `error=${encodeURIComponent(insErr.message)}`),
    );
  }

  redirect(scoringUrl(groupId, seriesId, "saved=1"));
}
