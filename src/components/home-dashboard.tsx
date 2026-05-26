import Link from "next/link";
import { type Handedness, type HomeAmendRaceTarget } from "@/components/home-amend-race-details";
import {
  HomeNextRaceTallyPanel,
  type HomeBoatTallyPanelRow,
  type HomeTalliedAfloatListItem,
} from "@/components/home-next-race-tally";
import { HomeBoatRaceResultsTable } from "@/components/home-boat-race-results-table";
import { HomeRecentRaceResultsTable } from "@/components/home-recent-race-results-table";
import { HomeTrackNotificationsBanner } from "@/components/sailing-analysis/home-track-notifications-banner";
import { fetchHomeBoatRaceResults } from "@/lib/home-boat-race-results";
import { fetchHomeRecentRaceResults } from "@/lib/home-recent-race-results";
import type { CrewTemplate } from "@/lib/boat-crew";
import { resolveEffectiveCrewTemplate } from "@/lib/boat-crew";
import { fleetStartUtcMs, homeFeaturedRaceVisibleUntilMs } from "@/lib/tally-window";
import {
  formatClubDdMmmYyyyFromIso,
  formatClubDdMmmYyyyHmFromIso,
  formatClubHmFromIso,
} from "@/lib/club-display-format";
import { clubTodayYmd, clubWallYmdFromUtcMs, resolveClubIanaTimeZone } from "@/lib/club-time";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchHomeTrackNotifications } from "@/lib/home-track-notifications";
import {
  fleetMatchByRaceBoat,
  fleetStartOffsetMinutesByRaceBoat,
  type RaceBoatFleetMatch,
} from "@/lib/race-boat-fleet-start-offset";
import { resolveClubClassFlagsForRaceFleets } from "@/lib/resolve-race-fleet-class-flags";
import { buildPursuitTallySlotDisplays } from "@/lib/build-pursuit-tally-slots";
import { loadPursuitSlotsForRace, pursuitClassStartAtByKey } from "@/lib/pursuit-slots-server";
import { normalizeRaceType } from "@/lib/race-type";
import type { PursuitTallySlotDisplay } from "@/components/home-next-race-tally";
import { wallTimeMs } from "@/lib/wall-time";

export type HomeDashboardQuery =
  | {
      error?: string;
      tallyAfloat?: boolean;
      tallyAshore?: boolean;
      detailsSaved?: boolean;
      outcomeSaved?: boolean;
    }
  | undefined;

function formatOutcomeDisplay(code?: string | null) {
  if (!code?.trim()) return "—";
  const m: Record<string, string> = {
    finished: "Finished",
    retired: "Retired",
    dnf: "DNF",
    dns: "DNS",
    dnc: "DNC",
    dsq: "DSQ",
    ocs: "OCS",
  };
  return m[code] ?? code;
}

function homeBoatTypeDisplay(
  className: string | null | undefined,
  ryaClassKey: string | null | undefined,
  classDisplayByKey: Map<string, string>,
): string {
  const cn = className?.trim();
  if (cn) return cn;
  const key = ryaClassKey?.trim();
  if (key) return classDisplayByKey.get(key) ?? key;
  return "—";
}

function homeSailNumberDisplay(
  sailOverride: string | null | undefined,
  defaultSail: string | null | undefined,
): string {
  const s = (sailOverride?.trim() || defaultSail?.trim() || "").trim();
  return s || "—";
}

function parseHandedness(raw: string | null | undefined): Handedness {
  if (raw === "single" || raw === "double" || raw === "triple_plus") return raw;
  return "single";
}

function crewFieldsFromEffective(
  effective: CrewTemplate,
  handedness: Handedness,
): Omit<
  HomeAmendRaceTarget,
  | "groupId"
  | "seriesId"
  | "raceId"
  | "raceTitle"
  | "raceEntryId"
  | "sailNumberOverride"
  | "hasCrewOverride"
