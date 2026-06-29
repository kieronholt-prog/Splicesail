import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fleetMatchByRaceBoat,
  fleetStartOffsetMinutesByRaceBoat,
} from "@/lib/race-boat-fleet-start-offset";
import { fleetStartUtcMs, homeFeaturedRaceVisibleUntilMs } from "@/lib/tally-window";
import { clubTodayYmd, clubWallYmdFromUtcMs, resolveClubIanaTimeZone } from "@/lib/club-time";
import { formatClubHmFromIso } from "@/lib/club-display-format";
import { fleetStartSignalUtcMs } from "@/lib/resolve-fleet-start-signal";
import { isPlausibleRaceInstantIso } from "@/lib/plausible-race-instant";

const HOME_RACE_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export type MobileTallyBoatRow = {
  boatId: string;
  label: string | null;
  sailNumber: string;
  classDisplay: string;
  raceEntryId: string | null;
  tallyAfloatAt: string | null;
  tallyAshoreAt: string | null;
  outcome: string | null;
  fleetOffsetMinutes: number;
  fleetStartDisplay: string;
  fleetStartUtc: string;
  fleetStartSource: "start_signal_at" | "scheduled_offset";
  canTallyAfloat: boolean;
  canTallyAshore: boolean;
  canUndoTallyAfloat: boolean;
};

export type MobileNextRacePayload = {
  groupId: string;
  seriesId: string;
  raceId: string;
  raceName: string;
  seriesName: string;
  clubName: string;
  scheduledAt: string;
  clubTimeZone: string;
  boats: MobileTallyBoatRow[];
};

function sailDisplay(sailOverride: string | null | undefined, defaultSail: string | null | undefined): string {
  const s = (sailOverride?.trim() || defaultSail?.trim() || "").trim();
  return s || "—";
}

