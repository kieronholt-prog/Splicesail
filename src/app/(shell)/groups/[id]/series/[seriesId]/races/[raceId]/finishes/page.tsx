import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RoFinishBadges } from "@/components/ro-finish-badges";
import { InfoHint } from "@/components/ui/info-hint";
import { SERIES_PENALTY_OUTCOMES } from "@/lib/finish-outcome-labels";
import { formatClubDdMmmYyyyFromIso, formatClubHmFromIso } from "@/lib/club-display-format";
import { RO_RACE_LINE_NAV_ACTIVE_CLASS, RO_RACE_LINE_NAV_LINK_CLASS } from "@/lib/ro-race-line-nav";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { resolveFleetIdByBoatIdMap } from "@/lib/resolve-fleet-for-boats";
import { fleetStartSignalUtcMs, fleetStartSignalUtcMsByFleetId } from "@/lib/resolve-fleet-start-signal";
import { resolveClubClassFlagsForRaceFleets } from "@/lib/resolve-race-fleet-class-flags";
import { raceTypeUsesPositionalScoring, normalizeRaceType } from "@/lib/race-type";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string; seriesId: string; raceId: string }>;
  searchParams: Promise<{
    error?: string;
    ro_finish?: string;
    official_saved?: string;
    guest_entry_removed?: string;
    guest_ro_finish?: string;
    guest_official_saved?: string;
    guest_mark_started?: string;
    guest_link_confirmed?: string;
  }>;
};