> {
  const helm = effective.helm;
  const c1 = effective.crew[0];
  const c2 = effective.crew[1];
  return {
    handedness,
    helmUseOwner: helm.use_account_owner,
    helmName: helm.contact_name ?? "",
    helmPhone: helm.contact_phone ?? "",
    c1UseOwner: c1?.use_account_owner ?? false,
    c1Name: c1?.contact_name ?? "",
    c1Phone: c1?.contact_phone ?? "",
    c2UseOwner: c2?.use_account_owner ?? false,
    c2Name: c2?.contact_name ?? "",
    c2Phone: c2?.contact_phone ?? "",
  };
}

function buildAmendContext(
  groupId: string,
  seriesId: string,
  raceId: string,
  raceTitle: string,
  entry: {
    id: string;
    sail_number_override: string | null;
    crew_template_override: unknown;
    boat_id: string | null;
  },
  boatsById: Map<string, { handedness: string | null; crew_template: unknown }>,
): { ctx: HomeAmendRaceTarget; crewEditable: boolean } {
  const boat = entry.boat_id ? boatsById.get(entry.boat_id) : undefined;
  const crewEditable = !!entry.boat_id && !!boat;
  const handedness = parseHandedness(boat?.handedness);
  const effective = resolveEffectiveCrewTemplate(entry.crew_template_override, boat?.crew_template ?? null);
  const hasCrewOverride = entry.crew_template_override != null;
  const fields = crewFieldsFromEffective(effective, handedness);
  const ctx: HomeAmendRaceTarget = {
    groupId,
    seriesId,
    raceId,
    raceTitle,
    raceEntryId: entry.id,
    sailNumberOverride: entry.sail_number_override ?? "",
    hasCrewOverride,
    ...fields,
  };
  return { ctx, crewEditable };
}