export async function loadMobileNextRace(
  supabase: SupabaseClient,
  userId: string,
  nowMs: number = Date.now(),
): Promise<MobileNextRacePayload | null> {
  const { data: regRows } = await supabase
    .from("series_registrations")
    .select("series_id")
    .eq("user_id", userId);

  const registeredSeriesIds = [...new Set((regRows ?? []).map((r) => r.series_id))];
  if (!registeredSeriesIds.length) return null;

  const [{ data: seriesRows }, { data: signupBoatRows }] = await Promise.all([
    supabase
      .from("series")
      .select("id, name, group_id, groups ( id, name, iana_timezone )")
      .in("id", registeredSeriesIds),
    supabase
      .from("series_registration_boats")
      .select("series_id, boat_id")
      .in("series_id", registeredSeriesIds)
      .eq("user_id", userId),
  ]);

  const signupBoatIdsBySeriesId = new Map<string, Set<string>>();
  for (const row of signupBoatRows ?? []) {
    if (!row.series_id || !row.boat_id) continue;
    let set = signupBoatIdsBySeriesId.get(row.series_id);
    if (!set) {
      set = new Set();
      signupBoatIdsBySeriesId.set(row.series_id, set);
    }
    set.add(row.boat_id);
  }

  const seriesIds = (seriesRows ?? []).map((s) => s.id);
  if (!seriesIds.length) return null;

  const lookbackIso = new Date(nowMs - HOME_RACE_LOOKBACK_MS).toISOString();
  const { data: candRows } = await supabase
    .from("races")
    .select(
      `
      id,
      name,
      scheduled_at,
      series_id,
      series (
        name,
        group_id,
        groups ( name, iana_timezone )
      )
    `,
    )
    .in("series_id", seriesIds)
    .gte("scheduled_at", lookbackIso)
    .order("scheduled_at", { ascending: true })
    .limit(400);

  if (!candRows?.length) return null;

  const fleetOffsetRequests: {
    raceId: string;
    boatId: string;
    groupId: string;
    seriesId: string;
  }[] = [];

  for (const row of candRows) {
    const sraw = row.series;
    const se = Array.isArray(sraw) ? sraw[0] : sraw;
    const gid =
      se && typeof se === "object" && se !== null && "group_id" in se
        ? (se as { group_id: string }).group_id
        : "";
    if (!gid) continue;
    for (const bid of signupBoatIdsBySeriesId.get(row.series_id) ?? []) {
      fleetOffsetRequests.push({
        raceId: row.id,
        boatId: bid,
        groupId: gid,
        seriesId: row.series_id,
      });
    }
  }

  const offsetByRaceBoat =
    fleetOffsetRequests.length > 0
      ? await fleetStartOffsetMinutesByRaceBoat(supabase, fleetOffsetRequests)
      : new Map<string, number>();

  type Eligible = { scheduledMs: number; row: (typeof candRows)[number] };
  const eligible: Eligible[] = [];
  const todayYmdByClubTz = new Map<string, string>();

  for (const row of candRows) {
    const sraw = row.series;
    const se = Array.isArray(sraw) ? sraw[0] : sraw;
    if (!se || typeof se !== "object") continue;

    const gRaw = (se as { groups?: unknown }).groups;
    const gOne = Array.isArray(gRaw) ? gRaw[0] : gRaw;
    const clubTz =
      gOne && typeof gOne === "object" && gOne !== null && "iana_timezone" in gOne
        ? resolveClubIanaTimeZone((gOne as { iana_timezone?: string | null }).iana_timezone)
        : resolveClubIanaTimeZone(null);

    let todayYmd = todayYmdByClubTz.get(clubTz);
    if (todayYmd == null) {
      todayYmd = clubTodayYmd(clubTz);
      todayYmdByClubTz.set(clubTz, todayYmd);
    }
    const raceScheduleYmd = clubWallYmdFromUtcMs(new Date(row.scheduled_at).getTime(), clubTz);
    if (raceScheduleYmd !== todayYmd) continue;

    const bidList = [...(signupBoatIdsBySeriesId.get(row.series_id) ?? [])];
    let visibleUntilMs = 0;
    if (!bidList.length) {
      visibleUntilMs = homeFeaturedRaceVisibleUntilMs(
        fleetStartUtcMs(row.scheduled_at, 0),
        null,
        null,
      );
    } else {
      for (const bid of bidList) {
        const off = offsetByRaceBoat.get(`${row.id}\u0000${bid}`) ?? 0;
        visibleUntilMs = Math.max(
          visibleUntilMs,
          homeFeaturedRaceVisibleUntilMs(fleetStartUtcMs(row.scheduled_at, off), null, null),
        );
      }
    }
    if (nowMs < visibleUntilMs) {
      eligible.push({ scheduledMs: new Date(row.scheduled_at).getTime(), row });
    }
  }

  if (!eligible.length) return null;

  const pastEligible = eligible.filter((e) => e.scheduledMs <= nowMs).sort((a, b) => b.scheduledMs - a.scheduledMs);
  const futEligible = eligible.filter((e) => e.scheduledMs > nowMs).sort((a, b) => a.scheduledMs - b.scheduledMs);
  const pick = [...pastEligible, ...futEligible][0];
  if (!pick) return null;

  const race = pick.row;
  const seriesNest = Array.isArray(race.series) ? race.series[0] : race.series;
  if (!seriesNest || typeof seriesNest !== "object") return null;

  const groupNest = Array.isArray((seriesNest as { groups?: unknown }).groups)
    ? (seriesNest as { groups: unknown[] }).groups[0]
    : (seriesNest as { groups?: unknown }).groups;
  const groupObj =
    groupNest && typeof groupNest === "object" && groupNest !== null
      ? (groupNest as { name?: string; iana_timezone?: string | null })
      : null;

  const groupId = (seriesNest as { group_id: string }).group_id;
  const clubTz = resolveClubIanaTimeZone(groupObj?.iana_timezone);
  const boatIds = [...(signupBoatIdsBySeriesId.get(race.series_id) ?? [])];

  const [{ data: boats }, { data: entries }, fleetMatches, { data: fleetRows }] = await Promise.all([
    supabase
      .from("boats")
      .select("id, label, default_sail_number, rya_class_key, boat_classes:rya_class_key ( display_name )")
      .in("id", boatIds),
    supabase
      .from("race_entries")
      .select("id, boat_id, tally_afloat_at, tally_ashore_at, outcome, sail_number_override")
      .eq("race_id", race.id)
      .eq("user_id", userId),
    fleetMatchByRaceBoat(
      supabase,
      boatIds.map((boatId) => ({
        raceId: race.id,
        boatId,
        groupId,
        seriesId: race.series_id,
      })),
    ),
    supabase
      .from("race_fleets")
      .select("id, start_signal_at, start_offset_minutes")
      .eq("race_id", race.id),
  ]);

  const fleetById = new Map((fleetRows ?? []).map((f) => [f.id as string, f] as const));

  const entryByBoat = new Map(
    (entries ?? []).map((e) => [e.boat_id as string, e] as const),
  );

  const boatRows: MobileTallyBoatRow[] = (boats ?? []).map((b) => {
    const entry = entryByBoat.get(b.id);
    const match = fleetMatches.get(`${race.id}\u0000${b.id}`);
    const fleetOff = match?.offsetMinutes ?? 0;
    const fleetRow = match?.fleetId ? fleetById.get(match.fleetId) : null;
    const fleetStartMs =
      fleetStartSignalUtcMs(race.scheduled_at, fleetRow ?? { start_offset_minutes: fleetOff }) ??
      fleetStartUtcMs(race.scheduled_at, fleetOff);
    const fleetStartUtc = new Date(fleetStartMs).toISOString();
    const fleetStartSource: "start_signal_at" | "scheduled_offset" =
      fleetRow?.start_signal_at && isPlausibleRaceInstantIso(fleetRow.start_signal_at)
        ? "start_signal_at"
        : "scheduled_offset";
    const fleetStartDisplay = formatClubHmFromIso(fleetStartUtc, clubTz);

    const classNest = b.boat_classes;
    const classRow = Array.isArray(classNest) ? classNest[0] : classNest;
    const classDisplay =
      classRow && typeof classRow === "object" && "display_name" in classRow
        ? String((classRow as { display_name?: string }).display_name ?? "—")
        : (b.rya_class_key ?? "—");

    const tallyAfloatAt = (entry?.tally_afloat_at as string | null) ?? null;
    const tallyAshoreAt = (entry?.tally_ashore_at as string | null) ?? null;

    return {
      boatId: b.id,
      label: b.label,
      sailNumber: sailDisplay(entry?.sail_number_override as string | null, b.default_sail_number),
      classDisplay,
      raceEntryId: (entry?.id as string | null) ?? null,
      tallyAfloatAt,
      tallyAshoreAt,
      outcome: (entry?.outcome as string | null) ?? null,
      fleetOffsetMinutes: fleetOff,
      fleetStartDisplay,
      fleetStartUtc,
      fleetStartSource,
      canTallyAfloat: nowMs < fleetStartMs && !tallyAfloatAt,
      canTallyAshore: nowMs >= fleetStartMs && !tallyAshoreAt,
      canUndoTallyAfloat: nowMs < fleetStartMs && !!tallyAfloatAt && !tallyAshoreAt,
    };
  });

  return {
    groupId,
    seriesId: race.series_id,
    raceId: race.id,
    raceName: race.name?.trim() || "Race",
    seriesName: String((seriesNest as { name?: string | null }).name ?? "").trim() || "Series",
    clubName: groupObj?.name?.trim() || "Club",
    scheduledAt: race.scheduled_at,
    clubTimeZone: clubTz,
    boats: boatRows,
  };
}
