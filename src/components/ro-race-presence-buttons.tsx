"use client";

import {
  addAdhocRaceGuestEntryAction,
  createAdhocRaceGuestFromSeriesRoAddedManageAction,
  markRaceEntryOcsManageAction,
  markRaceEntryStartedManageAction,
  clearRaceEntryStartedManageAction,
  markRaceGuestEntryStartedManageAction,
  staffCreateRaceEntryFromSeriesSignupManageAction,
} from "@/app/actions/ro-finishes";
import {
  ENTRY_STATUS_CHIPS_ROW_W_CLASS,
  RO_ENTRY_BADGE_MIN_H_CLASS,
} from "@/components/entry-tally-started-chips";
import { RoBadgeQuickFilters, type RoBadgeFleetOption, type RoBadgeFilterState } from "@/components/ro-badge-quick-filters";
import { RoPursuitStartLineClock, resolveNextPursuitIntervalStart } from "@/components/ro-pursuit-start-line-clock";
import { RoFleetFlagBadge } from "@/components/ro-fleet-flag-badge";
import type { RoFleetStartRow } from "@/components/ro-fleet-start-signals-panel";
import { wallTimeMs } from "@/lib/wall-time";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

const TAP_GAP_MS = 380;

const PRESENCE_BADGE_BUTTON_CLASS = `relative flex w-full flex-col ${RO_ENTRY_BADGE_MIN_H_CLASS} overflow-hidden rounded-lg border px-2 py-2 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-splice-water disabled:opacity-50`;

/** Race-only banner row — reserved on every tile so heights match. */
const PRESENCE_BANNER_SLOT_CLASS = "mb-1 min-h-[1.375rem] shrink-0";

const PRESENCE_FOOTER_ROW_CLASS =
  "mt-auto min-h-[1.125rem] shrink-0 text-[9px] font-normal uppercase leading-tight tracking-wide text-inherit opacity-70";

export type RoRaceOnlyClassOption = { class_key: string; display_name: string | null };

export type RoPursuitStartSlotGroup = {
  slotId: string;
  timeLabel: string;
  startAtMs: number;
  status: string;
  entryIds: string[];
};

export type RoPresenceEntryRow = {
  id: string;
  /** Sail number (primary). */
  label: string;
  /** Boat type / class (secondary). */
  subtitle?: string | null;
  /** Helm — guest sailors use first + last; members use profile display name (tertiary). */
  tertiaryLine?: string | null;
  /** Assigned race fleet (for filters + class-flag corner). */
  fleetId?: string | null;
  /** Contrast banner for race-only guest rows (see manage page copy). */
  badge?: string | null;
  startedMarkedAt: string | null;
  outcome: string | null;
  /** Member race entry has tally afloat on Home (shown as corner tick on start line). */
  talliedAfloat?: boolean;
  /** When set, taps mark started on this race_guest_entries row (no OCS double-tap). */
  guestRaceEntryId?: string | null;
  /** Hull is on the series signup but there is no `race_entries` row for this race yet — tap creates row + started. */
  signupPendingRaceEntry?: boolean;
  /** When signupPendingRaceEntry, entrant and hull for staff-created race row. */
  signupEntrantUserId?: string;
  signupBoatId?: string;
  /** RO-added adhoc hull from an earlier race in this series — tap creates row for this race. */
  seriesRoAddedPending?: boolean;
  seriesRoAddedSailNumber?: string;
  seriesRoAddedClassKey?: string;
};

