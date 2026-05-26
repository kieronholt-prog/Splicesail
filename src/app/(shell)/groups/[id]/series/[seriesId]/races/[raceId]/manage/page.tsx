import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RoFleetStartSignalsPanel } from "@/components/ro-fleet-start-signals-panel";
import { RoRacePresenceButtons, type RoPresenceEntryRow } from "@/components/ro-race-presence-buttons";
import { RoPursuitStartRollingList, type PursuitStartSlotView } from "@/components/ro-pursuit-start-rolling-list";
import { InfoHint } from "@/components/ui/info-hint";
import { formatClubDdMmmYyyyFromIso, formatClubHmFromIso } from "@/lib/club-display-format";
import { RO_RACE_LINE_NAV_ACTIVE_CLASS, RO_RACE_LINE_NAV_LINK_CLASS } from "@/lib/ro-race-line-nav";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { loadPursuitSlotsForRace } from "@/lib/pursuit-slots-server";
import { normalizeRaceType } from "@/lib/race-type";
import { resolveFleetIdByBoatIdMap } from "@/lib/resolve-fleet-for-boats";
import { resolveClubClassFlagsForRaceFleets } from "@/lib/resolve-race-fleet-class-flags";
import { loadSeriesRoAddedStartLineHulls } from "@/lib/series-ro-added-start-line";
import { isRaceOnlyAdhocGuestRow } from "@/lib/ro-added-boat-series";
import { SCORABLE_GUEST_LINK_STATUSES } from "@/lib/scoring/race-guest-scoring";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string; seriesId: string; raceId: string }>;
  searchParams: Promise<{
    error?: string;
    mark_started?: string;
    mark_ocs?: string;
    guest_entry_added?: string;
    guest_mark_started?: string;
    pursuit_saved?: string;
  }>;
};