export async function HomeDashboard({
  userId,
  homeQuery,
}: {
  userId: string;
  homeQuery?: HomeDashboardQuery;
}) {
  const { supabase } = await getServerAuth();

  const [{ data: regRows }, trackNotifications] = await Promise.all([
    supabase.from("series_registrations").select("series_id").eq("user_id", userId),
    fetchHomeTrackNotifications(supabase, userId),
  ]);

  const registeredSeriesIds = [...new Set((regRows ?? []).map((r) => r.series_id))];

  let seriesBase: { seriesId: string; seriesName: string; clubName: string; groupId: string }[] = [];
  let clubTzByGroupId = new Map<string, string>();
  const signupBoatIdsBySeriesId = new Map<string, Set<string>>();

  if (registeredSeriesIds.length > 0) {
    const [{ data: seriesRowsNest }, { data: signupLinkRowsEarly }] = await Promise.all([
      supabase
        .from("series")
        .select(
          `
          id,
          name,
          group_id,
          groups ( id, name, iana_timezone )
        `,
        )
        .in("id", registeredSeriesIds),
      supabase
        .from("series_registration_boats")
        .select("series_id, boat_id")
        .in("series_id", registeredSeriesIds)
        .eq("user_id", userId),
    ]);

    for (const row of signupLinkRowsEarly ?? []) {
      if (!row.series_id || !row.boat_id) continue;
      let st = signupBoatIdsBySeriesId.get(row.series_id);
      if (!st) {
        st = new Set();
        signupBoatIdsBySeriesId.set(row.series_id, st);
      }
      st.add(row.boat_id);
    }

    clubTzByGroupId = new Map<string, string>();
    seriesBase = (seriesRowsNest ?? [])
      .map((raw) => {
        const s = raw as {
          id: string;
          name: string;
          group_id: string;
          groups?:
            | { name?: string | null; iana_timezone?: string | null }
            | ({ name?: string | null; iana_timezone?: string | null } | null)[]
            | null;
        };
        const gid = s.group_id;
        const gRaw = s.groups;
        const gOne = Array.isArray(gRaw) ? gRaw[0] : gRaw;
        const tzResolved =
          gOne && typeof gOne === "object" && gOne !== null && "iana_timezone" in gOne
            ? resolveClubIanaTimeZone((gOne as { iana_timezone?: string | null }).iana_timezone)
            : resolveClubIanaTimeZone(null);
        clubTzByGroupId.set(gid, tzResolved);
        const nm =
          gOne && typeof gOne === "object" && gOne !== null && typeof (gOne as { name?: unknown }).name === "string"
            ? String((gOne as { name: string }).name).trim()
            : "";
        return {
          seriesId: s.id,
          seriesName: s.name,
          groupId: gid,
          clubName: nm.length ? nm : "Club",
        };
      })
      .sort(
        (a, b) =>
          a.clubName.localeCompare(b.clubName, undefined, { sensitivity: "base" }) ||
          a.seriesName.localeCompare(b.seriesName, undefined, { sensitivity: "base" }),
      );
  }

  const seriesIds = seriesBase.map((s) => s.seriesId);

  const homeRenderNowMs = wallTimeMs();
  const HOME_RACE_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
  const HOME_RACE_FOCUS_MAX = 6;

  type FeaturedRaceMeta = {
    raceId: string;
    name: string;
    scheduledAt: string;
    seriesName: string;
    clubName: string | null;
    groupId: string;
    seriesId: string;
    raceType: string;
  };

  let featuredRaceMetas: FeaturedRaceMeta[] = [];

  const lookbackIso = new Date(homeRenderNowMs - HOME_RACE_LOOKBACK_MS).toISOString();
  const featuredRacesQuery =
    seriesIds.length > 0
      ? supabase
          .from("races")
          .select(
            `
        id,
        name,
        scheduled_at,
        race_type,
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
          .limit(400)
      : null;

  const [recentRaceResults, boatRaceResults, featuredRacesResult] = await Promise.all([
    seriesIds.length > 0 ? fetchHomeRecentRaceResults(supabase, userId, seriesIds) : Promise.resolve(null),
    seriesBase.length > 0
      ? fetchHomeBoatRaceResults(supabase, userId, seriesBase, clubTzByGroupId)
      : Promise.resolve([]),
    featuredRacesQuery ?? Promise.resolve({ data: null as null }),
  ]);

  const candRows = featuredRacesResult.data;

  if (seriesIds.length && candRows?.length) {
    const rows = candRows;

    const fleetOffsetCandRequests: {
      raceId: string;
      boatId: string;
      groupId: string;
      seriesId: string;
    }[] = [];
    for (const row of rows) {
        const sraw = row.series;
        const se = Array.isArray(sraw) ? sraw[0] : sraw;
        const gid =
          se && typeof se === "object" && se !== null && "group_id" in se
            ? (se as { group_id: string }).group_id
            : "";
        if (!gid) continue;
        for (const bid of signupBoatIdsBySeriesId.get(row.series_id) ?? []) {
          fleetOffsetCandRequests.push({
            raceId: row.id,
            boatId: bid,
            groupId: gid,
            seriesId: row.series_id,
          });
        }
      }

      const offsetCandByRaceBoat =
        fleetOffsetCandRequests.length > 0
          ? await fleetStartOffsetMinutesByRaceBoat(supabase, fleetOffsetCandRequests)
          : new Map<string, number>();

      type CandRow = (typeof rows)[number];
      const eligible: { scheduledMs: number; row: CandRow }[] = [];
      const todayYmdByClubTz = new Map<string, string>();
      for (const row of rows) {
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
          const fsMs = fleetStartUtcMs(row.scheduled_at, 0);
          visibleUntilMs = homeFeaturedRaceVisibleUntilMs(fsMs, null, null);
        } else {
          for (const bid of bidList) {
            const off = offsetCandByRaceBoat.get(`${row.id}\u0000${bid}`) ?? 0;
            const fsMs = fleetStartUtcMs(row.scheduled_at, off);
            const v = homeFeaturedRaceVisibleUntilMs(fsMs, null, null);
            if (v > visibleUntilMs) visibleUntilMs = v;
          }
        }
        if (homeRenderNowMs < visibleUntilMs) {
          eligible.push({ scheduledMs: new Date(row.scheduled_at).getTime(), row });
        }
      }

      const pastEligible = eligible.filter((e) => e.scheduledMs <= homeRenderNowMs);
      pastEligible.sort((a, b) => b.scheduledMs - a.scheduledMs);

      const futEligible = eligible.filter((e) => e.scheduledMs > homeRenderNowMs);
      futEligible.sort((a, b) => a.scheduledMs - b.scheduledMs);

      const picksOrdered = [...pastEligible, ...futEligible].slice(0, HOME_RACE_FOCUS_MAX);

      featuredRaceMetas = [];
      for (const pick of picksOrdered) {
        const r = pick.row;
        const sraw = r.series;
        const se = Array.isArray(sraw) ? sraw[0] : sraw;
        if (
          se &&
          typeof se === "object" &&
          !Array.isArray(se) &&
          "name" in se &&
          "group_id" in se
        ) {
          const seRow = se as {
            name: string;
            group_id: string;
            groups?: unknown;
          };
          const clubName = (() => {
            const g = seRow.groups;
            if (g == null) return null;
            if (Array.isArray(g)) return (g[0] as { name?: string })?.name ?? null;
            return (g as { name?: string }).name ?? null;
          })();
          const gRaw = seRow.groups;
          const gOne = Array.isArray(gRaw) ? gRaw[0] : gRaw;
          if (gOne && typeof gOne === "object" && gOne !== null && "iana_timezone" in gOne) {
            clubTzByGroupId.set(
              seRow.group_id,
              resolveClubIanaTimeZone((gOne as { iana_timezone?: string | null }).iana_timezone),
            );
          }
          featuredRaceMetas.push({
            raceId: r.id,
            name: r.name,
            scheduledAt: r.scheduled_at,
            seriesName: seRow.name,
            clubName,
            groupId: seRow.group_id,
            seriesId: r.series_id,
            raceType: (r as { race_type?: string }).race_type ?? "handicap",
          });
        }
      }
  }

  const boatsForAmend = new Map<string, { handedness: string | null; crew_template: unknown }>();

  const featuredSeriesUnique = [...new Set(featuredRaceMetas.map((m) => m.seriesId))];
  const signupBoatsBySeriesId = new Map<string, { id: string; label: string }[]>();

  type SignupBoatMeta = {
    label: string;
    class_name: string | null;
    rya_class_key: string | null;
    default_sail_number: string | null;
  };
  const signupBoatMetaById = new Map<string, SignupBoatMeta>();
  const classDisplayByRyaKey = new Map<string, string>();

  if (featuredSeriesUnique.length) {
    const featuredSignupBoatIdSet = new Set<string>();
    for (const sid of featuredSeriesUnique) {
      for (const bid of signupBoatIdsBySeriesId.get(sid) ?? []) {
        featuredSignupBoatIdSet.add(bid);
      }
    }
    if (featuredSignupBoatIdSet.size) {
      const { data: bows } = await supabase
        .from("boats")
        .select("id, label, class_name, rya_class_key, default_sail_number")
        .eq("owner_user_id", userId)
        .in("id", [...featuredSignupBoatIdSet]);
      const ryaKeys = new Set<string>();
      for (const b of bows ?? []) {
        signupBoatMetaById.set(b.id, {
          label: b.label,
          class_name: (b.class_name as string | null) ?? null,
          rya_class_key: (b.rya_class_key as string | null) ?? null,
          default_sail_number: (b.default_sail_number as string | null) ?? null,
        });
        const k = (b.rya_class_key as string | null)?.trim();
        if (k) ryaKeys.add(k);
      }
      if (ryaKeys.size) {
        const { data: catRows } = await supabase
          .from("boat_classes")
          .select("class_key, display_name")
          .in("class_key", [...ryaKeys]);
        for (const r of catRows ?? []) {
          classDisplayByRyaKey.set(r.class_key, r.display_name);
        }
      }
    }

    for (const sid of featuredSeriesUnique) {
      const ids = [...(signupBoatIdsBySeriesId.get(sid) ?? [])];
      signupBoatsBySeriesId.set(
        sid,
        ids
          .map((bid) => ({ id: bid, label: signupBoatMetaById.get(bid)?.label ?? bid }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
      );
    }
  }

  type RaceEntryTallySlice = {
    id: string;
    tally_afloat_at: string | null;
    tally_ashore_at: string | null;
    outcome: string | null;
    sail_number_override: string | null;
    crew_template_override: unknown;
    boat_id: string | null;
    fleet_id: string | null;
  };

  const featuredRaceIdList = featuredRaceMetas.map((m) => m.raceId);
  const featuredEntriesByRaceBoat = new Map<string, RaceEntryTallySlice>();

  if (featuredRaceIdList.length > 0) {
    const { data: entryRowsFeatured } = await supabase
      .from("race_entries")
      .select(
        "id, tally_afloat_at, tally_ashore_at, outcome, sail_number_override, crew_template_override, boat_id, fleet_id, race_id",
      )
      .eq("user_id", userId)
      .in("race_id", featuredRaceIdList);

    const featuredEntryBoats = new Set<string>();
    for (const row of entryRowsFeatured ?? []) {
      const rr = row as {
        id: string;
        race_id: string;
        tally_afloat_at: string | null;
        tally_ashore_at: string | null;
        outcome: string | null;
        sail_number_override: string | null;
        crew_template_override: unknown;
        boat_id: string | null;
        fleet_id: string | null;
      };
      const bk = rr.boat_id ?? "";
      featuredEntriesByRaceBoat.set(`${rr.race_id}\u0000${bk}`, {
        id: rr.id,
        tally_afloat_at: rr.tally_afloat_at,
        tally_ashore_at: rr.tally_ashore_at,
        outcome: rr.outcome,
        sail_number_override: rr.sail_number_override,
        crew_template_override: rr.crew_template_override,
        boat_id: rr.boat_id,
        fleet_id: rr.fleet_id,
      });

      const entryBoat = rr.boat_id;
      if (entryBoat) featuredEntryBoats.add(entryBoat);
    }

    if (featuredEntryBoats.size > 0) {
      const { data: boatsAmendFeatured } = await supabase
        .from("boats")
        .select("id, handedness, crew_template")
        .eq("owner_user_id", userId)
        .in("id", [...featuredEntryBoats]);
      for (const bRow of boatsAmendFeatured ?? []) {
        boatsForAmend.set(bRow.id, { handedness: bRow.handedness, crew_template: bRow.crew_template });
      }
    }
  }

  const featuredOffsetRequests =
    featuredRaceMetas.flatMap((m) =>
      (signupBoatsBySeriesId.get(m.seriesId) ?? []).map((b) => ({
        raceId: m.raceId,
        boatId: b.id,
        groupId: m.groupId,
        seriesId: m.seriesId,
      })),
    ) ?? [];

  const featuredMatchByRaceBoat =
    featuredOffsetRequests.length > 0
      ? await fleetMatchByRaceBoat(supabase, featuredOffsetRequests)
      : new Map<string, RaceBoatFleetMatch>();

  const classFlagByFleetId = new Map<string, string | null>();
  const featuredRaceIdListForFlags = featuredRaceMetas.map((m) => m.raceId);
  if (featuredRaceIdListForFlags.length) {
    const { data: rfRows } = await supabase
      .from("race_fleets")
      .select("id, race_id, name, group_fleet_id")
      .in("race_id", featuredRaceIdListForFlags);
    const raceToGroup = new Map(featuredRaceMetas.map((m) => [m.raceId, m.groupId] as const));
    const fleetsByGroup = new Map<
      string,
      { id: string; name: string; group_fleet_id: string | null }[]
    >();
    for (const rf of rfRows ?? []) {
      const gid = raceToGroup.get(rf.race_id as string);
      if (!gid) continue;
      let list = fleetsByGroup.get(gid);
      if (!list) {
        list = [];
        fleetsByGroup.set(gid, list);
      }
      list.push({
        id: rf.id as string,
        name: String(rf.name ?? ""),
        group_fleet_id: (rf.group_fleet_id as string | null) ?? null,
      });
    }
    const flagResults = await Promise.all(
      [...fleetsByGroup.entries()].map(([gid, sources]) =>
        resolveClubClassFlagsForRaceFleets(supabase, gid, sources),
      ),
    );
    for (const flags of flagResults) {
      for (const [fid, flag] of flags) {
        classFlagByFleetId.set(fid, flag);
      }
    }
  }

  const talliedAfloatByRaceFleetKey = new Map<string, HomeTalliedAfloatListItem[]>();
  const raceMetaById = new Map(featuredRaceMetas.map((m) => [m.raceId, m] as const));

  if (featuredRaceIdList.length > 0) {
    const { data: talliedEntryRows } = await supabase
      .from("race_entries")
      .select("race_id, fleet_id, boat_id, sail_number_override, tally_afloat_at, user_id")
      .in("race_id", featuredRaceIdList)
      .not("tally_afloat_at", "is", null);

    const talliedBoatIds = new Set<string>();
    const talliedUserIds = new Set<string>();
    for (const row of talliedEntryRows ?? []) {
      if (row.boat_id) talliedBoatIds.add(row.boat_id as string);
      if (row.user_id) talliedUserIds.add(row.user_id as string);
    }

    const talliedLabelByBoatId = new Map<string, string>();
    const talliedDefaultSailByBoatId = new Map<string, string | null>();
    const helmNameByUserId = new Map<string, string>();
    const [{ data: talliedBoats }, { data: profs }] = await Promise.all([
      talliedBoatIds.size
        ? supabase
            .from("boats")
            .select("id, label, default_sail_number")
            .in("id", [...talliedBoatIds])
        : Promise.resolve({ data: null }),
      talliedUserIds.size
        ? supabase.from("profiles").select("id, display_name").in("id", [...talliedUserIds])
        : Promise.resolve({ data: null }),
    ]);
    for (const b of talliedBoats ?? []) {
      talliedLabelByBoatId.set(b.id, b.label);
      talliedDefaultSailByBoatId.set(b.id, (b.default_sail_number as string | null) ?? null);
    }
    for (const p of profs ?? []) {
      const name = (p.display_name as string | null)?.trim();
      if (name) helmNameByUserId.set(p.id, name);
    }

    for (const row of talliedEntryRows ?? []) {
      const raceId = row.race_id as string;
      const boatId = row.boat_id as string | null;
      const meta = raceMetaById.get(raceId);
      if (!meta) continue;

      let fleetId = row.fleet_id as string | null;
      if (!fleetId && boatId) {
        fleetId = featuredMatchByRaceBoat.get(`${raceId}\u0000${boatId}`)?.fleetId ?? null;
      }
      const fleetKey = fleetId ?? "";
      const homeTz = clubTzByGroupId.get(meta.groupId) ?? resolveClubIanaTimeZone(null);

      const item: HomeTalliedAfloatListItem = {
        boatLabel: boatId ? (talliedLabelByBoatId.get(boatId) ?? "—") : "—",
        sailDisplay: homeSailNumberDisplay(
          row.sail_number_override as string | null,
          boatId ? talliedDefaultSailByBoatId.get(boatId) : null,
        ),
        helmDisplay: helmNameByUserId.get(row.user_id as string) ?? "—",
        talliedAtDisplay: formatClubHmFromIso(row.tally_afloat_at as string, homeTz),
      };

      const mapKey = `${raceId}\u0000${fleetKey}`;
      let list = talliedAfloatByRaceFleetKey.get(mapKey);
      if (!list) {
        list = [];
        talliedAfloatByRaceFleetKey.set(mapKey, list);
      }
      list.push(item);
    }

    for (const list of talliedAfloatByRaceFleetKey.values()) {
      list.sort((a, b) => a.boatLabel.localeCompare(b.boatLabel, undefined, { sensitivity: "base" }));
    }
  }

  type HomeFeaturedRaceCard = FeaturedRaceMeta & {
    signupBoats: { id: string; label: string }[];
    tallyBoatRows: HomeBoatTallyPanelRow[];
    homeTz: string;
    firstStartDisplay: string;
  };

  const pursuitContextByRaceId = new Map<
    string,
    {
      classStartByKey: Map<string, string>;
      buildSlotsForBoat: (boatId: string, talliedAfloat: boolean) => PursuitTallySlotDisplay[];
    }
  >();

  await Promise.all(
    featuredRaceMetas
      .filter((meta) => normalizeRaceType(meta.raceType) === "pursuit")
      .map(async (meta) => {
        const homeTz = clubTzByGroupId.get(meta.groupId) ?? resolveClubIanaTimeZone(null);
        const [slots, classStartByKey, { data: raceEntries }] = await Promise.all([
          loadPursuitSlotsForRace(supabase, meta.raceId),
          pursuitClassStartAtByKey(supabase, meta.raceId),
          supabase
            .from("race_entries")
            .select("boat_id, sail_number_override, tally_afloat_at")
            .eq("race_id", meta.raceId),
        ]);

        const entriesByClassKey = new Map<string, { sailDisplay: string; talliedAfloat: boolean }[]>();
        for (const e of raceEntries ?? []) {
          const boatId = e.boat_id as string | null;
          if (!boatId) continue;
          const boatMeta = signupBoatMetaById.get(boatId);
          const ck = boatMeta?.rya_class_key?.trim();
          if (!ck) continue;
          const sail = homeSailNumberDisplay(
            e.sail_number_override as string | null,
            boatMeta?.default_sail_number ?? null,
          );
          const list = entriesByClassKey.get(ck) ?? [];
          list.push({ sailDisplay: sail, talliedAfloat: !!e.tally_afloat_at });
          entriesByClassKey.set(ck, list);
        }

        pursuitContextByRaceId.set(meta.raceId, {
          classStartByKey,
          buildSlotsForBoat: (boatId, talliedAfloat) => {
            const ck = signupBoatMetaById.get(boatId)?.rya_class_key?.trim() ?? null;
            return buildPursuitTallySlotDisplays({
              slots,
              clubTz: homeTz,
              viewerClassKey: ck,
              viewerTalliedAfloat: talliedAfloat,
              entriesByClassKey,
            });
          },
        });
      }),
  );

  const featuredForHome: HomeFeaturedRaceCard[] = featuredRaceMetas.map((meta) => {
    const signupBoats = signupBoatsBySeriesId.get(meta.seriesId) ?? [];
    const homeTz = clubTzByGroupId.get(meta.groupId) ?? resolveClubIanaTimeZone(null);

    const pursuitCtx = pursuitContextByRaceId.get(meta.raceId);

    const tallyBoatRows: HomeBoatTallyPanelRow[] = signupBoats.map((b) => {
      const entry = featuredEntriesByRaceBoat.get(`${meta.raceId}\u0000${b.id}`) ?? null;
      const fleetMatch = featuredMatchByRaceBoat.get(`${meta.raceId}\u0000${b.id}`);
      const fleetOff = fleetMatch?.offsetMinutes ?? 0;
      const fleetId = fleetMatch?.fleetId ?? null;
      const boatMeta = signupBoatMetaById.get(b.id);
      const classKey = boatMeta?.rya_class_key?.trim() ?? "";
      let classStartDisplay = "—";
      if (pursuitCtx && classKey) {
        const startIso = pursuitCtx.classStartByKey.get(classKey);
        if (startIso) classStartDisplay = formatClubHmFromIso(startIso, homeTz);
      } else {
        const classStartMs = fleetStartUtcMs(meta.scheduledAt, fleetOff);
        classStartDisplay = formatClubHmFromIso(new Date(classStartMs).toISOString(), homeTz);
      }
      const amendDetails =
        entry?.id && entry.boat_id
          ? (() => {
              const amend = buildAmendContext(
                meta.groupId,
                meta.seriesId,
                meta.raceId,
                meta.name,
                entry,
                boatsForAmend,
              );
              return { ctx: amend.ctx, crewEditable: amend.crewEditable };
            })()
          : null;
      const afloatRecorded = !!entry?.tally_afloat_at;
      return {
        boatId: b.id,
        label: b.label,
        boatTypeDisplay: homeBoatTypeDisplay(
          boatMeta?.class_name,
          boatMeta?.rya_class_key,
          classDisplayByRyaKey,
        ),
        sailNumberDisplay: homeSailNumberDisplay(
          entry?.sail_number_override,
          boatMeta?.default_sail_number,
        ),
        fleetOffsetMinutes: fleetOff,
        tally_afloat_at: entry?.tally_afloat_at ?? null,
        tally_ashore_at: entry?.tally_ashore_at ?? null,
        outcome: entry?.outcome ?? null,
        afloatLoggedDisplay: formatClubDdMmmYyyyHmFromIso(entry?.tally_afloat_at ?? null, homeTz),
        ashoreLoggedDisplay: formatClubDdMmmYyyyHmFromIso(entry?.tally_ashore_at ?? null, homeTz),
        outcomeSummaryDisplay: formatOutcomeDisplay(entry?.outcome),
        amendDetails,
        fleetId,
        fleetName: fleetMatch?.fleetName ?? null,
        clubClassFlag: fleetId ? (classFlagByFleetId.get(fleetId) ?? null) : null,
        classStartDisplay,
        talliedAfloatList: talliedAfloatByRaceFleetKey.get(`${meta.raceId}\u0000${fleetId ?? ""}`) ?? [],
        pursuitTallySlots: pursuitCtx
          ? pursuitCtx.buildSlotsForBoat(b.id, afloatRecorded)
          : undefined,
      };
    });

    const fleetOffsets = tallyBoatRows.map((r) => r.fleetOffsetMinutes);
    const minFleetOff = fleetOffsets.length ? Math.min(...fleetOffsets) : 0;
    const firstStartMs = fleetStartUtcMs(meta.scheduledAt, minFleetOff);
    const firstStartDisplay = formatClubHmFromIso(new Date(firstStartMs).toISOString(), homeTz);

    return {
      ...meta,
      signupBoats,
      tallyBoatRows,
      homeTz,
      firstStartDisplay,
    };
  });

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">Home</h1>
          <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
            Today&apos;s tally is first; latest race results follow. Series signups stay on{" "}
            <Link href="/groups" className="font-medium text-splice-blue dark:text-splice-water">
              My Entries
            </Link>
            .
          </p>
        </div>

        {homeQuery?.error ? (
          <p
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {homeQuery.error}
          </p>
        ) : null}

        {homeQuery?.detailsSaved ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Race entry details saved.
          </p>
        ) : null}

        {homeQuery?.outcomeSaved ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Race outcome saved.
          </p>
        ) : null}

        <HomeTrackNotificationsBanner items={trackNotifications} />

        <section className="rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
            Today&apos;s tally board
          </h2>
          {featuredForHome.length ? (
            <div className="mt-4 space-y-10">
              {featuredForHome.map((fr) => (
                <div
                  key={fr.raceId}
                  className="border-t border-splice-foam pt-8 first:mt-3 first:border-none first:pt-0 dark:border-splice-navy-light"
                >
                  <div className="text-sm">
                    <p className="text-splice-ocean tabular-nums dark:text-splice-water">
                      {[fr.clubName, fr.seriesName, fr.name]
                        .filter((part): part is string => !!part?.trim())
                        .join(" · ")}
                      {" · "}
                      {formatClubDdMmmYyyyFromIso(fr.scheduledAt, fr.homeTz)}
                      {" · First start "}
                      {fr.firstStartDisplay}
                    </p>

                    {fr.signupBoats.length === 0 ? (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                        Add at least one boat to this series signup on{" "}
                        <Link
                          href={`/groups#club-${fr.groupId}`}
                          className="font-medium text-splice-ocean underline dark:text-splice-sky"
                        >
                          Series schedule
                        </Link>{" "}
                        for this club before tally or crew details will work for this race.
                      </p>
                    ) : null}

                    <HomeNextRaceTallyPanel
                      groupId={fr.groupId}
                      seriesId={fr.seriesId}
                      raceId={fr.raceId}
                      scheduledAtIso={fr.scheduledAt}
                      nowMs={homeRenderNowMs}
                      boatRows={fr.tallyBoatRows}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">
              {seriesIds.length
                ? "No races scheduled for today at your clubs are in tally focus right now — future fixtures stay on My Entries."
                : "Register for a series to see tally here on race days."}
            </p>
          )}

          <h3 className="mb-2 mt-10 text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
            My latest race results
          </h3>
          {recentRaceResults ? (
            <HomeRecentRaceResultsTable results={recentRaceResults} />
          ) : (
            <p className="text-sm text-splice-ocean dark:text-splice-water">
              No recorded race finishes in your series yet. When a race officer logs finishes, the latest race ranking
              appears here.
            </p>
          )}

          <h3 className="mb-2 mt-10 text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
            My boat race results
          </h3>
          {boatRaceResults.length > 0 ? (
            <HomeBoatRaceResultsTable groups={boatRaceResults} />
          ) : (
            <p className="text-sm text-splice-ocean dark:text-splice-water">
              No boat results in your series yet. When a boat on your series signup has recorded race finishes, each
              race appears here grouped by series.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