export default async function RaceFinishesPage({ params, searchParams }: Props) {
  const { id: groupId, seriesId, raceId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("id, series_id, name, scheduled_at, results_final, race_type")
    .eq("id", raceId)
    .maybeSingle();

  if (raceErr || !race || race.series_id !== seriesId) notFound();

  const { data: series } = await supabase
    .from("series")
    .select("id, name, group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) notFound();

  const raceType = normalizeRaceType((race as { race_type?: string | null }).race_type);
  const positionalScoring = raceTypeUsesPositionalScoring(raceType);

  const { data: penaltyRows } = await supabase
    .from("series_penalty_rules")
    .select("outcome_code")
    .eq("series_id", seriesId);

  const configuredPenaltyCodes = new Set((penaltyRows ?? []).map((r) => r.outcome_code));
  const nonFinisherStatuses = SERIES_PENALTY_OUTCOMES.filter((o) =>
    configuredPenaltyCodes.has(o.code),
  ).map((o) => ({ code: o.code, label: o.label }));

  const { data: group } = await supabase
    .from("groups")
    .select("name, iana_timezone")
    .eq("id", groupId)
    .maybeSingle();

  const clubTz = resolveClubIanaTimeZone((group as { iana_timezone?: string | null } | null)?.iana_timezone);

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isStaff = me?.role === "club_admin" || me?.role === "race_officer";
  if (!isStaff) {
    redirect(
      `/?error=` +
        encodeURIComponent("Only club admins and race officers can record finishes."),
    );
  }

  const { data: allEntries } = await supabase
    .from("race_entries")
    .select(
      "id, user_id, boat_id, fleet_id, sail_number_override, outcome, started_marked_at, tally_afloat_at, tally_ashore_at",
    )
    .eq("race_id", raceId)
    .order("created_at", { ascending: true });

  const { data: fleetRows } = await supabase
    .from("race_fleets")
    .select(
      "id, name, sort_order, start_offset_minutes, start_signal_at, flag_mode, ics_signal, flag_image_url, group_fleet_id",
    )
    .eq("race_id", raceId)
    .order("sort_order", { ascending: true });

  const classFlagByFleetId =
    fleetRows && fleetRows.length > 0
      ? await resolveClubClassFlagsForRaceFleets(
          supabase,
          groupId,
          fleetRows.map((r) => ({
            id: r.id,
            name: r.name,
            group_fleet_id: r.group_fleet_id ?? null,
          })),
        )
      : new Map<string, string | null>();

  const raceFleetsForBadges =
    fleetRows && fleetRows.length > 0
      ? fleetRows.map((r) => ({
          id: r.id,
          name: r.name,
          startOffsetMinutes: 0,
          flagMode: (r.flag_mode === "image_url" ? "image_url" : "ics") as "ics" | "image_url",
          icsSignal: r.ics_signal ?? null,
          flagImageUrl: r.flag_image_url ?? null,
          clubClassFlag: classFlagByFleetId.get(r.id) ?? null,
        }))
      : [];

  const fleetsForBadges =
    fleetRows?.map((r) => ({
      id: r.id,
      name: r.name,
    })) ?? [];

  const fleetStartMsByFleetId = fleetStartSignalUtcMsByFleetId(
    race.scheduled_at,
    (fleetRows ?? []).map((r) => ({
      id: r.id,
      start_signal_at: r.start_signal_at,
      start_offset_minutes: r.start_offset_minutes,
    })),
  );

  const entryIds = (allEntries ?? []).map((e) => e.id).filter(Boolean);
  const finishByEntryId = new Map<
    string,
    { ro_finish_at: string | null; official_finish_at: string | null; finish_position: number | null }
  >();

  if (entryIds.length) {
    const { data: finishes } = await supabase
      .from("race_finishes")
      .select("race_entry_id, ro_finish_at, official_finish_at, finish_position")
      .in("race_entry_id", entryIds);

    for (const f of finishes ?? []) {
      finishByEntryId.set(f.race_entry_id, {
        ro_finish_at: f.ro_finish_at,
        official_finish_at: f.official_finish_at,
        finish_position: f.finish_position ?? null,
      });
    }
  }

  const entryUserIds = [...new Set((allEntries ?? []).map((e) => e.user_id))];
  const entryBoatIds = [
    ...new Set(
      (allEntries ?? []).map((e) => e.boat_id).filter(Boolean) as string[],
    ),
  ];

  const labelByBoat = new Map<string, string>();
  const boatTypeByBoatId = new Map<string, string>();
  const defaultSailByBoat = new Map<string, string | null>();
  if (entryBoatIds.length) {
    const { data: bts } = await supabase
      .from("boats")
      .select("id, label, rya_class_key, class_name, default_sail_number")
      .in("id", entryBoatIds);
    const keys = new Set<string>();
    for (const b of bts ?? []) {
      labelByBoat.set(b.id, b.label);
      defaultSailByBoat.set(b.id, b.default_sail_number ?? null);
      const k = (b as { rya_class_key?: string | null }).rya_class_key?.trim();
      if (k) keys.add(k);
    }
    const displayByKey = new Map<string, string>();
    if (keys.size) {
      const { data: catRows } = await supabase
        .from("boat_classes")
        .select("class_key, display_name")
        .in("class_key", [...keys]);
      for (const r of catRows ?? []) displayByKey.set(r.class_key, r.display_name);
    }
    for (const b of bts ?? []) {
      const ck = (b as { rya_class_key?: string | null }).rya_class_key?.trim() ?? "";
      const fromCat = ck ? displayByKey.get(ck) : undefined;
      const cn = (b as { class_name?: string | null }).class_name?.trim() ?? "";
      const lbl = labelByBoat.get(b.id) ?? "";
      const boatTypeLabel = (fromCat ?? (cn ? cn : null) ?? (lbl ? lbl : null) ?? "—").trim() || "—";
      boatTypeByBoatId.set(b.id, boatTypeLabel);
    }
  }

  const fleetByBoatId =
    entryBoatIds.length > 0
      ? await resolveFleetIdByBoatIdMap(
          supabase,
          { groupId, seriesId },
          raceId,
          entryBoatIds,
        )
      : new Map<string, string | null>();

  const nameByUser = new Map<string, string | null>();
  if (entryUserIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", entryUserIds);
    for (const p of profs ?? []) nameByUser.set(p.id, p.display_name);
  }

  function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
    if (rel === null || rel === undefined) return null;
    return Array.isArray(rel) ? rel[0] ?? null : rel;
  }

  type NestSail = {
    first_name: string;
    last_name: string;
    group_id: string;
    linked_user_id: string | null;
  };
  type NestBoatGuest = {
    label: string;
    class_name: string | null;
    default_sail_number: string | null;
    rya_class_key: string | null;
    linked_boat_id: string | null;
    club_guest_sailors?: NestSail | NestSail[] | null;
  };
  type GuestEntryJoined = {
    id: string;
    boat_id: string | null;
    fleet_id?: string | null;
    sail_number_override: string | null;
    started_marked_at: string | null;
    adhoc_sail_number: string | null;
    adhoc_rya_class_key: string | null;
    linked_race_entry_id: string | null;
    link_status: string;
    boats?: NestBoatGuest | NestBoatGuest[] | null;
  };

  const [{ data: guestEntryRowsRaw }, { data: adhocClassOptions }] = await Promise.all([
    supabase
      .from("race_guest_entries")
      .select(
        `
      id,
      boat_id,
      fleet_id,
      sail_number_override,
      started_marked_at,
      adhoc_sail_number,
      adhoc_rya_class_key,
      linked_race_entry_id,
      link_status,
      boats!boat_id (
        label,
        class_name,
        default_sail_number,
        rya_class_key,
        linked_boat_id,
        club_guest_sailors ( first_name, last_name, group_id, linked_user_id )
      )
    `,
      )
      .eq("race_id", raceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("boat_classes")
      .select("class_key, display_name")
      .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`)
      .order("display_name", { ascending: true }),
  ]);

  const guestBoatRyClassKeys = new Set<string>();
  const guestEntriesJoined: GuestEntryJoined[] = [];
  for (const row of guestEntryRowsRaw ?? []) {
    const g = row as GuestEntryJoined;
    if (!g.boat_id) {
      const rk = g.adhoc_rya_class_key?.trim();
      if (rk) guestBoatRyClassKeys.add(rk);
      guestEntriesJoined.push(g);
      continue;
    }
    const bn = unwrapOne(g.boats);
    const sn = bn ? unwrapOne(bn.club_guest_sailors) : null;
    if (!bn || !sn || sn.group_id !== groupId) continue;
    const rk = bn.rya_class_key?.trim();
    if (rk) guestBoatRyClassKeys.add(rk);
    guestEntriesJoined.push(g);
  }

  const guestBoatClassLabels = new Map<string, string>();
  if (guestBoatRyClassKeys.size) {
    const { data: gcatRows } = await supabase
      .from("boat_classes")
      .select("class_key, display_name")
      .in("class_key", [...guestBoatRyClassKeys]);
    for (const cr of gcatRows ?? []) guestBoatClassLabels.set(cr.class_key, cr.display_name);
  }

  const guestRaceEntryIdsConnected = guestEntriesJoined.map((e) => e.id).filter(Boolean);
  const guestFinishByEntryId = new Map<
    string,
    { ro_finish_at: string | null; official_finish_at: string | null; finish_position: number | null }
  >();

  if (guestRaceEntryIdsConnected.length) {
    const { data: guestFinRows } = await supabase
      .from("race_guest_finishes")
      .select("race_guest_entry_id, ro_finish_at, official_finish_at, finish_position")
      .in("race_guest_entry_id", guestRaceEntryIdsConnected);
    for (const f of guestFinRows ?? []) {
      guestFinishByEntryId.set(f.race_guest_entry_id, {
        ro_finish_at: f.ro_finish_at,
        official_finish_at: f.official_finish_at,
        finish_position: f.finish_position ?? null,
      });
    }
  }

  const raceScheduledAtIso = race.scheduled_at;

  function fleetStartIsoForFleetId(fleetId: string | null): string | null {
    const fleetMs = fleetId
      ? fleetStartMsByFleetId.get(fleetId)
      : fleetStartSignalUtcMs(raceScheduledAtIso, null);
    return fleetMs != null && Number.isFinite(fleetMs) ? new Date(fleetMs).toISOString() : null;
  }

  const badgeEntriesOfficial = (allEntries ?? []).map((row) => {
    const finish = finishByEntryId.get(row.id);
    const finishAt = finish?.official_finish_at ?? finish?.ro_finish_at ?? null;
    const boatId = row.boat_id;
    const sailOverride = row.sail_number_override?.trim();
    const defaultSail = boatId ? defaultSailByBoat.get(boatId) ?? null : null;
    const sailDisplay = (sailOverride || defaultSail?.trim() || "").trim() || "—";
    const boatTypeLabel = boatId ? boatTypeByBoatId.get(boatId) ?? "—" : "—";
    const helmName = nameByUser.get(row.user_id)?.trim() || "—";
    const fid = row.fleet_id ?? (boatId ? fleetByBoatId.get(boatId) ?? null : null);
    return {
      id: row.id,
      sailDisplay,
      boatTypeLabel,
      helmName,
      fleetId: fid,
      finishAt,
      finishPosition: finish?.finish_position ?? null,
      outcome: row.outcome ?? null,
      tallyAfloatAt: row.tally_afloat_at ?? null,
      tallyAshoreAt: row.tally_ashore_at ?? null,
      startedMarkedAt: row.started_marked_at ?? null,
      fleetStartAtIso: fleetStartIsoForFleetId(fid),
    };
  });

  const badgeEntriesGuests = guestEntriesJoined
    .filter((g) => g.link_status !== "confirmed")
    .map((gRow) => {
      const isAdhoc = !gRow.boat_id;
      const gb = isAdhoc ? null : unwrapOne(gRow.boats);
      const gsail = gb ? unwrapOne(gb.club_guest_sailors) : null;
      const helm = isAdhoc
        ? ""
        : gb && gsail
          ? `${gsail.first_name} ${gsail.last_name}`.trim()
          : "—";
      const boatClassKey = isAdhoc ? gRow.adhoc_rya_class_key?.trim() : gb?.rya_class_key?.trim();
      const fromCatalog = boatClassKey ? guestBoatClassLabels.get(boatClassKey) : undefined;
      const boatTypeLabel = isAdhoc
        ? (fromCatalog ?? boatClassKey ?? "—").trim() || "—"
        : (
            fromCatalog ??
            (gb?.class_name?.trim() ? gb?.class_name ?? "" : null) ??
            (gb?.label?.trim() ? gb?.label ?? "" : null) ??
            "—"
          ).trim() || "—";
      const sailDisplay = isAdhoc
        ? (gRow.adhoc_sail_number ?? "").trim() || "—"
        : (gRow.sail_number_override ?? gb?.default_sail_number ?? "").trim() || "—";
      const gFin = guestFinishByEntryId.get(gRow.id);
      const finishAt = gFin?.official_finish_at ?? gFin?.ro_finish_at ?? null;
      const fid = gRow.fleet_id ?? null;
      const finishPosition = gFin?.finish_position ?? null;
      return {
        id: `guest-${gRow.id}`,
        guestRaceEntryId: gRow.id,
        sailDisplay,
        boatTypeLabel,
        helmName: helm,
        fleetId: fid,
        finishAt,
        finishPosition,
        outcome:
          finishPosition != null || finishAt ? "finished" : null,
        tallyAfloatAt: null,
        tallyAshoreAt: null,
        startedMarkedAt: gRow.started_marked_at ?? null,
        fleetStartAtIso: fleetStartIsoForFleetId(fid),
        badge: isAdhoc ? "+ADDED" : null,
        isAdhocRaceGuest: isAdhoc,
      };
    });

  const badgeEntries = [...badgeEntriesOfficial, ...badgeEntriesGuests];

  const base = `/groups/${groupId}/series/${seriesId}/races/${raceId}`;
  const roDay = `/groups/${groupId}/race-officer`;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-10 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-6xl">
        <header>
          <p className="text-sm text-splice-ocean dark:text-splice-water">
            <Link href={roDay} className="text-splice-blue hover:underline dark:text-splice-water">
              ← Race officer
            </Link>
            <span className="mx-2 text-splice-water">·</span>
            <Link href={`${base}/manage`} className="text-splice-blue hover:underline dark:text-splice-water">
              Start line
            </Link>
            <span className="mx-2 text-splice-water">·</span>
            <Link
              href={`/groups/${groupId}/series/${seriesId}`}
              className="text-splice-blue hover:underline dark:text-splice-water"
            >
              {series.name}
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
            Finishes · {series.name} · {race.name}
          </h1>
          <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
            {group?.name ?? "Club"}
            {" · "}Race day{" "}
            <strong className="tabular-nums text-splice-ocean dark:text-splice-water">
              {formatClubDdMmmYyyyFromIso(race.scheduled_at, clubTz)}
            </strong>
            {" · "}Start{" "}
            <strong className="tabular-nums text-splice-ocean dark:text-splice-water">
              {formatClubHmFromIso(race.scheduled_at, clubTz)}
            </strong>
          </p>

          <nav className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={`${base}/manage`}
              className={RO_RACE_LINE_NAV_LINK_CLASS}
            >
              Start line
            </Link>
            <span className={RO_RACE_LINE_NAV_ACTIVE_CLASS}>
              Finish Line
            </span>
            <Link
              href={`${base}/track-analysis`}
              className={RO_RACE_LINE_NAV_LINK_CLASS}
            >
              Track analysis
            </Link>
            <InfoHint label="About recording finishes">
              {!race.results_final ? (
                <p className="mb-2">
                  {positionalScoring ? (
                    <>
                      <strong className="text-splice-navy-light dark:text-splice-sky">Tap</strong> to record the next finish
                      position. <strong className="text-splice-navy-light dark:text-splice-sky">Double-tap</strong> to edit
                      position or status.
                    </>
                  ) : (
                    <>
                      <strong className="text-splice-navy-light dark:text-splice-sky">Tap</strong> to finish (current time).{" "}
                      <strong className="text-splice-navy-light dark:text-splice-sky">Double-tap</strong> to edit time or
                      status.
                    </>
                  )}{" "}
                  <strong className="text-splice-navy-light dark:text-splice-sky">+ADD BOAT</strong> for a race-only hull.
                </p>
              ) : (
                <p className="mb-2">Results are final — finish badges are read-only.</p>
              )}
              <p>
                {positionalScoring ? (
                  <>Finished boats show a checkered flag and finish position. </>
                ) : (
                  <>Finished boats show a checkered flag and finish time. </>
                )}
                <strong className="text-splice-ocean dark:text-splice-water">Afloat, Ashore, On line</strong> chips are sailor
                tally and RO start-line sighting. Filters narrow the grid.
                {positionalScoring ? null : (
                  <> Times are club local (Club admin settings).</>
                )}{" "}
                Double-tap shows full entry detail.
              </p>
            </InfoHint>
          </nav>
        </header>

        {race.results_final ? (
          <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 dark:bg-amber-950/35 dark:text-amber-100">
            Results marked final — confirm before changing finish times or outcomes.
          </p>
        ) : null}

        {error ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {q.ro_finish === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Finish saved.
          </p>
        ) : null}
        {q.guest_entry_removed === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest boat removed from this race.
          </p>
        ) : null}
        {q.guest_mark_started === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest race entry marked started.
          </p>
        ) : null}
        {q.guest_ro_finish === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest finish saved.
          </p>
        ) : null}
        {q.guest_link_confirmed === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest row linked to an official entry — finish times were copied to the normal results lane.
          </p>
        ) : null}

        <div className="mt-4">
          {!badgeEntries.length && race.results_final ? (
            <p className="text-sm text-splice-ocean dark:text-splice-water">No entries for this race.</p>
          ) : (
            <RoFinishBadges
              groupId={groupId}
              seriesId={seriesId}
              raceId={raceId}
              clubTz={clubTz}
              raceScheduledAtIso={race.scheduled_at}
              entries={badgeEntries}
              fleets={fleetsForBadges}
              raceFleets={raceFleetsForBadges}
              nonFinisherStatuses={nonFinisherStatuses}
              resultsFinal={Boolean(race.results_final)}
              positionalScoring={positionalScoring}
              raceOnlyAdd={
                race.results_final ? null : { classOptions: adhocClassOptions ?? [] }
              }
            />
          )}
        </div>

      </main>
    </div>
  );
}