export default async function RaceManagePage({ params, searchParams }: Props) {
  const { id: groupId, seriesId, raceId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select(
      "id, series_id, name, scheduled_at, results_final, race_type, pursuit_finish_at, pursuit_first_start_at, pursuit_start_increment_seconds, pursuit_group_fleet_id",
    )
    .eq("id", raceId)
    .maybeSingle();

  if (raceErr || !race || race.series_id !== seriesId) notFound();

  const { data: series } = await supabase
    .from("series")
    .select("id, name, group_id, start_sequence")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) notFound();

  const { data: group } = await supabase
    .from("groups")
    .select(
      "name, iana_timezone, ro_added_boats_series_start_line, ro_added_boats_series_standings",
    )
    .eq("id", groupId)
    .maybeSingle();

  const clubTz = resolveClubIanaTimeZone((group as { iana_timezone?: string | null } | null)?.iana_timezone);

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = me?.role === "club_admin";
  const isStaff = me?.role === "club_admin" || me?.role === "race_officer";
  if (!isStaff) {
    redirect(
      `/?error=` +
        encodeURIComponent("Only club admins and race officers can open race management."),
    );
  }

  const raceType = normalizeRaceType(race.race_type);
  const isPursuit = raceType === "pursuit";

  const { data: clubFleetRows } = await supabase
    .from("group_fleets")
    .select("id, name")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: true });

  const { data: adhocClassOptions } = await supabase
    .from("boat_classes")
    .select("class_key, display_name")
    .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`)
    .order("display_name", { ascending: true });

  const { data: fleetRows } = await supabase
    .from("race_fleets")
    .select(
      "id, name, start_offset_minutes, start_signal_at, sort_order, flag_mode, ics_signal, flag_image_url, group_fleet_id",
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

  const fleetsForPanel =
    fleetRows && fleetRows.length > 0
      ? fleetRows.map((r) => ({
          id: r.id,
          name: r.name,
          startOffsetMinutes: r.start_offset_minutes ?? 0,
          startSignalAtIso: r.start_signal_at ?? null,
          flagMode: (r.flag_mode === "image_url" ? "image_url" : "ics") as "ics" | "image_url",
          icsSignal: r.ics_signal ?? null,
          flagImageUrl: r.flag_image_url ?? null,
          clubClassFlag: classFlagByFleetId.get(r.id) ?? null,
        }))
      : [
          {
            id: `${raceId}-ro-default-fleet`,
            name: "Race start",
            startOffsetMinutes: 0,
            flagMode: "ics" as const,
            icsSignal: null,
            flagImageUrl: null,
            clubClassFlag: null,
          },
        ];

  const { data: allEntries } = await supabase
    .from("race_entries")
    .select(
      "id, user_id, boat_id, fleet_id, sail_number_override, outcome, started_marked_at, tally_afloat_at",
    )
    .eq("race_id", raceId)
    .order("created_at", { ascending: true });

  const { data: seriesSignupBoats } = await supabase
    .from("series_registration_boats")
    .select("user_id, boat_id")
    .eq("series_id", seriesId);

  function raceEntryPresenceKey(userId: string, boatId: string | null) {
    return `${userId}\x1f${boatId ?? ""}`;
  }

  const entryKeySet = new Set<string>();
  for (const e of allEntries ?? []) {
    entryKeySet.add(raceEntryPresenceKey(e.user_id, e.boat_id));
  }

  const signupHullsMissingRaceRow = (seriesSignupBoats ?? []).filter(
    (row) => !entryKeySet.has(raceEntryPresenceKey(row.user_id, row.boat_id)),
  );

  const entryUserIds = [...new Set((allEntries ?? []).map((e) => e.user_id))];
  const entryBoatIds = [
    ...new Set(
      (allEntries ?? []).map((e) => e.boat_id).filter(Boolean) as string[],
    ),
  ];
  const signupUserIds = [...new Set(signupHullsMissingRaceRow.map((r) => r.user_id))];
  const signupBoatIds = [...new Set(signupHullsMissingRaceRow.map((r) => r.boat_id))];
  const unionUserIds = [...new Set([...entryUserIds, ...signupUserIds])];
  const unionBoatIds = [...new Set([...entryBoatIds, ...signupBoatIds])];

  const labelByBoat = new Map<string, string>();
  const boatTypeByBoatId = new Map<string, string>();
  const classKeyByBoatId = new Map<string, string>();
  const defaultSailByBoat = new Map<string, string | null>();
  if (unionBoatIds.length) {
    const { data: bts } = await supabase
      .from("boats")
      .select("id, label, rya_class_key, class_name, default_sail_number")
      .in("id", unionBoatIds);
    const keys = new Set<string>();
    for (const b of bts ?? []) {
      labelByBoat.set(b.id, (b.label ?? "").trim());
      defaultSailByBoat.set(b.id, b.default_sail_number ?? null);
      const k = (b as { rya_class_key?: string | null }).rya_class_key?.trim();
      if (k) {
        keys.add(k);
        classKeyByBoatId.set(b.id, k);
      }
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
    unionBoatIds.length > 0
      ? await resolveFleetIdByBoatIdMap(
          supabase,
          { groupId, seriesId },
          raceId,
          unionBoatIds,
        )
      : new Map<string, string | null>();

  const nameByUser = new Map<string, string | null>();
  if (unionUserIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", unionUserIds);
    for (const p of profs ?? []) nameByUser.set(p.id, p.display_name);
  }

  const presenceRowsNormal: RoPresenceEntryRow[] = (allEntries ?? []).map((e) => {
    const helm = nameByUser.get(e.user_id)?.trim() || "—";
    const boatId = e.boat_id;
    const boatType = boatId ? boatTypeByBoatId.get(boatId) ?? "—" : "—";
    const sailOverride = e.sail_number_override?.trim();
    const defaultSail = boatId ? defaultSailByBoat.get(boatId) ?? null : null;
    const sailDisplay = (sailOverride || defaultSail?.trim() || "").trim() || "—";
    return {
      id: e.id,
      label: sailDisplay,
      subtitle: boatType,
      tertiaryLine: helm,
      fleetId: e.fleet_id ?? (boatId ? fleetByBoatId.get(boatId) ?? null : null),
      startedMarkedAt: e.started_marked_at,
      outcome: e.outcome,
      talliedAfloat: !!e.tally_afloat_at,
    };
  });

  const presenceRowsSignup: RoPresenceEntryRow[] = signupHullsMissingRaceRow.map((h) => {
    const helm = nameByUser.get(h.user_id)?.trim() || "—";
    const boatType = boatTypeByBoatId.get(h.boat_id) ?? "—";
    const defaultSail = defaultSailByBoat.get(h.boat_id) ?? null;
    const sailDisplay = (defaultSail?.trim() || "").trim() || "—";
    return {
      id: `signup-${h.user_id}-${h.boat_id}`,
      label: sailDisplay,
      subtitle: boatType,
      tertiaryLine: helm,
      fleetId: fleetByBoatId.get(h.boat_id) ?? null,
      startedMarkedAt: null,
      outcome: null,
      talliedAfloat: false,
      signupPendingRaceEntry: true,
      signupEntrantUserId: h.user_id,
      signupBoatId: h.boat_id,
    };
  });

  const { data: manageGuestRows } = await supabase
    .from("race_guest_entries")
    .select(
      `
      id,
      boat_id,
      sail_number_override,
      adhoc_sail_number,
      adhoc_rya_class_key,
      started_marked_at,
      link_status,
      fleet_id,
      boats!boat_id ( label, class_name, rya_class_key, default_sail_number, club_guest_sailors ( first_name, last_name ) )
    `,
    )
    .eq("race_id", raceId)
    .in("link_status", [...SCORABLE_GUEST_LINK_STATUSES])
    .order("created_at", { ascending: true });

  const guestClassKeys = new Set<string>();
  for (const r of manageGuestRows ?? []) {
    const row = r as {
      boat_id?: string | null;
      adhoc_rya_class_key?: string | null;
      boats?:
        | { rya_class_key?: string | null }
        | { rya_class_key?: string | null }[]
        | null;
    };
    if (!row.boat_id) {
      const k = row.adhoc_rya_class_key?.trim();
      if (k) guestClassKeys.add(k);
    } else {
      const bRaw = row.boats;
      const bOne = bRaw == null ? null : Array.isArray(bRaw) ? bRaw[0] ?? null : bRaw;
      const rk = bOne?.rya_class_key?.trim();
      if (rk) guestClassKeys.add(rk);
    }
  }
  const guestClassLabelByKey = new Map<string, string>();
  if (guestClassKeys.size) {
    const { data: catRows } = await supabase
      .from("boat_classes")
      .select("class_key, display_name")
      .in("class_key", [...guestClassKeys]);
    for (const cr of catRows ?? []) guestClassLabelByKey.set(cr.class_key, cr.display_name);
  }

  function unwrapRel<T>(rel: T | T[] | null | undefined): T | null {
    if (rel == null) return null;
    return Array.isArray(rel) ? rel[0] ?? null : rel;
  }

  const guestClassKeyByPresenceId = new Map<string, string>();

  const presenceRowsGuests: RoPresenceEntryRow[] = (manageGuestRows ?? []).map((raw) => {
    const row = raw as unknown as {
      id: string;
      boat_id: string | null;
      sail_number_override: string | null;
      adhoc_sail_number: string | null;
      adhoc_rya_class_key: string | null;
      started_marked_at: string | null;
      fleet_id?: string | null;
      boats?:
        | {
            label: string;
            class_name?: string | null;
            rya_class_key?: string | null;
            default_sail_number?: string | null;
            club_guest_sailors?:
              | { first_name: string; last_name: string }
              | { first_name: string; last_name: string }[]
              | null;
          }
        | {
            label: string;
            class_name?: string | null;
            rya_class_key?: string | null;
            default_sail_number?: string | null;
            club_guest_sailors?:
              | { first_name: string; last_name: string }
              | { first_name: string; last_name: string }[]
              | null;
          }[]
        | null;
    };

    if (!row.boat_id) {
      const ck = row.adhoc_rya_class_key?.trim() ?? "";
      const cls = (((guestClassLabelByKey.get(ck) ?? ck) || "—").trim() || "—");
      const sail = (row.adhoc_sail_number ?? "").trim() || "—";
      const presenceId = `guest-${row.id}`;
      if (ck) guestClassKeyByPresenceId.set(presenceId, ck);
      return {
        id: presenceId,
        guestRaceEntryId: row.id,
        badge: "RACE ONLY ADDITION (Awaiting Entry)",
        label: sail,
        subtitle: cls,
        tertiaryLine: null,
        fleetId: row.fleet_id ?? null,
        startedMarkedAt: row.started_marked_at,
        outcome: null,
      };
    }

    const bOne = unwrapRel(row.boats);
    const sOne = bOne ? unwrapRel(bOne.club_guest_sailors) : null;
    const helm = sOne ? `${sOne.first_name} ${sOne.last_name}`.trim() : "—";
    const sailOverride = (row.sail_number_override?.trim() || "").trim();
    const defaultSailGuest = (bOne?.default_sail_number ?? "").trim();
    const sailDisplay = (sailOverride || defaultSailGuest || "").trim() || "—";
    const rk = bOne?.rya_class_key?.trim() ?? "";
    const fromCat = rk ? guestClassLabelByKey.get(rk) : undefined;
    const cn = (bOne?.class_name ?? "").trim();
    const boatType = (fromCat ?? (cn ? cn : null) ?? "—").trim() || "—";
    const presenceId = `guest-${row.id}`;
    if (rk) guestClassKeyByPresenceId.set(presenceId, rk);
    return {
      id: presenceId,
      guestRaceEntryId: row.id,
      label: sailDisplay,
      subtitle: boatType,
      tertiaryLine: helm,
      fleetId: null,
      startedMarkedAt: row.started_marked_at,
      outcome: null,
    };
  });

  const roAddedStartLineEnabled = Boolean(
    (group as { ro_added_boats_series_start_line?: boolean | null } | null)
      ?.ro_added_boats_series_start_line,
  );

  const seriesRoAddedHulls = await loadSeriesRoAddedStartLineHulls(supabase, {
    seriesId,
    raceId,
    enabled: roAddedStartLineEnabled,
    currentRaceAdhocRows: (manageGuestRows ?? []).filter((r) =>
      isRaceOnlyAdhocGuestRow(
        r as { boat_id?: string | null; adhoc_sail_number?: string | null; adhoc_rya_class_key?: string | null },
      ),
    ),
  });

  const presenceRowsSeriesRoAdded: RoPresenceEntryRow[] = seriesRoAddedHulls.map((h) => {
    const presenceId = `series-ro-added-${h.classKey}-${h.sailNumber}`;
    guestClassKeyByPresenceId.set(presenceId, h.classKey);
    return {
      id: presenceId,
      label: h.sailNumber,
      subtitle: h.classLabel,
      tertiaryLine: null,
      fleetId: h.fleetId,
      startedMarkedAt: null,
      outcome: null,
      seriesRoAddedPending: true,
      seriesRoAddedSailNumber: h.sailNumber,
      seriesRoAddedClassKey: h.classKey,
      badge: "FROM EARLIER RACE IN SERIES",
    };
  });

  const presenceRows = [
    ...presenceRowsNormal,
    ...presenceRowsSignup,
    ...presenceRowsGuests,
    ...presenceRowsSeriesRoAdded,
  ];

  let pursuitSlotViews: PursuitStartSlotView[] = [];
  if (isPursuit) {
    const slots = await loadPursuitSlotsForRace(supabase, raceId);
    const classToSlot = new Map<string, PursuitStartSlotView>();
    for (const slot of slots) {
      const view: PursuitStartSlotView = {
        slotId: slot.slotId,
        slotIndex: slot.slotIndex,
        startAt: slot.startAt,
        entries: [],
      };
      for (const c of slot.classes) {
        classToSlot.set(c.classKey, view);
      }
      pursuitSlotViews.push(view);
    }

    const assignRowToPursuitSlot = (row: RoPresenceEntryRow, classKey: string | null | undefined) => {
      if (!classKey) return;
      const slotView = classToSlot.get(classKey);
      if (slotView) slotView.entries.push(row);
    };

    for (const row of presenceRowsNormal) {
      const entry = (allEntries ?? []).find((e) => e.id === row.id);
      const boatId = entry?.boat_id as string | null | undefined;
      assignRowToPursuitSlot(row, boatId ? classKeyByBoatId.get(boatId) : null);
    }
    for (const row of presenceRowsSignup) {
      assignRowToPursuitSlot(row, row.signupBoatId ? classKeyByBoatId.get(row.signupBoatId) : null);
    }
    for (const row of presenceRowsGuests) {
      assignRowToPursuitSlot(row, guestClassKeyByPresenceId.get(row.id) ?? null);
    }
  }

  const roFleetsForFilter =
    fleetRows && fleetRows.length > 0
      ? fleetRows.map((r) => ({ id: r.id, name: r.name }))
      : [{ id: `${raceId}-ro-default-fleet`, name: "Race start" }];

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
            <Link href={`/groups/${groupId}/series/${seriesId}`} className="text-splice-blue hover:underline dark:text-splice-water">
              {series.name}
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
            Manage race · {race.name}
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
          {race.results_final ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 dark:bg-amber-950/35 dark:text-amber-100">
              Results marked final — check before changing line outcomes.
            </p>
          ) : null}

          <nav className="mt-4 flex flex-wrap items-center gap-3">
            <span className={RO_RACE_LINE_NAV_ACTIVE_CLASS}>
              Start line
            </span>
            <Link
              href={`${base}/finishes`}
              className={RO_RACE_LINE_NAV_LINK_CLASS}
            >
              Finish Line
            </Link>
            <Link
              href={`${base}/track-analysis`}
              className={RO_RACE_LINE_NAV_LINK_CLASS}
            >
              Track analysis
            </Link>
            {!isPursuit ? (
              <InfoHint label="About start line">
                <p>
                  <strong className="text-splice-navy-light dark:text-splice-sky">One tap</strong>: mark seen on the start
                  line. <strong className="text-splice-navy-light dark:text-splice-sky">Two quick taps</strong>: OCS. One
                  further tap returns to unseen. <strong className="text-splice-navy-light dark:text-splice-sky">+ADD BOAT</strong>{" "}
                  for a race-only hull. Filters narrow the grid.
                </p>
              </InfoHint>
            ) : null}
          </nav>
        </header>

        {error ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {q.mark_started === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Marked on start line.
          </p>
        ) : null}
        {q.mark_ocs === "1" ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
            Marked OCS (on course side).
          </p>
        ) : null}
        {q.guest_entry_added === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Race-only boat added — it appears below as started (green) with a race-only title.
          </p>
        ) : null}
        {q.guest_mark_started === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Guest race entry marked started.
          </p>
        ) : null}

        {isPursuit ? (
          <section className="mt-4">
            <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Pursuit start line</h2>
            <div className="mt-4">
              <RoPursuitStartRollingList
                groupId={groupId}
                seriesId={seriesId}
                raceId={raceId}
                clubTz={clubTz}
                slots={pursuitSlotViews}
                fleets={roFleetsForFilter}
                raceFleets={fleetsForPanel}
                serverNowMs={Date.now()}
              />
            </div>
          </section>
        ) : (
          <>
            <div className="mt-4">
              <RoRacePresenceButtons
                groupId={groupId}
                seriesId={seriesId}
                raceId={raceId}
                entries={presenceRows}
                fleets={roFleetsForFilter}
                raceFleets={fleetsForPanel}
                raceOnlyAdd={race.results_final ? null : { classOptions: adhocClassOptions ?? [] }}
              />
            </div>

            <div className="mt-6">
              <RoFleetStartSignalsPanel
                groupId={groupId}
                seriesId={seriesId}
                raceId={raceId}
                scheduledAtIso={race.scheduled_at}
                displayTimeZone={clubTz}
                startSequenceCode={series.start_sequence}
                fleets={fleetsForPanel}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