/** Same footprint as {@link RoFleetFlagBadge} (h-6 w-6): green tile + white tick for tally afloat. */
function TallyAfloatCornerMark() {
  return (
    <span
      className="pointer-events-none absolute bottom-1.5 right-1.5 z-[1] flex h-6 w-6 items-center justify-center rounded-sm bg-emerald-600 shadow-sm ring-1 ring-inset ring-emerald-900/20 dark:bg-emerald-600 dark:ring-white/20"
      title="Tallied afloat"
      role="img"
      aria-label="Tallied afloat"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="h-3.5 w-3.5 shrink-0"
      >
        <path
          d="M20 6 9 17l-5-5"
          stroke="white"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Same position/size as tally corner mark: red tile + white horizontal rule (no per-race row yet). */
function NoRaceRowCornerMark() {
  return (
    <span
      className="pointer-events-none absolute bottom-1.5 right-1.5 z-[1] flex h-6 w-6 items-center justify-center rounded-sm bg-red-600 shadow-sm ring-1 ring-inset ring-red-900/25 dark:bg-red-600 dark:ring-white/20"
      title="No race row"
      role="img"
      aria-label="No race row"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="h-3.5 w-3.5 shrink-0"
      >
        <path d="M6 12h12" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

type Props = {
  groupId: string;
  seriesId: string;
  raceId: string;
  entries: RoPresenceEntryRow[];
  /** Fleet list for filters (same as Record finishes). */
  fleets: RoBadgeFleetOption[];
  /** Per-fleet visuals for class-flag corner (same source as start signals). */
  raceFleets: RoFleetStartRow[];
  /** When set (and results are not final), shows +ADD BOAT in the grid and a pop-up form. */
  raceOnlyAdd?: { classOptions: RoRaceOnlyClassOption[] } | null;
  /** Pursuit: one filter bar for all start-time slots grouped below. */
  pursuitSlots?: RoPursuitStartSlotGroup[];
  pursuitClubTz?: string;
  pursuitNowMs?: number;
};

export function RoRacePresenceButtons({
  groupId,
  seriesId,
  raceId,
  entries,
  fleets,
  raceFleets,
  raceOnlyAdd,
  pursuitSlots,
  pursuitClubTz,
  pursuitNowMs,
}: Props) {
  const isPursuitLayout = Boolean(pursuitSlots?.length);
  const [addPending, startAddTransition] = useTransition();
  const [rows, setRows] = useState(entries);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<Set<string>>(() => new Set());
  const inFlightRef = useRef(new Set<string>());
  const entriesRef = useRef(entries);
  const rowsRef = useRef(entries);
  const addDialogRef = useRef<HTMLDialogElement>(null);
  const addSubmittingRef = useRef(false);
  const tapRef = useRef<{
    rowId: string | null;
    count: number;
    lastAt: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    rowId: null,
    count: 0,
    lastAt: 0,
    timer: null,
  });

  useEffect(() => {
    entriesRef.current = entries;
    rowsRef.current = entries;
    setRows(entries);
  }, [entries]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const showAddTile = Boolean(raceOnlyAdd);
  const classOptions = raceOnlyAdd?.classOptions ?? [];

  const handleAddRaceOnlySubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (addSubmittingRef.current || addPending) return;
      addSubmittingRef.current = true;
      const formData = new FormData(e.currentTarget);
      startAddTransition(async () => {
        try {
          await addAdhocRaceGuestEntryAction(formData);
        } finally {
          addSubmittingRef.current = false;
        }
      });
    },
    [addPending, startAddTransition],
  );

  const fleetById = useMemo(() => {
    const m = new Map<string, RoFleetStartRow>();
    for (const f of raceFleets) m.set(f.id, f);
    return m;
  }, [raceFleets]);

  const filterables = useMemo(
    () =>
      rows.map((e) => ({
        id: e.id,
        sailDisplay: e.label,
        boatTypeLabel: (e.subtitle ?? "—").trim() || "—",
        helmName: e.tertiaryLine ?? undefined,
        fleetId: e.fleetId ?? null,
      })),
    [rows],
  );

  const ctx = useMemo(
    () => ({ group_id: groupId, series_id: seriesId, race_id: raceId }),
    [groupId, seriesId, raceId],
  );

  const setRowBusy = useCallback((rowId: string, busy: boolean) => {
    if (busy) inFlightRef.current.add(rowId);
    else inFlightRef.current.delete(rowId);
    setInFlight(new Set(inFlightRef.current));
  }, []);

  const revertRows = useCallback(() => {
    setRows(entriesRef.current);
  }, []);

  const applyStarted = useCallback((rowId: string, startedMarkedAt: string, fleetId?: string | null) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              startedMarkedAt,
              outcome: null,
              fleetId: fleetId ?? r.fleetId ?? null,
              signupPendingRaceEntry: false,
            }
          : r,
      ),
    );
  }, []);

  const applyUnseen = useCallback((rowId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, startedMarkedAt: null, outcome: null } : r,
      ),
    );
  }, []);

  const applyOcs = useCallback((rowId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, startedMarkedAt: null, outcome: "ocs" as const } : r,
      ),
    );
  }, []);

  const runRowAction = useCallback(
    async (rowId: string, action: () => Promise<{ error?: string } | { ok: true }>) => {
      if (inFlightRef.current.has(rowId)) return;
      setActionError(null);
      setRowBusy(rowId, true);
      try {
        const res = await action();
        if ("error" in res && res.error) {
          setActionError(res.error);
        }
      } finally {
        setRowBusy(rowId, false);
      }
    },
    [setRowBusy],
  );

  function flushGuestStarted(row: RoPresenceEntryRow) {
    const guestId = row.guestRaceEntryId?.trim() ?? "";
    if (!guestId) return;
    const rowId = row.id;
    const optimisticAt = new Date().toISOString();
    applyStarted(rowId, optimisticAt, row.fleetId);
    void runRowAction(rowId, async () => {
      const res = await markRaceGuestEntryStartedManageAction({
        ...ctx,
        race_guest_entry_id: guestId,
      });
      if ("error" in res) {
        revertRows();
        return res;
      }
      applyStarted(rowId, res.startedMarkedAt, res.fleetId);
      return res;
    });
  }

  function flushTap(rowId: string) {
    const row = rowsRef.current.find((r) => r.id === rowId);
    if (!row) return;

    const st = tapRef.current;
    st.timer = null;
    st.rowId = null;
    const c = st.count;
    st.count = 0;
    const isOcs = row.outcome === "ocs";
    const isSeen = !!row.startedMarkedAt && !isOcs;

    if (c >= 2) {
      if (isOcs) return;
      applyOcs(rowId);
      void runRowAction(rowId, async () => {
        const res = await markRaceEntryOcsManageAction({
          ...ctx,
          race_entry_id: rowId,
        });
        if ("error" in res) {
          revertRows();
          return res;
        }
        applyOcs(rowId);
        return res;
      });
      return;
    }

    if (c === 1) {
      if (isOcs || isSeen) {
        applyUnseen(rowId);
        void runRowAction(rowId, async () => {
          const res = await clearRaceEntryStartedManageAction({
            ...ctx,
            race_entry_id: rowId,
          });
          if ("error" in res) {
            revertRows();
            return res;
          }
          applyUnseen(rowId);
          return res;
        });
        return;
      }

      const optimisticAt = new Date().toISOString();
      applyStarted(rowId, optimisticAt, row.fleetId);
      void runRowAction(rowId, async () => {
        const res = await markRaceEntryStartedManageAction({
          ...ctx,
          race_entry_id: rowId,
        });
        if ("error" in res) {
          revertRows();
          return res;
        }
        applyStarted(rowId, res.startedMarkedAt, res.fleetId);
        return res;
      });
    }
  }

  function flushSeriesRoAddedCreate(row: RoPresenceEntryRow) {
    const sail = row.seriesRoAddedSailNumber?.trim() ?? "";
    const cls = row.seriesRoAddedClassKey?.trim() ?? "";
    if (!sail || !cls || inFlight.has(row.id)) return;

    const rowId = row.id;
    const optimisticAt = new Date().toISOString();
    applyStarted(rowId, optimisticAt, row.fleetId);

    void runRowAction(rowId, async () => {
      const res = await createAdhocRaceGuestFromSeriesRoAddedManageAction({
        ...ctx,
        adhoc_sail_number: sail,
        adhoc_rya_class_key: cls,
      });
      if ("error" in res) {
        revertRows();
        return res;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                id: `guest-${res.guestRaceEntryId}`,
                guestRaceEntryId: res.guestRaceEntryId,
                startedMarkedAt: res.startedMarkedAt,
                fleetId: res.fleetId ?? r.fleetId ?? null,
                seriesRoAddedPending: false,
                badge: "RACE ONLY ADDITION (Awaiting Entry)",
              }
            : r,
        ),
      );
      return res;
    });
  }

  function flushSignupCreate(row: RoPresenceEntryRow) {
    const uid = row.signupEntrantUserId?.trim() ?? "";
    const bid = row.signupBoatId?.trim() ?? "";
    if (!uid || !bid || inFlight.has(row.id)) return;

    const rowId = row.id;
    const optimisticAt = new Date().toISOString();
    applyStarted(rowId, optimisticAt, row.fleetId);

    void runRowAction(rowId, async () => {
      const res = await staffCreateRaceEntryFromSeriesSignupManageAction({
        ...ctx,
        entrant_user_id: uid,
        boat_id: bid,
      });
      if ("error" in res) {
        revertRows();
        return res;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                id: res.raceEntryId,
                startedMarkedAt: res.startedMarkedAt,
                outcome: res.outcome,
                fleetId: res.fleetId ?? r.fleetId ?? null,
                signupPendingRaceEntry: false,
              }
            : r,
        ),
      );
      return res;
    });
  }

  function onPointerUpEntry(row: RoPresenceEntryRow) {
    if (row.seriesRoAddedPending) {
      flushSeriesRoAddedCreate(row);
      return;
    }
    if (row.signupPendingRaceEntry) {
      flushSignupCreate(row);
      return;
    }
    if (row.guestRaceEntryId) {
      flushGuestStarted(row);
      return;
    }
    const rowId = row.id;
    const now = wallTimeMs();
    const st = tapRef.current;
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }

    const sameRow = st.rowId === rowId;
    const withinGap = now - st.lastAt < TAP_GAP_MS;

    if (!sameRow && st.rowId != null && st.count > 0) {
      flushTap(st.rowId);
      st.count = 0;
    }

    if (sameRow && withinGap) st.count += 1;
    else st.count = 1;

    st.rowId = rowId;
    st.lastAt = now;
    st.timer = setTimeout(() => flushTap(rowId), TAP_GAP_MS);
  }

  function renderEntryTile(e: RoPresenceEntryRow, searchHighlighted = false) {
    const seriesRoAddedOnly = Boolean(e.seriesRoAddedPending);
    const signupOnly = Boolean(e.signupPendingRaceEntry);
    const isGuest = Boolean(e.guestRaceEntryId);
    const ocs = !isGuest && e.outcome === "ocs";
    const started = !!e.startedMarkedAt && !ocs;
    const raceOnlyBanner = Boolean(e.badge);
    const showPendingRaceOnlyStyle = raceOnlyBanner && !started;
    const highlightRing = searchHighlighted
      ? "ring-2 ring-splice-blue ring-offset-1 ring-offset-white dark:ring-splice-water dark:ring-offset-splice-navy"
      : "";
    const base = `${PRESENCE_BADGE_BUTTON_CLASS} ${highlightRing}`;
    const visual = showPendingRaceOnlyStyle
      ? "border-violet-400 bg-violet-100 text-violet-950 dark:border-violet-500/70 dark:bg-violet-950/55 dark:text-violet-100"
      : ocs
        ? "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
        : started
          ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100"
          : "border-splice-sky bg-splice-surface text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

    const bannerClass = started
      ? "mb-1 block w-full max-w-full rounded-md border border-emerald-800/40 bg-emerald-950 px-1.5 py-0.5 text-left text-[9px] font-semibold leading-snug text-emerald-50 dark:border-emerald-400/35 dark:bg-emerald-950/90 dark:text-emerald-100"
      : "mb-1 block w-full max-w-full rounded-md bg-violet-800 px-1.5 py-0.5 text-left text-[9px] font-semibold leading-snug text-white dark:bg-violet-300 dark:text-violet-950";

    const fleet = e.fleetId ? fleetById.get(e.fleetId) : undefined;

    if (seriesRoAddedOnly || signupOnly) {
      const pendingVisual = seriesRoAddedOnly
        ? "border-violet-300 bg-violet-50/90 text-violet-950 dark:border-violet-700/70 dark:bg-violet-950/35 dark:text-violet-50"
        : "border-amber-200 bg-amber-50/90 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-50";
      return (
        <li key={e.id} className={`shrink-0 ${ENTRY_STATUS_CHIPS_ROW_W_CLASS}`}>
          <button
            id={`ro-badge-${e.id}`}
            type="button"
            disabled={inFlight.has(e.id)}
            onPointerUp={() => onPointerUpEntry(e)}
            aria-label={
              seriesRoAddedOnly
                ? "Add RO-added boat for this race and mark seen on start line"
                : "Create race entry and mark seen on start line"
            }
            className={`${base} ${pendingVisual}`}
          >
            <div className={PRESENCE_BANNER_SLOT_CLASS}>
              {e.badge ? (
                <span className="mb-1 block w-full max-w-full truncate rounded-md bg-violet-800 px-1.5 py-0.5 text-left text-[9px] font-semibold leading-snug text-white dark:bg-violet-300 dark:text-violet-950">
                  {e.badge}
                </span>
              ) : null}
            </div>
            <div className="flex w-full min-w-0 items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <span className="truncate text-lg font-semibold tabular-nums tracking-tight text-inherit">
                  {e.label}
                </span>
              </div>
              {fleet ? (
                <div className="shrink-0 pt-px">
                  <RoFleetFlagBadge fleet={fleet} />
                </div>
              ) : null}
            </div>
            <span className="truncate text-xs font-medium text-inherit opacity-95">
              {e.subtitle ?? "\u00a0"}
            </span>
            <span className="truncate text-[11px] font-normal text-inherit opacity-85">
              {e.tertiaryLine ?? "\u00a0"}
            </span>
            <span className={`${PRESENCE_FOOTER_ROW_CLASS} block pr-7`} aria-hidden />
            <NoRaceRowCornerMark />
          </button>
        </li>
      );
    }

    return (
      <li key={e.id} className={`shrink-0 ${ENTRY_STATUS_CHIPS_ROW_W_CLASS}`}>
        <button
          id={`ro-badge-${e.id}`}
          type="button"
          disabled={inFlight.has(e.id)}
          onPointerUp={() => onPointerUpEntry(e)}
          className={`${base} ${visual}`}
        >
          <div className={PRESENCE_BANNER_SLOT_CLASS}>
            {e.badge ? (
              <span className={`${bannerClass} block truncate`}>{e.badge}</span>
            ) : null}
          </div>
          <div className="flex w-full min-w-0 items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <span className="truncate text-lg font-semibold tabular-nums tracking-tight text-inherit">
                {e.label}
              </span>
            </div>
            {fleet ? (
              <div className="shrink-0 pt-px">
                <RoFleetFlagBadge fleet={fleet} />
              </div>
            ) : null}
          </div>
          <span className="truncate text-xs font-medium text-inherit opacity-95">
            {e.subtitle ?? "\u00a0"}
          </span>
          <span className="truncate text-[11px] font-normal text-inherit opacity-85">
            {e.tertiaryLine ?? "\u00a0"}
          </span>
          <span className={`${PRESENCE_FOOTER_ROW_CLASS} block truncate ${e.talliedAfloat ? "pr-7" : ""}`}>
            {isGuest
              ? started
                ? "Seen"
                : "Tap — seen on line"
              : ocs
                ? "OCS — tap to clear"
                : started
                  ? "Seen — tap to clear"
                  : "Tap seen · double OCS"}
          </span>
          {e.talliedAfloat ? <TallyAfloatCornerMark /> : null}
        </button>
      </li>
    );
  }

  const badgeListClass = isPursuitLayout ? "mt-3 flex flex-wrap gap-1.5" : "mt-4 flex flex-wrap gap-1.5";

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  function renderTileList(
    visible: RoPresenceEntryRow[],
    searchNav: { highlightId: string | null },
    listClassName = badgeListClass,
  ) {
    return (
      <ul className={listClassName}>
        {visible.map((e) => renderEntryTile(e, searchNav.highlightId === e.id))}
        {showAddTile && !isPursuitLayout ? (
          <li className={`shrink-0 ${ENTRY_STATUS_CHIPS_ROW_W_CLASS}`}>
            <button
              type="button"
              disabled={addPending}
              onClick={() => addDialogRef.current?.showModal()}
              className={`${PRESENCE_BADGE_BUTTON_CLASS} items-start border-dashed border-violet-400 bg-violet-50/90 text-violet-950 shadow-sm hover:bg-violet-100 focus-visible:ring-violet-400 disabled:opacity-50 dark:border-violet-500/70 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/55`}
            >
              <div className={PRESENCE_BANNER_SLOT_CLASS} aria-hidden />
              <span className="inline-flex rounded-md bg-violet-800 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white dark:bg-violet-300 dark:text-violet-950">
                +ADD BOAT
              </span>
              <span className="truncate text-[11px] font-normal text-violet-900/90 dark:text-violet-100/90">
                Race-only — opens form
              </span>
              <span className="truncate text-[11px] font-normal text-violet-900/70 dark:text-violet-100/80">
                {"\u00a0"}
              </span>
              <span className={`${PRESENCE_FOOTER_ROW_CLASS} text-violet-700 dark:text-violet-300`}>
                Tap to add
              </span>
            </button>
          </li>
        ) : null}
      </ul>
    );
  }

  function pursuitSlotHasVisibleEntries(
    slot: RoPursuitStartSlotGroup,
    filteredIds: ReadonlySet<string>,
  ): boolean {
    return slot.entryIds.some((id) => filteredIds.has(id));
  }

  function renderPursuitSlotGroups(
    filteredIds: ReadonlySet<string>,
    searchNav: { highlightId: string | null },
    filtersActive: boolean,
  ) {
    const nextStartAtMs =
      pursuitNowMs != null
        ? resolveNextPursuitIntervalStart(
            (pursuitSlots ?? []).map((s) => ({ startAtMs: s.startAtMs, timeLabel: s.timeLabel })),
            pursuitNowMs,
          )?.startAtMs ?? null
        : null;

    const slots = (pursuitSlots ?? []).filter((slot) =>
      filtersActive ? pursuitSlotHasVisibleEntries(slot, filteredIds) : true,
    );
    let anyVisible = false;

    const groups = slots.map((slot) => {
      const slotRows = slot.entryIds
        .map((id) => rowById.get(id))
        .filter((e): e is RoPresenceEntryRow => !!e && filteredIds.has(e.id));

      if (slotRows.length) anyVisible = true;

      const dueNow = slot.status === "Due now";
      const isNextInterval = nextStartAtMs != null && slot.startAtMs === nextStartAtMs;

      return (
        <section
          key={slot.slotId}
          className={`rounded-xl border p-4 ${
            dueNow
              ? "border-emerald-400 bg-emerald-50/80 dark:border-emerald-700 dark:bg-emerald-950/30"
              : isNextInterval
                ? "border-splice-blue bg-splice-foam ring-2 ring-splice-blue/25 dark:border-splice-water dark:bg-splice-navy-light/40 dark:ring-splice-water/20"
                : "border-splice-sky bg-white dark:border-splice-navy-light dark:bg-splice-navy"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold tabular-nums text-splice-navy dark:text-splice-surface">
              {slot.timeLabel}
            </h3>
            <span
              className={`text-xs font-semibold uppercase tracking-wide ${
                dueNow
                  ? "text-emerald-800 dark:text-emerald-200"
                  : isNextInterval
                    ? "text-splice-blue dark:text-splice-sky"
                    : "text-splice-blue dark:text-splice-water"
              }`}
            >
              {isNextInterval ? "Next interval" : slot.status}
            </span>
          </div>
          {slotRows.length ? (
            renderTileList(slotRows, searchNav)
          ) : (
            <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
              No race entries in this start time yet.
            </p>
          )}
        </section>
      );
    });

    return (
      <>
        {!anyVisible && rows.length > 0 ? (
          <p className="text-sm text-splice-blue dark:text-splice-water">No boats match the current filters.</p>
        ) : null}
        {groups.length ? <div className="mt-4 flex flex-col gap-4">{groups}</div> : null}
      </>
    );
  }

  return (
    <div className="space-y-3">
      {isPursuitLayout && pursuitClubTz && pursuitNowMs != null ? (
        <RoPursuitStartLineClock
          clubTz={pursuitClubTz}
          nowMs={pursuitNowMs}
          slotStarts={(pursuitSlots ?? []).map((s) => ({
            startAtMs: s.startAtMs,
            timeLabel: s.timeLabel,
          }))}
        />
      ) : null}
      {isPursuitLayout ? (
        <p className="mt-3 text-xs text-splice-blue dark:text-splice-water">
          Portrait badges: sail (primary), class (secondary), helm (tertiary). One tap: mark seen on the start line
          (green). Two quick taps: OCS. Tap again to clear. Filters below apply across{" "}
          <strong className="text-splice-navy-light dark:text-splice-sky">all start times</strong>.
        </p>
      ) : null}
      {actionError ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      {!rows.length && !showAddTile ? (
        <p className="text-sm text-splice-ocean dark:text-splice-water">No race entries yet.</p>
      ) : !rows.length && showAddTile ? (
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          No signed-in entries yet — use <strong className="text-splice-navy-light dark:text-splice-sky">+ADD BOAT</strong> for a
          race-only hull.
        </p>
      ) : null}

      {rows.length > 0 || isPursuitLayout ? (
        <RoBadgeQuickFilters fleets={fleets} filterables={filterables}>
          {(filteredIds, searchNav, filterState: RoBadgeFilterState) =>
            isPursuitLayout ? (
              renderPursuitSlotGroups(filteredIds, searchNav, filterState.filtersActive)
            ) : (
              <>
                {renderTileList(
                  rows.filter((e) => filteredIds.has(e.id)),
                  searchNav,
                )}
                {!rows.filter((e) => filteredIds.has(e.id)).length && !showAddTile ? (
                  <p className="text-sm text-splice-blue dark:text-splice-water">
                    No boats match the current filters.
                  </p>
                ) : null}
              </>
            )
          }
        </RoBadgeQuickFilters>
      ) : showAddTile ? (
        <ul className={badgeListClass}>
          <li className={`shrink-0 ${ENTRY_STATUS_CHIPS_ROW_W_CLASS}`}>
            <button
              type="button"
              disabled={addPending}
              onClick={() => addDialogRef.current?.showModal()}
              className={`${PRESENCE_BADGE_BUTTON_CLASS} items-start border-dashed border-violet-400 bg-violet-50/90 text-violet-950 shadow-sm hover:bg-violet-100 focus-visible:ring-violet-400 disabled:opacity-50 dark:border-violet-500/70 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/55`}
            >
              <div className={PRESENCE_BANNER_SLOT_CLASS} aria-hidden />
              <span className="inline-flex rounded-md bg-violet-800 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white dark:bg-violet-300 dark:text-violet-950">
                +ADD BOAT
              </span>
              <span className="truncate text-[11px] font-normal text-violet-900/90 dark:text-violet-100/90">
                Race-only — opens form
              </span>
              <span className="truncate text-[11px] font-normal text-violet-900/70 dark:text-violet-100/80">
                {"\u00a0"}
              </span>
              <span className={`${PRESENCE_FOOTER_ROW_CLASS} text-violet-700 dark:text-violet-300`}>
                Tap to add
              </span>
            </button>
          </li>
        </ul>
      ) : null}

      {showAddTile ? (
        <dialog
          ref={addDialogRef}
          aria-labelledby="ro-add-race-only-title"
          className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-splice-sky bg-white p-0 text-splice-navy shadow-xl backdrop:bg-splice-navy/50 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
        >
          <div className="border-b border-splice-foam px-5 py-4 dark:border-splice-navy-light">
            <h3 id="ro-add-race-only-title" className="text-base font-semibold text-splice-navy dark:text-splice-surface">
              Add race-only boat
            </h3>
            <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
              Sail number and class only — appears on the start line as started with{" "}
              <strong className="text-splice-navy-light dark:text-splice-sky">RACE ONLY ADDITION (Awaiting Entry)</strong> until linked to
              a series signup.
            </p>
          </div>
          <div className="px-5 py-4">
            {classOptions.length ? (
              <form onSubmit={handleAddRaceOnlySubmit} className="flex flex-col gap-4">
                <input type="hidden" name="group_id" value={groupId} />
                <input type="hidden" name="series_id" value={seriesId} />
                <input type="hidden" name="race_id" value={raceId} />
                <input type="hidden" name="return_to" value="manage" />
                <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                  Sail number
                  <input
                    name="adhoc_sail_number"
                    required
                    autoComplete="off"
                    className="mt-1 rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                  Class
                  <select
                    name="adhoc_rya_class_key"
                    required
                    className="mt-1 rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose class…
                    </option>
                    {classOptions.map((c) => (
                      <option key={c.class_key} value={c.class_key}>
                        {c.display_name ?? c.class_key}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={addPending}
                    className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy-light hover:bg-splice-surface disabled:opacity-50 dark:border-splice-ocean dark:text-splice-sky dark:hover:bg-splice-navy-light/80"
                    onClick={() => addDialogRef.current?.close()}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addPending}
                    className="rounded-lg bg-violet-800 px-4 py-2 text-sm font-medium text-white hover:bg-violet-900 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                  >
                    {addPending ? "Adding…" : "Add race-only boat"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-amber-800 dark:text-amber-200/90">
                No boat classes are available for this club yet — add classes in Club admin before recording ad-hoc
                boats.
              </p>
            )}
            {!classOptions.length ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
                  onClick={() => addDialogRef.current?.close()}
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
