import Link from "next/link";
import {
  HomeAmendRaceDetailsButton,
  type Handedness,
  type HomeAmendRaceTarget,
} from "@/components/home-amend-race-details";
import { HomeNextRaceTallyPanel, type HomeBoatTallyPanelRow } from "@/components/home-next-race-tally";
import type { CrewTemplate } from "@/lib/boat-crew";
import { resolveEffectiveCrewTemplate } from "@/lib/boat-crew";
import { fleetStartUtcMs, homeFeaturedRaceVisibleUntilMs } from "@/lib/tally-window";
import {
  formatClubDdMmmYyyyFromIso,
  formatClubDdMmmYyyyHmFromIso,
  formatClubDdMmmYyyyHmsFromIso,
  formatClubHmFromIso,
} from "@/lib/club-display-format";
import {
  clubTodayYmd,
  clubWallYmdFromUtcMs,
  formatClubDateMedium,
  resolveClubIanaTimeZone,
} from "@/lib/club-time";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fleetStartOffsetMinutesByRaceBoat } from "@/lib/race-boat-fleet-start-offset";
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
    dsq: "DSQ",
    ocs: "OCS",
  };
  return m[code] ?? code;
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

  const [{ data: regRows }, finishQueryResult] = await Promise.all([
    supabase.from("series_registrations").select("series_id").eq("user_id", userId),
    supabase
      .from("race_entries")
      .select(
        `
        id,
        boat_id,
        sail_number_override,
        crew_template_override,
        race_finishes!inner ( id, official_finish_at ),
        races!inner (
          id,
          name,
          scheduled_at,
          results_final,
          series_id,
          series (
            group_id,
            groups ( name, iana_timezone ),
            name
          )
        )
      `,
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(12),
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
  };

  let featuredRaceMetas: FeaturedRaceMeta[] = [];

  if (seriesIds.length) {
    const lookbackIso = new Date(homeRenderNowMs - HOME_RACE_LOOKBACK_MS).toISOString();
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

    const candRaceIds = (candRows ?? []).map((r) => r.id);
    if (candRaceIds.length) {
      const rows = candRows ?? [];

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
          });
        }
      }
    }
  }

  const finishEntryRows = finishQueryResult.data;

  type FinishRow = {
    raceId: string;
    groupId: string;
    seriesId: string;
    raceName: string;
    scheduledAt: string;
    seriesName: string | undefined;
    clubName: string | null;
    officialFinishAt: string;
    resultsFinal: boolean;
    entry: {
      id: string;
      sail_number_override: string | null;
      crew_template_override: unknown;
      boat_id: string | null;
    };
  };

  const finishRows: FinishRow[] = (finishEntryRows ?? [])
    .map((e) => {
      const rawR = e.races;
      const race = Array.isArray(rawR) ? rawR[0] : rawR;
      const rawF = e.race_finishes;
      const fin = Array.isArray(rawF) ? rawF[0] : rawF;
      if (!race || typeof race !== "object" || !fin || typeof fin !== "object") return null;
      const ra = race as {
        id: string;
        name: string;
        scheduled_at: string;
        results_final: boolean | null;
        series_id: string;
        series:
          | {
              name: string;
              group_id: string;
              groups: { name: string } | { name: string }[] | null;
            }
          | {
              name: string;
              group_id: string;
              groups: { name: string } | { name: string }[] | null;
            }[]
          | null;
      };
      const sraw = ra.series;
      const se = Array.isArray(sraw) ? sraw[0] : sraw;
      const clubName = (() => {
        if (!se || typeof se !== "object") return null;
        const g = se.groups;
        if (!g) return null;
        return Array.isArray(g) ? g[0]?.name : g.name;
      })();

      const seriesId = ra.series_id;
      const groupId =
        se && typeof se === "object" && !Array.isArray(se) && "group_id" in se
          ? (se as { group_id: string }).group_id
          : "";

      if (groupId && se && typeof se === "object" && !Array.isArray(se)) {
        const g = (se as { groups?: unknown }).groups;
        const gOne = Array.isArray(g) ? g[0] : g;
        if (gOne && typeof gOne === "object" && gOne !== null && "iana_timezone" in gOne) {
          clubTzByGroupId.set(
            groupId,
            resolveClubIanaTimeZone((gOne as { iana_timezone?: string | null }).iana_timezone),
          );
        }
      }

      return {
        raceId: ra.id,
        groupId,
        seriesId,
        raceName: ra.name,
        scheduledAt: ra.scheduled_at,
        seriesName: se && typeof se === "object" && !Array.isArray(se) ? se.name : undefined,
        clubName,
        officialFinishAt: (fin as { official_finish_at: string }).official_finish_at,
        resultsFinal: ra.results_final === true,
        entry: {
          id: String((e as { id: unknown }).id),
          sail_number_override: (e as { sail_number_override?: string | null }).sail_number_override ?? null,
          crew_template_override: (e as { crew_template_override?: unknown }).crew_template_override ?? null,
          boat_id: (e as { boat_id?: string | null }).boat_id ?? null,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null && Boolean(x.groupId));

  const allBoatIds = new Set<string>();
  for (const fr of finishRows) {
    if (fr.entry.boat_id) allBoatIds.add(fr.entry.boat_id);
  }

  let boatsDetailById = new Map<
    string,
    { label: string; handedness: string | null; crew_template: unknown }
  >();
  if (allBoatIds.size) {
    const { data: bts } = await supabase
      .from("boats")
      .select("id, label, handedness, crew_template")
      .eq("owner_user_id", userId)
      .in("id", [...allBoatIds]);
    boatsDetailById = new Map(
      (bts ?? []).map((b) => [
        b.id,
        { label: b.label, handedness: b.handedness ?? null, crew_template: b.crew_template },
      ] as const),
    );
    const missing = [...allBoatIds].filter((id) => !boatsDetailById.has(id));
    if (missing.length) {
      const { data: btsExtra } = await supabase
        .from("boats")
        .select("id, label, handedness, crew_template")
        .eq("owner_user_id", userId)
        .in("id", missing);
      for (const b of btsExtra ?? []) {
        boatsDetailById.set(b.id, {
          label: b.label,
          handedness: b.handedness ?? null,
          crew_template: b.crew_template,
        });
      }
    }
  }

  const boatsForAmend = new Map<string, { handedness: string | null; crew_template: unknown }>();
  for (const [id, v] of boatsDetailById) {
    boatsForAmend.set(id, { handedness: v.handedness, crew_template: v.crew_template });
  }

  const featuredSeriesUnique = [...new Set(featuredRaceMetas.map((m) => m.seriesId))];
  const signupBoatsBySeriesId = new Map<string, { id: string; label: string }[]>();

  if (featuredSeriesUnique.length) {
    const featuredSignupBoatIdSet = new Set<string>();
    for (const sid of featuredSeriesUnique) {
      for (const bid of signupBoatIdsBySeriesId.get(sid) ?? []) {
        featuredSignupBoatIdSet.add(bid);
      }
    }

    const labelBySignupBoatId = new Map<string, string>();
    if (featuredSignupBoatIdSet.size) {
      const { data: bows } = await supabase
        .from("boats")
        .select("id, label")
        .eq("owner_user_id", userId)
        .in("id", [...featuredSignupBoatIdSet]);
      for (const b of bows ?? []) labelBySignupBoatId.set(b.id, b.label);
    }

    for (const sid of featuredSeriesUnique) {
      const ids = [...(signupBoatIdsBySeriesId.get(sid) ?? [])];
      signupBoatsBySeriesId.set(
        sid,
        ids
          .map((bid) => ({ id: bid, label: labelBySignupBoatId.get(bid) ?? bid }))
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

  const offsetFeaturedByRaceBoat =
    featuredOffsetRequests.length > 0
      ? await fleetStartOffsetMinutesByRaceBoat(supabase, featuredOffsetRequests)
      : new Map<string, number>();

  type HomeFeaturedRaceCard = FeaturedRaceMeta & {
    signupBoats: { id: string; label: string }[];
    tallyBoatRows: HomeBoatTallyPanelRow[];
    boatAmends: {
      boatId: string;
      boatLabel: string;
      ctx: HomeAmendRaceTarget;
      crewEditable: boolean;
    }[];
    fleetStartMsHeader: number;
    earliestFleetStartDisplay: string;
    homeTz: string;
  };

  const featuredForHome: HomeFeaturedRaceCard[] = featuredRaceMetas.map((meta) => {
    const signupBoats = signupBoatsBySeriesId.get(meta.seriesId) ?? [];
    const homeTz = clubTzByGroupId.get(meta.groupId) ?? resolveClubIanaTimeZone(null);

    const tallyBoatRows: HomeBoatTallyPanelRow[] = signupBoats.map((b) => {
      const entry = featuredEntriesByRaceBoat.get(`${meta.raceId}\u0000${b.id}`) ?? null;
      const fleetOff = offsetFeaturedByRaceBoat.get(`${meta.raceId}\u0000${b.id}`) ?? 0;
      return {
        boatId: b.id,
        label: b.label,
        fleetOffsetMinutes: fleetOff,
        tally_afloat_at: entry?.tally_afloat_at ?? null,
        tally_ashore_at: entry?.tally_ashore_at ?? null,
        outcome: entry?.outcome ?? null,
        afloatLoggedDisplay: formatClubDdMmmYyyyHmFromIso(entry?.tally_afloat_at ?? null, homeTz),
        ashoreLoggedDisplay: formatClubDdMmmYyyyHmFromIso(entry?.tally_ashore_at ?? null, homeTz),
        outcomeSummaryDisplay: formatOutcomeDisplay(entry?.outcome),
      };
    });

    const headerOffsets = tallyBoatRows.map((r) => r.fleetOffsetMinutes);
    const minFleetOff = headerOffsets.length ? Math.min(...headerOffsets) : 0;
    const fleetStartMsHeader = fleetStartUtcMs(meta.scheduledAt, minFleetOff);
    const earliestFleetStartDisplay = formatClubDdMmmYyyyHmFromIso(
      new Date(fleetStartMsHeader).toISOString(),
      homeTz,
    );

    const boatAmends = signupBoats
      .map((b) => {
        const entry = featuredEntriesByRaceBoat.get(`${meta.raceId}\u0000${b.id}`);
        if (!entry?.id || !entry.boat_id) return null;
        const amend = buildAmendContext(
          meta.groupId,
          meta.seriesId,
          meta.raceId,
          meta.name,
          entry,
          boatsForAmend,
        );
        return { boatId: b.id, boatLabel: b.label, ctx: amend.ctx, crewEditable: amend.crewEditable };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    return {
      ...meta,
      signupBoats,
      tallyBoatRows,
      boatAmends,
      fleetStartMsHeader,
      earliestFleetStartDisplay,
      homeTz,
    };
  });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Home</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Tally targets races scheduled today in each club&apos;s local calendar date. Recent finishes appear below
            regardless of day — series signups stay on{" "}
            <Link href="/groups" className="font-medium text-blue-600 dark:text-blue-400">
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

        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Today&apos;s races (tally)
          </h2>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Only fixtures with a start time falling on{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">today&apos;s calendar date</span> in that
            club&apos;s timezone appear here — afloat tally closes when your fleet starts; ashore stays open afterward.
          </p>
          {featuredForHome.length ? (
            <div className="mt-4 space-y-10">
              {featuredForHome.map((fr) => (
                <div
                  key={fr.raceId}
                  className="border-t border-zinc-100 pt-8 first:mt-3 first:border-none first:pt-0 dark:border-zinc-800"
                >
                  <div className="text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">{fr.name}</p>
                        <p className="text-zinc-600 dark:text-zinc-400">
                          {fr.seriesName}
                          {fr.clubName ? ` · ${fr.clubName}` : null}
                        </p>
                        <p className="mt-1 text-xs tabular-nums text-zinc-500">
                          {formatClubDdMmmYyyyFromIso(fr.scheduledAt, fr.homeTz)} · Start{" "}
                          {formatClubHmFromIso(fr.scheduledAt, fr.homeTz)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end justify-end gap-2">
                        {fr.boatAmends.map((a) => (
                          <div key={a.boatId} className="flex flex-col items-end gap-0.5">
                            {fr.signupBoats.length > 1 ? (
                              <span className="max-w-[10rem] truncate text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                                {a.boatLabel}
                              </span>
                            ) : null}
                            <HomeAmendRaceDetailsButton ctx={a.ctx} crewEditable={a.crewEditable} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {fr.signupBoats.length === 0 ? (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                        Add at least one boat to this series signup on{" "}
                        <Link
                          href={`/groups/${fr.groupId}/series-entries`}
                          className="font-medium text-blue-700 underline dark:text-blue-300"
                        >
                          Series entries
                        </Link>{" "}
                        for this club before tally or crew details will work for this race.
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Tally afloat independently for each boat on your series signup. Undo only affects that dinghy&apos;s
                        row.
                      </p>
                    )}

                    <HomeNextRaceTallyPanel
                      groupId={fr.groupId}
                      seriesId={fr.seriesId}
                      raceId={fr.raceId}
                      scheduledAtIso={fr.scheduledAt}
                      nowMs={homeRenderNowMs}
                      earliestFleetStartDisplay={fr.earliestFleetStartDisplay}
                      boatRows={fr.tallyBoatRows}
                    />
                    <Link
                      href={`/groups/${fr.groupId}/series/${fr.seriesId}/races/${fr.raceId}`}
                      className="mt-4 inline-block text-xs font-medium text-blue-600 dark:text-blue-400"
                    >
                      Open race →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              {seriesIds.length
                ? "No races scheduled for today at your clubs are in tally focus right now — future fixtures stay on My Entries and race pages."
                : "Register for a series to see tally here on race days."}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Races</h2>

          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Finish results (recorded)
          </h3>
          {!finishRows.length ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No recorded finish times yet. When a race officer logs your finish, it appears here.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Race</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Series / club</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Sail day</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Finish (club)</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300 w-36">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {finishRows.map((r, i) => {
                    const amend = buildAmendContext(r.groupId, r.seriesId, r.raceId, r.raceName, r.entry, boatsForAmend);
                    const rowTz = clubTzByGroupId.get(r.groupId) ?? resolveClubIanaTimeZone(null);
                    return (
                      <tr key={`${r.raceId}-${i}`}>
                        <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">{r.raceName}</td>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                          <span className="text-zinc-800 dark:text-zinc-200">{r.seriesName ?? "—"}</span>
                          {r.clubName ? (
                            <>
                              {" "}
                              <span className="text-zinc-500">· {r.clubName}</span>
                            </>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                          {formatClubDateMedium(r.scheduledAt, rowTz)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">
                          {formatClubDdMmmYyyyHmsFromIso(r.officialFinishAt, rowTz)}
                        </td>
                        <td className="px-3 py-2">
                          <HomeAmendRaceDetailsButton ctx={amend.ctx} crewEditable={amend.crewEditable} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
